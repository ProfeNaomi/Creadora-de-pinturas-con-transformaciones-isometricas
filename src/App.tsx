import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { HelpModal } from './components/HelpModal';
import { LaserDepthPanel, LaserPreviewStyle } from './components/LaserDepthPanel';
import { LaserLeftToolbar, LaserToolMode } from './components/LaserLeftToolbar';
import { LeftToolbar } from './components/LeftToolbar';
import { RightPanel } from './components/RightPanel';
import { TessellationModal } from './components/TessellationModal';
import { TextModal } from './components/TextModal';
import { TopBar } from './components/TopBar';
import {
  AppMode,
  BoardConfig,
  DesignShape,
  GridConfig,
  LaserDepthId,
  MaterialPresetId,
  Matrix2D,
  Point2D,
  PresetId,
  ProjectStateSnapshot,
  RefLine,
  RefObject,
  RefPoint,
  RefVector,
  SavedProjectFile,
  TessellationSpec,
  TextSpec,
  ToolId,
  TransformParams,
  TransformRecord,
  ViewMode,
} from './types/geometry';
import { buildLaserDxfString } from './utils/dxfExport';
import {
  applyFillColorRecursive,
  applyLaserLayerRecursive,
  canGroupShapes,
  canJoinShapes,
  canUngroupShapes,
  cloneDesignShape,
  collectUsedShapeIds,
  groupShapesIntoBlock,
  isShapeJoinableInput,
  joinShapesIntoUnifiedPath,
  toggleShapeClosed,
  uid,
  ungroupBlock,
} from './utils/blocks';
import {
  canSplitShapes,
  splitShapesIntoParts,
  trimShapeAtPoint,
} from './utils/pathSplit';
import {
  buildTransformMatrixForParams,
  formatNum,
  multiplyMatrices,
  recomputeDerivedShapes,
  translationMatrix,
} from './utils/math2d';
import { PRESET_DEFINITIONS } from './utils/presets';
import {
  buildLaserSvgString,
  downloadTextFile,
  exportPaintPng,
} from './utils/svgExport';
import {
  generateTextLocalPathsAsync,
  preloadAllFonts,
} from './utils/textFonts';

function unlinkTransformsForConsumedShapes(
  shapes: DesignShape[],
  transforms: TransformRecord[],
  consumedSet: Set<string>
): { shapes: DesignShape[]; transforms: TransformRecord[] } {
  const brokenTransforms = new Set(
    transforms
      .filter((t) => t.sourceIds.some((sid) => consumedSet.has(sid)))
      .map((t) => t.id)
  );

  const nextShapes = shapes.map((s) =>
    !consumedSet.has(s.id) &&
    s.derivedFrom &&
    brokenTransforms.has(s.derivedFrom.transformId)
      ? { ...s, derivedFrom: undefined }
      : s
  );

  const nextTransforms = transforms
    .filter((t) => !brokenTransforms.has(t.id))
    .map((t) => ({
      ...t,
      createdShapeIds: t.createdShapeIds.filter((cid) => !consumedSet.has(cid)),
    }))
    .filter((t) => t.createdShapeIds.length > 0);

  return { shapes: nextShapes, transforms: nextTransforms };
}

const DEFAULT_BOARD: BoardConfig = {
  widthCm: 20,
  heightCm: 20,
  borderShape: 'rect',
  cornerRadiusCm: 0.8,
  hangingHole: false,
  hangingHoleDiameterMm: 4,
};

const DEFAULT_GRID: GridConfig = {
  step: 0.5,
  showGrid: true,
  showAxes: true,
  showNumbers: true,
  showReferences: true,
  snapToRefPoints: true,
};

const INITIAL_ORIGIN_REF: RefPoint = {
  kind: 'point',
  id: 'ref_origin',
  name: 'O',
  x: 0,
  y: 0,
  visible: true,
  color: '#d97706',
};

const INITIAL_SNAPSHOT: ProjectStateSnapshot = {
  shapes: [],
  refs: [INITIAL_ORIGIN_REF],
  transforms: [],
};

const SHAPE_NAMES: Record<DesignShape['kind'], string> = {
  freehand: 'Trazo',
  dots: 'Punteado',
  segment: 'Segmento',
  curve: 'Curva',
  spline: 'Curva continua',
  circle: 'Círculo',
  ellipse: 'Óvalo',
  polygon: 'Polígono',
  preset: 'Figura',
  tessellation: 'Teselación',
  text: 'Texto',
  path: 'Figura unida',
  group: 'Bloque',
};

export function App() {
  const [board, setBoard] = useState<BoardConfig>(DEFAULT_BOARD);
  const [grid, setGrid] = useState<GridConfig>(DEFAULT_GRID);
  const [viewMode, setViewMode] = useState<ViewMode>('paint');

  const [activeTool, setActiveTool] = useState<ToolId>('select');
  const [activePreset, setActivePreset] = useState<PresetId>('petal');
  const [polygonSides, setPolygonSides] = useState<number>(6);
  const [mirrorSymmetry, setMirrorSymmetry] = useState<number>(1);

  const [snapshot, setSnapshot] = useState<ProjectStateSnapshot>(INITIAL_SNAPSHOT);
  const [undoStack, setUndoStack] = useState<ProjectStateSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectStateSnapshot[]>([]);

  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<DesignShape[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tessellationOpen, setTessellationOpen] = useState(false);
  const [textModal, setTextModal] = useState<{
    open: boolean;
    center: Point2D;
  }>({ open: false, center: { x: 0, y: 0 } });
  const [blockFeedback, setBlockFeedback] = useState<string | null>(null);

  useEffect(() => {
    preloadAllFonts();
  }, []);

  // Modo 2: Clasificación de profundidad láser (Creality CR-Laser Falcon 10W)
  const [appMode, setAppMode] = useState<AppMode>('design');
  const [laserTool, setLaserTool] = useState<LaserToolMode>('select');
  const [activeBrushLayer, setActiveBrushLayer] =
    useState<LaserDepthId>('engrave-deep');
  const [laserPreviewStyle, setLaserPreviewStyle] =
    useState<LaserPreviewStyle>('layers');
  const [materialId, setMaterialId] =
    useState<MaterialPresetId>('plywood-3mm');

  const countersRef = useRef({
    shape: 1,
    group: 1,
    unified: 1,
    point: 1,
    line: 1,
    vector: 1,
    transform: 1,
  });

  const pushHistory = useCallback((current: ProjectStateSnapshot) => {
    setUndoStack((prev) => [...prev.slice(-49), current]);
    setRedoStack([]);
  }, []);

  const commitState = useCallback(
    (updater: (prev: ProjectStateSnapshot) => ProjectStateSnapshot) => {
      setSnapshot((prev) => {
        pushHistory(prev);
        const next = updater(prev);
        return {
          ...next,
          shapes: recomputeDerivedShapes(next.shapes, next.refs, next.transforms),
        };
      });
    },
    [pushHistory]
  );

  const handleUndo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const previous = u[u.length - 1];
      setSnapshot((curr) => {
        setRedoStack((r) => [...r, curr]);
        return previous;
      });
      setSelectedShapeIds([]);
      setSelectedRefId(null);
      return u.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const next = r[r.length - 1];
      setSnapshot((curr) => {
        setUndoStack((u) => [...u, curr]);
        return next;
      });
      setSelectedShapeIds([]);
      setSelectedRefId(null);
      return r.slice(0, -1);
    });
  }, []);

  const nextPointName = () => {
    const letters = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
    const idx = countersRef.current.point - 1;
    countersRef.current.point += 1;
    if (idx < letters.length) return letters[idx];
    return `P${idx + 1}`;
  };

  const handleCreateRefPoint = useCallback(
    (p: Point2D): RefPoint => {
      const existing = snapshot.refs.find(
        (r): r is RefPoint =>
          r.kind === 'point' &&
          Math.abs(r.x - p.x) < 1e-4 &&
          Math.abs(r.y - p.y) < 1e-4
      );
      if (existing) return existing;

      const pt: RefPoint = {
        kind: 'point',
        id: uid('pt'),
        name: nextPointName(),
        x: p.x,
        y: p.y,
        visible: true,
        color: '#d97706',
      };
      commitState((prev) => ({
        ...prev,
        refs: [...prev.refs, pt],
      }));
      return pt;
    },
    [snapshot.refs, commitState]
  );

  const handleCreateRefLine = useCallback(
    (p1: Point2D, p2: Point2D): RefLine => {
      const line: RefLine = {
        kind: 'line',
        id: uid('ln'),
        name: `r${countersRef.current.line++}`,
        p1,
        p2,
        visible: true,
        color: '#d97706',
      };
      commitState((prev) => ({
        ...prev,
        refs: [...prev.refs, line],
      }));
      return line;
    },
    [commitState]
  );

  const handleCreateRefVector = useCallback(
    (from: Point2D, to: Point2D): RefVector => {
      const vec: RefVector = {
        kind: 'vector',
        id: uid('vc'),
        name: `u${countersRef.current.vector++}`,
        from,
        to,
        visible: true,
        color: '#0284c7',
      };
      commitState((prev) => ({
        ...prev,
        refs: [...prev.refs, vec],
      }));
      return vec;
    },
    [commitState]
  );

  const handleQuickAddAxis = useCallback(
    (kind: 'x' | 'y' | 'diag1' | 'diag2' | 'origin'): RefObject => {
      if (kind === 'origin') {
        const existing = snapshot.refs.find(
          (r): r is RefPoint =>
            r.kind === 'point' && Math.abs(r.x) < 1e-4 && Math.abs(r.y) < 1e-4
        );
        if (existing) return existing;
        const pt: RefPoint = {
          kind: 'point',
          id: uid('pt'),
          name: 'O',
          x: 0,
          y: 0,
          visible: true,
          color: '#d97706',
        };
        commitState((prev) => ({ ...prev, refs: [...prev.refs, pt] }));
        return pt;
      }

      const defs: Record<
        'x' | 'y' | 'diag1' | 'diag2',
        { name: string; p1: Point2D; p2: Point2D }
      > = {
        x: { name: 'Eje X', p1: { x: -5, y: 0 }, p2: { x: 5, y: 0 } },
        y: { name: 'Eje Y', p1: { x: 0, y: -5 }, p2: { x: 0, y: 5 } },
        diag1: { name: 'y = x', p1: { x: -5, y: -5 }, p2: { x: 5, y: 5 } },
        diag2: { name: 'y = -x', p1: { x: -5, y: 5 }, p2: { x: 5, y: -5 } },
      };

      const target = defs[kind];
      const existing = snapshot.refs.find(
        (r) => r.kind === 'line' && r.name === target.name
      );
      if (existing) return existing;

      const line: RefLine = {
        kind: 'line',
        id: uid('ln'),
        name: target.name,
        p1: target.p1,
        p2: target.p2,
        visible: true,
        color: '#d97706',
      };
      commitState((prev) => ({ ...prev, refs: [...prev.refs, line] }));
      return line;
    },
    [snapshot.refs, commitState]
  );

  const handleApplyTransform = useCallback(
    (sourceIds: string[], params: TransformParams) => {
      commitState((prev) => {
        const sources = prev.shapes.filter((s) => sourceIds.includes(s.id));
        if (sources.length === 0) return prev;

        const transformId = uid('tr');
        const trNum = countersRef.current.transform++;

        let title = '';
        let summary = '';
        const srcLabel =
          sources.length === 1 ? sources[0].name : `${sources.length} figuras`;

        if (params.type === 'axial') {
          const line = prev.refs.find((r) => r.id === params.lineId);
          title = `Simetría Axial ${trNum}`;
          summary = `SimAxial(${srcLabel}, ${line?.name ?? 'recta'})`;
        } else if (params.type === 'central') {
          const pt = prev.refs.find((r) => r.id === params.pointId);
          title = `Simetría Central ${trNum}`;
          summary = `SimCentral(${srcLabel}, ${pt?.name ?? 'O'})`;
        } else if (params.type === 'rotation') {
          const pt = prev.refs.find((r) => r.id === params.pointId);
          title = `Rotación ${trNum}`;
          summary = `Rotar(${srcLabel}, ${pt?.name ?? 'O'}, ${params.angleDeg ?? 90}°)`;
        } else if (params.type === 'rosette') {
          const pt = prev.refs.find((r) => r.id === params.pointId);
          title = `Rosetón ${trNum}`;
          summary = `Rosetón(${srcLabel}, ${pt?.name ?? 'O'}, ${params.copies ?? 6}×)`;
        } else if (params.type === 'translation') {
          const vec = prev.refs.find((r) => r.id === params.vectorId);
          const vecTxt = vec
            ? vec.name
            : `(${formatNum(params.dx ?? 0)}, ${formatNum(params.dy ?? 0)})`;
          title = `Traslación ${trNum}`;
          summary = `Trasladar(${srcLabel}, ${vecTxt}${
            (params.repeatCount ?? 1) > 1 ? `, ${params.repeatCount}×` : ''
          })`;
        }

        const copiesCount =
          params.type === 'rosette'
            ? Math.max(1, (params.copies ?? 6) - 1)
            : params.type === 'translation'
              ? Math.max(1, params.repeatCount ?? 1)
              : 1;

        const createdShapes: DesignShape[] = [];
        for (let c = 0; c < copiesCount; c++) {
          const opMat = buildTransformMatrixForParams(params, prev.refs, c);
          for (const src of sources) {
            createdShapes.push(
              cloneDesignShape(src, {
                freshIds: true,
                name: `${src.name}'`,
                matrix: multiplyMatrices(opMat, src.matrix),
                visible: true,
                derivedFrom: {
                  transformId,
                  sourceShapeId: src.id,
                  copyIndex: c,
                },
              })
            );
          }
        }

        const record: TransformRecord = {
          id: transformId,
          name: title,
          summary,
          params,
          sourceIds: sources.map((s) => s.id),
          createdShapeIds: createdShapes.map((s) => s.id),
          visible: true,
        };

        const updatedSources = params.keepOriginal
          ? prev.shapes
          : prev.shapes.map((s) =>
              sourceIds.includes(s.id) ? { ...s, visible: false } : s
            );

        return {
          ...prev,
          shapes: [...updatedSources, ...createdShapes],
          transforms: [...prev.transforms, record],
        };
      });
    },
    [commitState]
  );

  const handleCreateShape = useCallback(
    (shapeInput: Omit<DesignShape, 'id' | 'name'>, autoMirror = false) => {
      const baseLabel =
        shapeInput.kind === 'preset' && shapeInput.presetId
          ? PRESET_DEFINITIONS[shapeInput.presetId].label
          : shapeInput.kind === 'text' && shapeInput.textSpec
            ? `Texto "${shapeInput.textSpec.text.trim().split(/\r?\n/)[0].slice(0, 14)}"`
            : SHAPE_NAMES[shapeInput.kind];
      const newShape: DesignShape = {
        ...shapeInput,
        id: uid('sh'),
        name:
          shapeInput.kind === 'text' && shapeInput.textSpec
            ? baseLabel
            : `${baseLabel} ${countersRef.current.shape++}`,
      };

      commitState((prev) => {
        let nextRefs = prev.refs;
        let originPt = prev.refs.find(
          (r): r is RefPoint =>
            r.kind === 'point' && Math.abs(r.x) < 1e-4 && Math.abs(r.y) < 1e-4
        );

        const nextShapes = [...prev.shapes, newShape];
        let nextTransforms = prev.transforms;

        if (autoMirror && mirrorSymmetry > 1) {
          if (!originPt) {
            originPt = {
              kind: 'point',
              id: uid('pt'),
              name: 'O',
              x: 0,
              y: 0,
              visible: true,
              color: '#d97706',
            };
            nextRefs = [...nextRefs, originPt];
          }
          const transformId = uid('tr');
          const trNum = countersRef.current.transform++;
          const params: TransformParams = {
            type: 'rosette',
            pointId: originPt.id,
            copies: mirrorSymmetry,
            keepOriginal: true,
          };
          const copies: DesignShape[] = [];
          for (let c = 0; c < mirrorSymmetry - 1; c++) {
            const opMat = buildTransformMatrixForParams(params, nextRefs, c);
            copies.push(
              cloneDesignShape(newShape, {
                freshIds: true,
                name: `${newShape.name}'`,
                matrix: multiplyMatrices(opMat, newShape.matrix),
                derivedFrom: {
                  transformId,
                  sourceShapeId: newShape.id,
                  copyIndex: c,
                },
              })
            );
          }
          nextShapes.push(...copies);
          nextTransforms = [
            ...nextTransforms,
            {
              id: transformId,
              name: `Espejo Radial ${trNum}`,
              summary: `Rosetón(${newShape.name}, ${originPt.name}, ${mirrorSymmetry}×)`,
              params,
              sourceIds: [newShape.id],
              createdShapeIds: copies.map((c) => c.id),
              visible: true,
            },
          ];
        }

        return {
          ...prev,
          refs: nextRefs,
          shapes: nextShapes,
          transforms: nextTransforms,
        };
      });

      setSelectedShapeIds([newShape.id]);
      setSelectedRefId(null);
    },
    [commitState, mirrorSymmetry]
  );

  const handleBeginDragHistory = useCallback(() => {
    pushHistory(snapshot);
  }, [pushHistory, snapshot]);

  const handleUpdateShapeMatrices = useCallback(
    (updates: { id: string; matrix: Matrix2D }[]) => {
      const map = new Map(updates.map((u) => [u.id, u.matrix]));
      setSnapshot((prev) => {
        const updated = prev.shapes.map((s) =>
          map.has(s.id) ? { ...s, matrix: map.get(s.id)! } : s
        );
        return {
          ...prev,
          shapes: recomputeDerivedShapes(updated, prev.refs, prev.transforms),
        };
      });
    },
    []
  );

  const handleUpdateRefPosition = useCallback((id: string, nextRef: RefObject) => {
    setSnapshot((prev) => {
      const updatedRefs = prev.refs.map((r) => (r.id === id ? nextRef : r));
      return {
        ...prev,
        refs: updatedRefs,
        shapes: recomputeDerivedShapes(prev.shapes, updatedRefs, prev.transforms),
      };
    });
  }, []);

  const handleUpdateRefPointCoords = useCallback(
    (id: string, x: number, y: number) => {
      commitState((prev) => ({
        ...prev,
        refs: prev.refs.map((r) =>
          r.id === id && r.kind === 'point' ? { ...r, x, y } : r
        ),
      }));
    },
    [commitState]
  );

  const handleDeleteShapes = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const rootSet = new Set(ids);
      commitState((prev) => {
        const toDelete = new Set<string>(rootSet);
        let changed = true;
        while (changed) {
          changed = false;
          for (const s of prev.shapes) {
            if (
              s.derivedFrom &&
              toDelete.has(s.derivedFrom.sourceShapeId) &&
              !toDelete.has(s.id)
            ) {
              toDelete.add(s.id);
              changed = true;
            }
          }
        }

        const nextShapes = prev.shapes.filter((s) => !toDelete.has(s.id));
        const nextTransforms = prev.transforms
          .map((t) => ({
            ...t,
            sourceIds: t.sourceIds.filter((sid) => !toDelete.has(sid)),
            createdShapeIds: t.createdShapeIds.filter((cid) => !toDelete.has(cid)),
          }))
          .filter((t) => t.createdShapeIds.length > 0);

        return {
          ...prev,
          shapes: nextShapes,
          transforms: nextTransforms,
        };
      });
      setSelectedShapeIds((sel) => sel.filter((sid) => !rootSet.has(sid)));
    },
    [commitState]
  );

  const handleDeleteShape = useCallback(
    (id: string) => {
      handleDeleteShapes([id]);
    },
    [handleDeleteShapes]
  );

  const handleDeleteRef = useCallback(
    (id: string) => {
      commitState((prev) => {
        // Preserve already-created artwork by unlinking transforms that used this reference
        const affectedTransforms = new Set(
          prev.transforms
            .filter(
              (t) =>
                t.params.lineId === id ||
                t.params.pointId === id ||
                t.params.vectorId === id
            )
            .map((t) => t.id)
        );

        const nextShapes = prev.shapes.map((s) =>
          s.derivedFrom && affectedTransforms.has(s.derivedFrom.transformId)
            ? { ...s, derivedFrom: undefined }
            : s
        );

        return {
          ...prev,
          refs: prev.refs.filter((r) => r.id !== id),
          shapes: nextShapes,
          transforms: prev.transforms.filter((t) => !affectedTransforms.has(t.id)),
        };
      });
      if (selectedRefId === id) setSelectedRefId(null);
    },
    [commitState, selectedRefId]
  );

  const handleDeleteTransform = useCallback(
    (transformId: string) => {
      commitState((prev) => {
        const tr = prev.transforms.find((t) => t.id === transformId);
        if (!tr) return prev;
        const toDelete = new Set(tr.createdShapeIds);
        let changed = true;
        while (changed) {
          changed = false;
          for (const s of prev.shapes) {
            if (
              s.derivedFrom &&
              toDelete.has(s.derivedFrom.sourceShapeId) &&
              !toDelete.has(s.id)
            ) {
              toDelete.add(s.id);
              changed = true;
            }
          }
        }
        // If original was hidden by this transform, restore its visibility
        const nextShapes = prev.shapes
          .filter((s) => !toDelete.has(s.id))
          .map((s) =>
            !tr.params.keepOriginal && tr.sourceIds.includes(s.id)
              ? { ...s, visible: true }
              : s
          );
        return {
          ...prev,
          shapes: nextShapes,
          transforms: prev.transforms.filter((t) => t.id !== transformId),
        };
      });
    },
    [commitState]
  );

  const handleToggleTransformVisible = useCallback(
    (transformId: string) => {
      commitState((prev) => ({
        ...prev,
        transforms: prev.transforms.map((t) =>
          t.id === transformId ? { ...t, visible: !t.visible } : t
        ),
      }));
    },
    [commitState]
  );

  const handleUpdateTransformParam = useCallback(
    (
      transformId: string,
      patch: { angleDeg?: number; copies?: number; repeatCount?: number; keepOriginal?: boolean }
    ) => {
      commitState((prev) => {
        const tr = prev.transforms.find((t) => t.id === transformId);
        if (!tr) return prev;
        const nextParams = { ...tr.params, ...patch };
        let nextShapes = prev.shapes;
        let nextCreatedIds = tr.createdShapeIds;

        // If rosette copy count changed, rebuild copies cleanly
        if (
          nextParams.type === 'rosette' &&
          patch.copies !== undefined &&
          patch.copies !== tr.params.copies
        ) {
          const oldCreated = new Set(tr.createdShapeIds);
          nextShapes = prev.shapes.filter((s) => !oldCreated.has(s.id));
          const sources = nextShapes.filter((s) => tr.sourceIds.includes(s.id));
          const copiesCount = Math.max(1, (patch.copies ?? 6) - 1);
          const created: DesignShape[] = [];
          for (let c = 0; c < copiesCount; c++) {
            const opMat = buildTransformMatrixForParams(nextParams, prev.refs, c);
            for (const src of sources) {
              created.push(
                cloneDesignShape(src, {
                  freshIds: true,
                  name: `${src.name}'`,
                  matrix: multiplyMatrices(opMat, src.matrix),
                  visible: tr.visible,
                  derivedFrom: {
                    transformId: tr.id,
                    sourceShapeId: src.id,
                    copyIndex: c,
                  },
                })
              );
            }
          }
          nextShapes = [...nextShapes, ...created];
          nextCreatedIds = created.map((c) => c.id);
        }

        const ptName =
          prev.refs.find((r) => r.id === nextParams.pointId)?.name ?? 'O';
        const srcLabel =
          tr.sourceIds.length === 1
            ? prev.shapes.find((s) => s.id === tr.sourceIds[0])?.name ?? 'Figura'
            : `${tr.sourceIds.length} figuras`;

        const summary =
          nextParams.type === 'rotation'
            ? `Rotar(${srcLabel}, ${ptName}, ${nextParams.angleDeg ?? 90}°)`
            : nextParams.type === 'rosette'
              ? `Rosetón(${srcLabel}, ${ptName}, ${nextParams.copies ?? 6}×)`
              : tr.summary;

        return {
          ...prev,
          shapes: nextShapes,
          transforms: prev.transforms.map((t) =>
            t.id === transformId
              ? {
                  ...t,
                  params: nextParams,
                  summary,
                  createdShapeIds: nextCreatedIds,
                }
              : t
          ),
        };
      });
    },
    [commitState]
  );

  const handleDuplicateShapes = useCallback(
    (ids: string[]) => {
      const targets = snapshot.shapes.filter((s) => ids.includes(s.id));
      if (targets.length === 0) return;
      const offset = translationMatrix(1, -1);
      const copies = targets.map((target) =>
        cloneDesignShape(target, {
          freshIds: true,
          name: `${target.name} copia`,
          matrix: multiplyMatrices(offset, target.matrix),
          derivedFrom: undefined,
          visible: true,
        })
      );
      commitState((prev) => ({ ...prev, shapes: [...prev.shapes, ...copies] }));
      setSelectedShapeIds(copies.map((c) => c.id));
    },
    [snapshot.shapes, commitState]
  );

  const handleUnlinkShape = useCallback(
    (id: string) => {
      commitState((prev) => {
        const s = prev.shapes.find((x) => x.id === id);
        if (!s?.derivedFrom) return prev;
        const trId = s.derivedFrom.transformId;
        return {
          ...prev,
          shapes: prev.shapes.map((x) =>
            x.id === id ? { ...x, derivedFrom: undefined } : x
          ),
          transforms: prev.transforms
            .map((t) =>
              t.id === trId
                ? {
                    ...t,
                    createdShapeIds: t.createdShapeIds.filter((cid) => cid !== id),
                  }
                : t
            )
            .filter((t) => t.createdShapeIds.length > 0),
        };
      });
    },
    [commitState]
  );

  const handleTranslateSelected = useCallback(
    (dx: number, dy: number) => {
      commitState((prev) => {
        const tMat = translationMatrix(dx, dy);
        return {
          ...prev,
          shapes: prev.shapes.map((s) =>
            selectedShapeIds.includes(s.id) && !s.derivedFrom
              ? { ...s, matrix: multiplyMatrices(tMat, s.matrix) }
              : s
          ),
        };
      });
    },
    [commitState, selectedShapeIds]
  );

  const handleChangeShapeFill = useCallback(
    (ids: string[], fillColor: string) => {
      const idSet = new Set(ids);
      commitState((prev) => ({
        ...prev,
        shapes: prev.shapes.map((s) =>
          idSet.has(s.id) ? applyFillColorRecursive(s, fillColor) : s
        ),
      }));
    },
    [commitState]
  );

  const handleGroupShapes = useCallback(
    (ids?: string[]) => {
      const targetIds = ids ?? selectedShapeIds;
      const targetSet = new Set(targetIds);
      const selectedInOrder = snapshot.shapes.filter(
        (s) => targetSet.has(s.id) && s.visible
      );
      if (!canGroupShapes(selectedInOrder)) {
        setActiveTool('select');
        setBlockFeedback(
          'Selecciona al menos 2 líneas o figuras (arrastra un recuadro o usa Shift+clic) y pulsa Agrupar en Bloque.'
        );
        return;
      }

      const groupShape = groupShapesIntoBlock(
        selectedInOrder,
        `Bloque ${countersRef.current.group++}`
      );
      const consumedSet = new Set(selectedInOrder.map((s) => s.id));
      const lastIdx = snapshot.shapes.reduce(
        (acc, s, idx) => (consumedSet.has(s.id) ? idx : acc),
        -1
      );

      commitState((prev) => {
        const { shapes: unlinkedShapes, transforms: nextTransforms } =
          unlinkTransformsForConsumedShapes(
            prev.shapes,
            prev.transforms,
            consumedSet
          );
        const nextShapes: DesignShape[] = [];
        let inserted = false;
        unlinkedShapes.forEach((s, idx) => {
          if (!consumedSet.has(s.id)) {
            nextShapes.push(s);
          }
          if (idx === lastIdx && !inserted) {
            nextShapes.push(groupShape);
            inserted = true;
          }
        });
        if (!inserted) nextShapes.push(groupShape);
        return {
          ...prev,
          shapes: nextShapes,
          transforms: nextTransforms,
        };
      });

      setSelectedShapeIds([groupShape.id]);
      setSelectedRefId(null);
      setActiveTool('select');
      setBlockFeedback(
        `${groupShape.name} creado (${selectedInOrder.length} elementos). Ya puedes moverlo, rotarlo o transformarlo en conjunto.`
      );
    },
    [snapshot.shapes, selectedShapeIds, commitState]
  );

  const handleUngroupShapes = useCallback(
    (ids?: string[]) => {
      const targetIds = ids ?? selectedShapeIds;
      const targetSet = new Set(targetIds);
      const groups = snapshot.shapes.filter(
        (s) => targetSet.has(s.id) && s.kind === 'group' && (s.children?.length ?? 0) > 0
      );
      if (groups.length === 0) return;

      const consumedSet = new Set(groups.map((g) => g.id));
      const remainingShapes = snapshot.shapes.filter((s) => !consumedSet.has(s.id));
      const usedIds = collectUsedShapeIds(remainingShapes);

      const expandedByGroup = new Map<string, DesignShape[]>();
      const newSelectedIds: string[] = [];
      for (const g of groups) {
        const expanded = ungroupBlock(g, usedIds);
        expandedByGroup.set(g.id, expanded);
        expanded.forEach((ch) => newSelectedIds.push(ch.id));
      }

      commitState((prev) => {
        const { shapes: unlinkedShapes, transforms: nextTransforms } =
          unlinkTransformsForConsumedShapes(
            prev.shapes,
            prev.transforms,
            consumedSet
          );
        const nextShapes: DesignShape[] = [];
        for (const s of unlinkedShapes) {
          const expanded = expandedByGroup.get(s.id);
          if (expanded) {
            nextShapes.push(...expanded);
          } else {
            nextShapes.push(s);
          }
        }
        return {
          ...prev,
          shapes: nextShapes,
          transforms: nextTransforms,
        };
      });

      setSelectedShapeIds(newSelectedIds);
      setSelectedRefId(null);
      setBlockFeedback(
        `Bloque desagrupado en ${newSelectedIds.length} elementos independientes.`
      );
    },
    [snapshot.shapes, selectedShapeIds, commitState]
  );

  const handleJoinShapes = useCallback(
    (ids?: string[], options?: { forceClose?: boolean }) => {
      const targetIds = ids ?? selectedShapeIds;
      const targetSet = new Set(targetIds);
      const selectedInOrder = snapshot.shapes.filter(
        (s) => targetSet.has(s.id) && s.visible
      );
      if (!canJoinShapes(selectedInOrder)) {
        setActiveTool('select');
        setBlockFeedback(
          'Selecciona 2 o más líneas/trazos (o un Bloque con trazos) arrastrando un recuadro para soldarlos en una sola figura.'
        );
        return;
      }

      const toConsume = selectedInOrder.filter((s) => isShapeJoinableInput(s));
      const name = `Figura unida ${countersRef.current.unified++}`;
      const result = joinShapesIntoUnifiedPath(toConsume, name, options);
      if (!result) return;

      const consumedSet = new Set(toConsume.map((s) => s.id));
      const remaining = snapshot.shapes.filter((s) => !consumedSet.has(s.id));
      const usedIds = collectUsedShapeIds(remaining);
      const safeUntouched = result.untouchedShapes.map((u) => {
        if (!usedIds.has(u.id)) {
          usedIds.add(u.id);
          return u;
        }
        const cloned = cloneDesignShape(u, { freshIds: true });
        usedIds.add(cloned.id);
        return cloned;
      });

      const lastIdx = snapshot.shapes.reduce(
        (acc, s, idx) => (consumedSet.has(s.id) ? idx : acc),
        -1
      );

      commitState((prev) => {
        const { shapes: unlinkedShapes, transforms: nextTransforms } =
          unlinkTransformsForConsumedShapes(
            prev.shapes,
            prev.transforms,
            consumedSet
          );
        const nextShapes: DesignShape[] = [];
        let inserted = false;
        unlinkedShapes.forEach((s, idx) => {
          if (!consumedSet.has(s.id)) {
            nextShapes.push(s);
          }
          if (idx === lastIdx && !inserted) {
            nextShapes.push(...safeUntouched, result.unifiedShape);
            inserted = true;
          }
        });
        if (!inserted) {
          nextShapes.push(...safeUntouched, result.unifiedShape);
        }
        return {
          ...prev,
          shapes: nextShapes,
          transforms: nextTransforms,
        };
      });

      setSelectedShapeIds([result.unifiedShape.id]);
      setSelectedRefId(null);
      setActiveTool('select');
      if (result.closedCount > 0) {
        setBlockFeedback(
          `Se unieron ${result.weldedConnections > 0 ? `${result.weldedConnections} uniones en ` : ''}figura cerrada: ya puedes rellenarla con pintura o grabado sólido.`
        );
      } else {
        setBlockFeedback(
          `Trazos unificados en "${result.unifiedShape.name}". Si deseas rellenarla por dentro, pulsa "Cerrar contorno".`
        );
      }
    },
    [snapshot.shapes, selectedShapeIds, commitState]
  );

  const handleToggleCloseShape = useCallback(
    (id: string) => {
      const target = snapshot.shapes.find((s) => s.id === id);
      if (!target) return;
      const toggled = toggleShapeClosed(target);
      if (!toggled) return;
      commitState((prev) => ({
        ...prev,
        shapes: prev.shapes.map((s) => (s.id === id ? toggled : s)),
      }));
    },
    [snapshot.shapes, commitState]
  );

  const handleTrimAtPoint = useCallback(
    (p: Point2D, tolCm: number) => {
      const result = trimShapeAtPoint(snapshot.shapes, p, tolCm);
      if (!result) return;

      const consumedSet = new Set([result.targetRootId]);
      const keptRootSameId = result.replacementShapes.some(
        (r) => r.id === result.targetRootId
      );

      commitState((prev) => {
        const { shapes: unlinkedShapes, transforms: nextTransforms } =
          unlinkTransformsForConsumedShapes(
            prev.shapes,
            prev.transforms,
            consumedSet
          );
        const nextShapes: DesignShape[] = [];
        for (const s of unlinkedShapes) {
          if (s.id === result.targetRootId) {
            nextShapes.push(...result.replacementShapes);
          } else {
            nextShapes.push(s);
          }
        }
        return {
          ...prev,
          shapes: nextShapes,
          transforms: nextTransforms,
        };
      });

      if (!keptRootSameId) {
        setSelectedShapeIds((prev) =>
          prev.filter((id) => id !== result.targetRootId)
        );
      }
    },
    [snapshot.shapes, commitState]
  );

  const handleSplitShapes = useCallback(
    (ids?: string[]) => {
      const targetIds = ids ?? selectedShapeIds;
      const targetSet = new Set(targetIds);
      const selectedInOrder = snapshot.shapes.filter(
        (s) => targetSet.has(s.id) && s.visible
      );
      const allVisible = snapshot.shapes.filter((s) => s.visible);
      const result = splitShapesIntoParts(selectedInOrder, allVisible);
      if (!result) {
        setActiveTool('select');
        setBlockFeedback(
          'Selecciona una figura compuesta, un bloque o figuras que se crucen entre sí para dividirlas en trazos individuales.'
        );
        return;
      }

      const consumedSet = new Set(result.consumedIds);
      const lastIdx = snapshot.shapes.reduce(
        (acc, s, idx) => (consumedSet.has(s.id) ? idx : acc),
        -1
      );

      commitState((prev) => {
        const { shapes: unlinkedShapes, transforms: nextTransforms } =
          unlinkTransformsForConsumedShapes(
            prev.shapes,
            prev.transforms,
            consumedSet
          );
        const nextShapes: DesignShape[] = [];
        let inserted = false;
        unlinkedShapes.forEach((s, idx) => {
          if (!consumedSet.has(s.id)) {
            nextShapes.push(s);
          }
          if (idx === lastIdx && !inserted) {
            nextShapes.push(...result.createdShapes);
            inserted = true;
          }
        });
        if (!inserted) {
          nextShapes.push(...result.createdShapes);
        }
        return {
          ...prev,
          shapes: nextShapes,
          transforms: nextTransforms,
        };
      });

      setSelectedShapeIds(result.createdShapes.map((s) => s.id));
      setSelectedRefId(null);
      setActiveTool('select');
      setBlockFeedback(
        `Se dividió en ${result.createdShapes.length} trazos independientes. Ahora puedes seleccionar y borrar las partes que no necesites.`
      );
    },
    [snapshot.shapes, selectedShapeIds, commitState]
  );

  useEffect(() => {
    if (!blockFeedback) return;
    const timer = window.setTimeout(() => setBlockFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [blockFeedback]);

  const visibleShapesList = useMemo(
    () => snapshot.shapes.filter((s) => s.visible),
    [snapshot.shapes]
  );
  const selectedShapesList = useMemo(
    () => snapshot.shapes.filter((s) => selectedShapeIds.includes(s.id) && s.visible),
    [snapshot.shapes, selectedShapeIds]
  );
  const canGroupSel = canGroupShapes(selectedShapesList);
  const canUngroupSel = canUngroupShapes(selectedShapesList);
  const canJoinSel = canJoinShapes(selectedShapesList);
  const canSplitSel = canSplitShapes(selectedShapesList, visibleShapesList);

  // Global keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V, Ctrl+D, Ctrl+G, Ctrl+J, Ctrl+Shift+J, Ctrl+A, Delete, tool keys)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((mod && key === 'y') || (mod && e.shiftKey && key === 'z')) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        setSelectedRefId(null);
        setSelectedShapeIds(
          snapshot.shapes.filter((s) => s.visible).map((s) => s.id)
        );
        return;
      }
      if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          handleUngroupShapes();
        } else {
          handleGroupShapes();
        }
        return;
      }
      if (mod && key === 'j') {
        e.preventDefault();
        if (e.shiftKey) {
          handleSplitShapes();
        } else {
          handleJoinShapes();
        }
        return;
      }
      if (mod && key === 'c') {
        if (selectedShapeIds.length > 0) {
          const copied = snapshot.shapes.filter((s) =>
            selectedShapeIds.includes(s.id)
          );
          setClipboard(copied);
        }
        return;
      }
      if (mod && key === 'v') {
        if (clipboard.length > 0) {
          e.preventDefault();
          const offset = translationMatrix(1, -1);
          const newCopies = clipboard.map((c) =>
            cloneDesignShape(c, {
              freshIds: true,
              name: `${c.name} copia`,
              matrix: multiplyMatrices(offset, c.matrix),
              derivedFrom: undefined,
              visible: true,
            })
          );
          commitState((prev) => ({
            ...prev,
            shapes: [...prev.shapes, ...newCopies],
          }));
          setSelectedShapeIds(newCopies.map((c) => c.id));
        }
        return;
      }
      if (mod && key === 'd') {
        if (selectedShapeIds.length > 0) {
          e.preventDefault();
          handleDuplicateShapes(selectedShapeIds);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedShapeIds.length > 0) {
          e.preventDefault();
          handleDeleteShapes(selectedShapeIds);
        } else if (selectedRefId) {
          e.preventDefault();
          handleDeleteRef(selectedRefId);
        }
        return;
      }
      if (e.key === 'Escape') {
        setActiveTool('select');
        setSelectedShapeIds([]);
        setSelectedRefId(null);
      } else if (!mod && key === 'v') {
        setActiveTool('select');
      } else if (!mod && key === 't') {
        setActiveTool('trim');
      } else if (!mod && key === 'e') {
        setActiveTool('eraser');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleUndo,
    handleRedo,
    selectedShapeIds,
    selectedRefId,
    snapshot.shapes,
    clipboard,
    commitState,
    handleDuplicateShapes,
    handleDeleteShapes,
    handleDeleteRef,
    handleGroupShapes,
    handleUngroupShapes,
    handleJoinShapes,
    handleSplitShapes,
  ]);

  const handleExportLaserSvg = () => {
    const svg = buildLaserSvgString(board, snapshot.shapes);
    downloadTextFile(
      `laser-isometrico-${board.widthCm}x${board.heightCm}cm.svg`,
      svg,
      'image/svg+xml;charset=utf-8'
    );
  };

  const handleExportPaintPng = () => {
    exportPaintPng(board, snapshot.shapes).catch((err) => {
      console.error('Error exporting PNG:', err);
    });
  };

  const handleSaveProject = () => {
    const data: SavedProjectFile = {
      version: 1,
      appName: 'Taller Isometrico',
      board,
      grid,
      shapes: snapshot.shapes,
      refs: snapshot.refs,
      transforms: snapshot.transforms,
    };
    downloadTextFile(
      `proyecto-isometrico-${board.widthCm}x${board.heightCm}cm.json`,
      JSON.stringify(data, null, 2),
      'application/json'
    );
  };

  const handleLoadProject = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as SavedProjectFile;
      if (parsed && Array.isArray(parsed.shapes) && Array.isArray(parsed.refs)) {
        if (parsed.board) setBoard(parsed.board);
        if (parsed.grid) setGrid(parsed.grid);
        setUndoStack([]);
        setRedoStack([]);
        setSnapshot({
          shapes: parsed.shapes,
          refs: parsed.refs,
          transforms: parsed.transforms ?? [],
        });
        setSelectedShapeIds([]);
        setSelectedRefId(null);
      }
    } catch {
      alert('No se pudo abrir el archivo. Verifica que sea un proyecto .json válido.');
    }
  };

  const handleInsertTessellation = useCallback(
    (
      spec: TessellationSpec,
      centerX: number,
      centerY: number,
      displayName: string
    ) => {
      const newShape: DesignShape = {
        id: uid('sh'),
        name: displayName,
        kind: 'tessellation',
        tessellation: spec,
        matrix: translationMatrix(centerX, centerY),
        fillColor: 'none',
        strokeWidthMm: 0.3,
        visible: true,
      };
      commitState((prev) => ({
        ...prev,
        shapes: [...prev.shapes, newShape],
      }));
      setSelectedShapeIds([newShape.id]);
      setSelectedRefId(null);
      setActiveTool('select');
    },
    [commitState]
  );

  const handleInsertText = useCallback(
    (
      spec: TextSpec,
      localPaths: string[],
      centerX: number,
      centerY: number
    ) => {
      handleCreateShape(
        {
          kind: 'text',
          textSpec: spec,
          localPaths,
          matrix: translationMatrix(centerX, centerY),
          fillColor: 'none',
          strokeWidthMm: 0.3,
          visible: true,
        },
        true
      );
      setActiveTool('select');
    },
    [handleCreateShape]
  );

  const handleUpdateTextShape = useCallback(
    (id: string, nextSpec: TextSpec) => {
      generateTextLocalPathsAsync(nextSpec)
        .then((res) => {
          if (!res) return;
          const shortTitle = `Texto "${nextSpec.text.trim().split(/\r?\n/)[0].slice(0, 14)}"`;
          commitState((prev) => {
            const descendants = new Set<string>([id]);
            let changed = true;
            while (changed) {
              changed = false;
              for (const s of prev.shapes) {
                if (
                  s.derivedFrom &&
                  descendants.has(s.derivedFrom.sourceShapeId) &&
                  !descendants.has(s.id)
                ) {
                  descendants.add(s.id);
                  changed = true;
                }
              }
            }
            return {
              ...prev,
              shapes: prev.shapes.map((s) =>
                descendants.has(s.id)
                  ? {
                      ...s,
                      name: s.id === id ? shortTitle : `${shortTitle}'`,
                      textSpec: nextSpec,
                      localPaths: res.localPaths,
                    }
                  : s
              ),
            };
          });
        })
        .catch(() => {});
    },
    [commitState]
  );

  const handleExportLaserDxf = () => {
    const dxf = buildLaserDxfString(board, snapshot.shapes);
    downloadTextFile(
      `falcon10w-isometrico-${board.widthCm}x${board.heightCm}cm.dxf`,
      dxf,
      'application/dxf;charset=utf-8'
    );
  };

  const handleAssignLayerToShapes = useCallback(
    (shapeIds: string[], layer: LaserDepthId) => {
      if (shapeIds.length === 0) return;
      const idSet = new Set(shapeIds);
      commitState((prev) => ({
        ...prev,
        shapes: prev.shapes.map((s) =>
          idSet.has(s.id) ? applyLaserLayerRecursive(s, layer) : s
        ),
      }));
    },
    [commitState]
  );

  const handleAlternateTransformLayers = useCallback(
    (transformId: string, layerA: LaserDepthId, layerB: LaserDepthId) => {
      commitState((prev) => {
        const rec = prev.transforms.find((t) => t.id === transformId);
        const sourceSet = new Set(rec?.sourceIds ?? []);
        return {
          ...prev,
          shapes: prev.shapes.map((s) => {
            if (s.derivedFrom?.transformId === transformId) {
              const idx = s.derivedFrom.copyIndex;
              return applyLaserLayerRecursive(s, idx % 2 === 1 ? layerB : layerA);
            }
            if (sourceSet.has(s.id)) {
              return applyLaserLayerRecursive(s, layerA);
            }
            return s;
          }),
        };
      });
    },
    [commitState]
  );

  const handleUpdateTessellationRoles = useCallback(
    (
      shapeId: string,
      roleLayers: Record<string, LaserDepthId>,
      borderLayer?: LaserDepthId
    ) => {
      commitState((prev) => ({
        ...prev,
        shapes: prev.shapes.map((s) => {
          if (s.id !== shapeId || s.kind !== 'tessellation' || !s.tessellation) {
            return s;
          }
          return {
            ...s,
            tessellation: {
              ...s.tessellation,
              roleLaserLayers: roleLayers,
              borderLaserLayer: borderLayer ?? s.tessellation.borderLaserLayer,
            },
          };
        }),
      }));
    },
    [commitState]
  );

  const handleClearAll = () => {
    if (
      snapshot.shapes.length === 0 &&
      snapshot.transforms.length === 0 &&
      snapshot.refs.length <= 1
    ) {
      return;
    }
    if (window.confirm('¿Deseas iniciar un lienzo nuevo en blanco?')) {
      commitState(() => INITIAL_SNAPSHOT);
      setSelectedShapeIds([]);
      setSelectedRefId(null);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
      <TopBar
        appMode={appMode}
        onChangeAppMode={(mode) => {
          setAppMode(mode);
          setSelectedRefId(null);
        }}
        board={board}
        onChangeBoard={setBoard}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportLaserSvg={handleExportLaserSvg}
        onExportLaserDxf={handleExportLaserDxf}
        onExportPaintPng={handleExportPaintPng}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        onOpenHelp={() => setHelpOpen(true)}
        onClearAll={handleClearAll}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {appMode === 'design' ? (
          <LeftToolbar
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            activePreset={activePreset}
            onSelectPreset={setActivePreset}
            polygonSides={polygonSides}
            onChangePolygonSides={setPolygonSides}
            onQuickAddAxis={handleQuickAddAxis}
            onOpenTessellations={() => setTessellationOpen(true)}
            canGroup={canGroupSel}
            canUngroup={canUngroupSel}
            canJoin={canJoinSel}
            canSplit={canSplitSel}
            onGroupSelected={() => handleGroupShapes()}
            onUngroupSelected={() => handleUngroupShapes()}
            onJoinSelected={() => handleJoinShapes()}
            onSplitSelected={() => handleSplitShapes()}
          />
        ) : (
          <LaserLeftToolbar
            laserTool={laserTool}
            onChangeLaserTool={setLaserTool}
            activeBrushLayer={activeBrushLayer}
            onSelectBrushLayer={setActiveBrushLayer}
            onBackToDesign={() => setAppMode('design')}
          />
        )}

        <CanvasWorkspace
          appMode={appMode}
          laserTool={laserTool}
          activeBrushLayer={activeBrushLayer}
          laserPreviewStyle={laserPreviewStyle}
          onAssignLayerToShapes={handleAssignLayerToShapes}
          board={board}
          grid={grid}
          viewMode={viewMode}
          activeTool={activeTool}
          activePreset={activePreset}
          polygonSides={polygonSides}
          mirrorSymmetry={mirrorSymmetry}
          shapes={snapshot.shapes}
          refs={snapshot.refs}
          selectedShapeIds={selectedShapeIds}
          selectedRefId={selectedRefId}
          onSelectShapes={setSelectedShapeIds}
          onSelectRef={setSelectedRefId}
          onBeginDragHistory={handleBeginDragHistory}
          onCreateShape={handleCreateShape}
          onUpdateShapeMatrices={handleUpdateShapeMatrices}
          onCreateRefPoint={handleCreateRefPoint}
          onCreateRefLine={handleCreateRefLine}
          onCreateRefVector={handleCreateRefVector}
          onUpdateRefPosition={handleUpdateRefPosition}
          onApplyTransform={handleApplyTransform}
          onDeleteShape={handleDeleteShape}
          onDeleteShapes={handleDeleteShapes}
          onDeleteRef={handleDeleteRef}
          onQuickAddAxis={handleQuickAddAxis}
          onSelectTool={setActiveTool}
          onGroupSelected={() => handleGroupShapes()}
          onUngroupSelected={() => handleUngroupShapes()}
          onJoinSelected={() => handleJoinShapes()}
          onSplitSelected={() => handleSplitShapes()}
          onTrimAtPoint={handleTrimAtPoint}
          onToggleCloseShape={handleToggleCloseShape}
          onDuplicateShapes={handleDuplicateShapes}
          onOpenTextModal={(pt) => setTextModal({ open: true, center: pt })}
          blockFeedback={blockFeedback}
          onDismissBlockFeedback={() => setBlockFeedback(null)}
        />

        {appMode === 'design' ? (
          <RightPanel
            grid={grid}
            onChangeGrid={setGrid}
            mirrorSymmetry={mirrorSymmetry}
            onChangeMirrorSymmetry={setMirrorSymmetry}
            viewMode={viewMode}
            shapes={snapshot.shapes}
            refs={snapshot.refs}
            transforms={snapshot.transforms}
            selectedShapeIds={selectedShapeIds}
            selectedRefId={selectedRefId}
            onSelectShape={(id, additive) => {
              setSelectedRefId(null);
              if (additive) {
                setSelectedShapeIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                );
              } else {
                setSelectedShapeIds([id]);
              }
            }}
            onSelectAllShapes={() => {
              setSelectedRefId(null);
              setSelectedShapeIds(
                snapshot.shapes.filter((s) => s.visible).map((s) => s.id)
              );
            }}
            onSelectRef={(id) => {
              setSelectedShapeIds([]);
              setSelectedRefId(id);
            }}
            onUpdateRefPoint={handleUpdateRefPointCoords}
            onToggleRefVisible={(id) =>
              commitState((prev) => ({
                ...prev,
                refs: prev.refs.map((r) =>
                  r.id === id ? { ...r, visible: !r.visible } : r
                ),
              }))
            }
            onDeleteRef={handleDeleteRef}
            onToggleShapeVisible={(id) =>
              commitState((prev) => ({
                ...prev,
                shapes: prev.shapes.map((s) =>
                  s.id === id ? { ...s, visible: !s.visible } : s
                ),
              }))
            }
            onDuplicateShapes={handleDuplicateShapes}
            onDeleteShapes={handleDeleteShapes}
            onUnlinkShape={handleUnlinkShape}
            onGroupSelected={() => handleGroupShapes()}
            onUngroupSelected={() => handleUngroupShapes()}
            onJoinSelected={() => handleJoinShapes()}
            onSplitSelected={() => handleSplitShapes()}
            onToggleCloseShape={handleToggleCloseShape}
            onUpdateTextShape={handleUpdateTextShape}
            onChangeShapeFill={handleChangeShapeFill}
            onTranslateSelected={handleTranslateSelected}
            onToggleTransformVisible={handleToggleTransformVisible}
            onDeleteTransform={handleDeleteTransform}
            onUpdateTransformParam={handleUpdateTransformParam}
          />
        ) : (
          <LaserDepthPanel
            shapes={snapshot.shapes}
            transforms={snapshot.transforms}
            selectedShapeIds={selectedShapeIds}
            laserPreviewStyle={laserPreviewStyle}
            onChangePreviewStyle={setLaserPreviewStyle}
            materialId={materialId}
            onChangeMaterial={setMaterialId}
            onSelectShapes={setSelectedShapeIds}
            onAssignLayerToShapes={handleAssignLayerToShapes}
            onAlternateTransformLayers={handleAlternateTransformLayers}
            onUpdateTessellationRoles={handleUpdateTessellationRoles}
            onExportLaserSvg={handleExportLaserSvg}
            onExportLaserDxf={handleExportLaserDxf}
          />
        )}
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <TessellationModal
        open={tessellationOpen}
        board={board}
        onClose={() => setTessellationOpen(false)}
        onInsert={handleInsertTessellation}
      />
      <TextModal
        open={textModal.open}
        initialCenter={textModal.center}
        onClose={() => setTextModal((prev) => ({ ...prev, open: false }))}
        onInsert={handleInsertText}
      />
    </div>
  );
}

export default App;
