import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { HelpModal } from './components/HelpModal';
import { LeftToolbar } from './components/LeftToolbar';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import {
  BoardConfig,
  DesignShape,
  GridConfig,
  Matrix2D,
  Point2D,
  PresetId,
  ProjectStateSnapshot,
  RefLine,
  RefObject,
  RefPoint,
  RefVector,
  SavedProjectFile,
  ToolId,
  TransformParams,
  TransformRecord,
  ViewMode,
} from './types/geometry';
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

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
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
  circle: 'Círculo',
  ellipse: 'Óvalo',
  polygon: 'Polígono',
  preset: 'Figura',
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

  const countersRef = useRef({
    shape: 1,
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
            const copyId = uid('sh');
            createdShapes.push({
              ...src,
              id: copyId,
              name: `${src.name}'`,
              matrix: multiplyMatrices(opMat, src.matrix),
              visible: true,
              derivedFrom: {
                transformId,
                sourceShapeId: src.id,
                copyIndex: c,
              },
            });
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
          : SHAPE_NAMES[shapeInput.kind];
      const newShape: DesignShape = {
        ...shapeInput,
        id: uid('sh'),
        name: `${baseLabel} ${countersRef.current.shape++}`,
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
            copies.push({
              ...newShape,
              id: uid('sh'),
              name: `${newShape.name}'`,
              matrix: multiplyMatrices(opMat, newShape.matrix),
              derivedFrom: {
                transformId,
                sourceShapeId: newShape.id,
                copyIndex: c,
              },
            });
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

  const handleDeleteShape = useCallback(
    (id: string) => {
      commitState((prev) => {
        // Collect all shapes cascading from deleting this shape
        const toDelete = new Set<string>([id]);
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
      setSelectedShapeIds((sel) => sel.filter((sid) => sid !== id));
    },
    [commitState]
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
              created.push({
                ...src,
                id: uid('sh'),
                name: `${src.name}'`,
                matrix: multiplyMatrices(opMat, src.matrix),
                visible: tr.visible,
                derivedFrom: {
                  transformId: tr.id,
                  sourceShapeId: src.id,
                  copyIndex: c,
                },
              });
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

  const handleDuplicateShape = useCallback(
    (id: string) => {
      const target = snapshot.shapes.find((s) => s.id === id);
      if (!target) return;
      const offset = translationMatrix(1, -1);
      const copy: DesignShape = {
        ...target,
        id: uid('sh'),
        name: `${target.name} copia`,
        matrix: multiplyMatrices(offset, target.matrix),
        derivedFrom: undefined,
        visible: true,
      };
      commitState((prev) => ({ ...prev, shapes: [...prev.shapes, copy] }));
      setSelectedShapeIds([copy.id]);
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
      commitState((prev) => ({
        ...prev,
        shapes: prev.shapes.map((s) =>
          ids.includes(s.id) ? { ...s, fillColor } : s
        ),
      }));
    },
    [commitState]
  );

  // Global keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V, Ctrl+D, Delete, tool keys)
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

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'c') {
        if (selectedShapeIds.length > 0) {
          const copied = snapshot.shapes.filter((s) =>
            selectedShapeIds.includes(s.id)
          );
          setClipboard(copied);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        if (clipboard.length > 0) {
          e.preventDefault();
          const offset = translationMatrix(1, -1);
          const newCopies = clipboard.map((c) => ({
            ...c,
            id: uid('sh'),
            name: `${c.name} copia`,
            matrix: multiplyMatrices(offset, c.matrix),
            derivedFrom: undefined,
            visible: true,
          }));
          commitState((prev) => ({
            ...prev,
            shapes: [...prev.shapes, ...newCopies],
          }));
          setSelectedShapeIds(newCopies.map((c) => c.id));
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        if (selectedShapeIds.length > 0) {
          e.preventDefault();
          handleDuplicateShape(selectedShapeIds[0]);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedShapeIds.length > 0) {
          e.preventDefault();
          selectedShapeIds.forEach((id) => handleDeleteShape(id));
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
      } else if (!mod && e.key.toLowerCase() === 'v') {
        setActiveTool('select');
      } else if (!mod && e.key.toLowerCase() === 'e') {
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
    handleDuplicateShape,
    handleDeleteShape,
    handleDeleteRef,
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
        board={board}
        onChangeBoard={setBoard}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportLaserSvg={handleExportLaserSvg}
        onExportPaintPng={handleExportPaintPng}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        onOpenHelp={() => setHelpOpen(true)}
        onClearAll={handleClearAll}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <LeftToolbar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          activePreset={activePreset}
          onSelectPreset={setActivePreset}
          polygonSides={polygonSides}
          onChangePolygonSides={setPolygonSides}
          onQuickAddAxis={handleQuickAddAxis}
        />

        <CanvasWorkspace
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
          onDeleteRef={handleDeleteRef}
          onQuickAddAxis={handleQuickAddAxis}
          onSelectTool={setActiveTool}
        />

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
          onDuplicateShape={handleDuplicateShape}
          onDeleteShape={handleDeleteShape}
          onUnlinkShape={handleUnlinkShape}
          onChangeShapeFill={handleChangeShapeFill}
          onTranslateSelected={handleTranslateSelected}
          onToggleTransformVisible={handleToggleTransformVisible}
          onDeleteTransform={handleDeleteTransform}
          onUpdateTransformParam={handleUpdateTransformParam}
        />
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export default App;
