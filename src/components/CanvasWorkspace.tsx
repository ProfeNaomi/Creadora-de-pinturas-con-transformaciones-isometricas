import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Combine,
  Copy,
  Group,
  Maximize2,
  Pentagon,
  Split,
  Trash2,
  Ungroup,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  AppMode,
  BoardConfig,
  DesignShape,
  GridConfig,
  LaserDepthId,
  Matrix2D,
  Point2D,
  PresetId,
  RefLine,
  RefObject,
  RefPoint,
  RefVector,
  ToolId,
  TransformParams,
  ViewMode,
} from '../types/geometry';
import {
  canGroupShapes,
  canJoinShapes,
  canToggleCloseShape,
  canUngroupShapes,
  getGroupLeafStats,
  hitTestShape,
  isShapeClosed,
  shapeIntersectsRect,
} from '../utils/blocks';
import {
  canSplitShapes,
  findTrimHoverTarget,
  TrimTargetInfo,
} from '../utils/pathSplit';
import { getShapeLaserLayer, LASER_LAYER_MAP } from '../utils/laserLayers';
import type { LaserPreviewStyle } from './LaserDepthPanel';
import type { LaserToolMode } from './LaserLeftToolbar';
import {
  applyMatrix,
  BoundingBox,
  boundsFromPoints,
  buildTransformMatrixForParams,
  circleToPath,
  distancePointToLine,
  distancePointToSegment,
  ellipseToPath,
  formatNum,
  IDENTITY_MATRIX,
  mathToSvgMm,
  multiplyMatrices,
  pointsToSmoothCubicPath,
  regularPolygonToPath,
  rotationMatrix,
  roundCoord,
  sampleDotsAlongPoints,
  scaleMatrix,
  snapPoint,
  snapValue,
  splinePointsToCubicPath,
  threePointCurveToQuadraticPath,
  transformMathPath,
  translationMatrix,
} from '../utils/math2d';
import {
  getShapeLocalPaths,
  getShapeMathBounds,
  isShapeFillable,
  PRESET_DEFINITIONS,
} from '../utils/presets';
import { buildBoardBorderSvgPaths } from '../utils/svgExport';

interface CanvasWorkspaceProps {
  appMode?: AppMode;
  laserTool?: LaserToolMode;
  activeBrushLayer?: LaserDepthId;
  laserPreviewStyle?: LaserPreviewStyle;
  onAssignLayerToShapes?: (ids: string[], layer: LaserDepthId) => void;
  board: BoardConfig;
  grid: GridConfig;
  viewMode: ViewMode;
  activeTool: ToolId;
  activePreset: PresetId;
  polygonSides: number;
  mirrorSymmetry: number;
  shapes: DesignShape[];
  refs: RefObject[];
  selectedShapeIds: string[];
  selectedRefId: string | null;
  onSelectShapes: (ids: string[]) => void;
  onSelectRef: (id: string | null) => void;
  onBeginDragHistory: () => void;
  onCreateShape: (shape: Omit<DesignShape, 'id' | 'name'>, autoMirror?: boolean) => void;
  onUpdateShapeMatrices: (updates: { id: string; matrix: Matrix2D }[]) => void;
  onCreateRefPoint: (p: Point2D) => RefPoint;
  onCreateRefLine: (p1: Point2D, p2: Point2D) => RefLine;
  onCreateRefVector: (from: Point2D, to: Point2D) => RefVector;
  onUpdateRefPosition: (id: string, next: RefObject) => void;
  onApplyTransform: (sourceIds: string[], params: TransformParams) => void;
  onDeleteShape: (id: string) => void;
  onDeleteShapes?: (ids: string[]) => void;
  onDeleteRef: (id: string) => void;
  onQuickAddAxis: (kind: 'x' | 'y' | 'diag1' | 'diag2' | 'origin') => RefObject;
  onSelectTool: (tool: ToolId) => void;
  onGroupSelected?: () => void;
  onUngroupSelected?: () => void;
  onJoinSelected?: () => void;
  onSplitSelected?: () => void;
  onTrimAtPoint?: (p: Point2D, tolCm: number) => void;
  onToggleCloseShape?: (id: string) => void;
  onDuplicateShapes?: (ids: string[]) => void;
  onOpenTextModal?: (center: Point2D) => void;
  blockFeedback?: string | null;
  onDismissBlockFeedback?: () => void;
}

interface CameraState {
  cx: number;
  cy: number;
  zoom: number;
}

type DragInteraction =
  | { kind: 'pan'; startClientX: number; startClientY: number; startCx: number; startCy: number }
  | {
      kind: 'move-shapes';
      startMath: Point2D;
      originCenter: Point2D;
      items: { id: string; startMatrix: Matrix2D }[];
    }
  | {
      kind: 'scale-shapes';
      anchor: Point2D;
      startDist: number;
      items: { id: string; startMatrix: Matrix2D }[];
    }
  | {
      kind: 'rotate-shapes';
      center: Point2D;
      startAngleDeg: number;
      items: { id: string; startMatrix: Matrix2D }[];
    }
  | { kind: 'move-ref-point'; id: string }
  | {
      kind: 'marquee-select';
      startMath: Point2D;
      currentMath: Point2D;
      startClientX: number;
      startClientY: number;
      additive: boolean;
      clickFallbackShapeId?: string;
    }
  | { kind: 'draw-freehand'; points: Point2D[] }
  | { kind: 'draw-dots'; points: Point2D[] }
  | { kind: 'draw-segment'; start: Point2D; current: Point2D }
  | { kind: 'draw-circle'; center: Point2D; edge: Point2D }
  | { kind: 'draw-ellipse'; start: Point2D; current: Point2D }
  | { kind: 'draw-polygon'; center: Point2D; edge: Point2D };

interface TransformWizardState {
  tool: 't-axial' | 't-central' | 't-rotation' | 't-rosette' | 't-translation';
  sourceIds: string[];
  step: 'pick-shape' | 'pick-ref' | 'configure';
  keepOriginal: boolean;
  refId?: string;
  angleDeg: number;
  copies: number;
  dx: number;
  dy: number;
  repeatCount: number;
}

const isTransformTool = (
  t: ToolId
): t is 't-axial' | 't-central' | 't-rotation' | 't-rosette' | 't-translation' =>
  t === 't-axial' ||
  t === 't-central' ||
  t === 't-rotation' ||
  t === 't-rosette' ||
  t === 't-translation';

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  appMode = 'design',
  laserTool = 'select',
  activeBrushLayer = 'engrave-deep',
  laserPreviewStyle = 'layers',
  onAssignLayerToShapes,
  board,
  grid,
  viewMode,
  activeTool,
  activePreset,
  polygonSides,
  mirrorSymmetry,
  shapes,
  refs,
  selectedShapeIds,
  selectedRefId,
  onSelectShapes,
  onSelectRef,
  onBeginDragHistory,
  onCreateShape,
  onUpdateShapeMatrices,
  onCreateRefPoint,
  onCreateRefLine,
  onCreateRefVector,
  onUpdateRefPosition,
  onApplyTransform,
  onDeleteShape,
  onDeleteShapes,
  onDeleteRef,
  onQuickAddAxis,
  onSelectTool,
  onGroupSelected,
  onUngroupSelected,
  onJoinSelected,
  onSplitSelected,
  onTrimAtPoint,
  onToggleCloseShape,
  onDuplicateShapes,
  onOpenTextModal,
  blockFeedback,
  onDismissBlockFeedback,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [viewport, setViewport] = useState({ width: 900, height: 650 });
  const [camera, setCamera] = useState<CameraState>({ cx: 0, cy: 0, zoom: 1 });
  const [spacePressed, setSpacePressed] = useState(false);

  const [snappedCursor, setSnappedCursor] = useState<{
    point: Point2D;
    snappedToRef: RefPoint | null;
  }>({ point: { x: 0, y: 0 }, snappedToRef: null });

  const [drag, setDrag] = useState<DragInteraction | null>(null);
  const [pendingRefStart, setPendingRefStart] = useState<Point2D | null>(null);
  const [pendingCurve, setPendingCurve] = useState<{
    start: Point2D;
    end?: Point2D;
  } | null>(null);
  const [pendingSpline, setPendingSpline] = useState<Point2D[]>([]);
  const [trimHover, setTrimHover] = useState<TrimTargetInfo | null>(null);

  const [wizard, setWizard] = useState<TransformWizardState | null>(null);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setViewport({
        width: Math.max(200, el.clientWidth),
        height: Math.max(200, el.clientHeight),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Spacebar pan shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        setSpacePressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Sync wizard when activeTool changes
  useEffect(() => {
    setPendingRefStart(null);
    setPendingCurve(null);
    setPendingSpline([]);
    setTrimHover(null);
    if (isTransformTool(activeTool)) {
      const validSel = selectedShapeIds.filter((id) =>
        shapes.some((s) => s.id === id && s.visible)
      );
      setWizard({
        tool: activeTool,
        sourceIds: validSel,
        step: validSel.length > 0 ? 'pick-ref' : 'pick-shape',
        keepOriginal: true,
        angleDeg: 60,
        copies: 6,
        dx: 2,
        dy: 0,
        repeatCount: 1,
      });
    } else {
      setWizard(null);
    }
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishPendingSpline = useCallback(
    (closed: boolean) => {
      if (pendingSpline.length < (closed ? 3 : 2)) return;
      const d = splinePointsToCubicPath(pendingSpline, closed);
      onCreateShape(
        {
          kind: 'spline',
          localPaths: [d],
          matrix: IDENTITY_MATRIX,
          fillColor: 'none',
          strokeWidthMm: 0.35,
          visible: true,
        },
        true
      );
      setPendingSpline([]);
    },
    [pendingSpline, onCreateShape]
  );

  // Enter finishes open spline; Escape cancels pending curve/spline
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
      if (e.key === 'Enter' && activeTool === 'spline' && pendingSpline.length >= 2) {
        e.preventDefault();
        finishPendingSpline(false);
      } else if (e.key === 'Escape') {
        setPendingRefStart(null);
        setPendingCurve(null);
        setPendingSpline([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool, pendingSpline.length, finishPendingSpline]);

  const basePxPerCm = useMemo(() => {
    const pad = 72;
    const sx = (viewport.width - pad) / Math.max(5, board.widthCm);
    const sy = (viewport.height - pad) / Math.max(5, board.heightCm);
    return Math.max(8, Math.min(sx, sy));
  }, [viewport, board.widthCm, board.heightCm]);

  const pxPerCm = basePxPerCm * camera.zoom;
  const mmPerPx = 10 / pxPerCm;

  const vbW = viewport.width * mmPerPx;
  const vbH = viewport.height * mmPerPx;
  const camMm = mathToSvgMm({ x: camera.cx, y: camera.cy }, board.widthCm, board.heightCm);
  const viewBoxMinX = camMm.x - vbW / 2;
  const viewBoxMinY = camMm.y - vbH / 2;
  const viewBoxStr = `${viewBoxMinX} ${viewBoxMinY} ${vbW} ${vbH}`;

  const clientToMath = useCallback(
    (clientX: number, clientY: number): Point2D => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const dxPx = clientX - rect.left - rect.width / 2;
      const dyPx = clientY - rect.top - rect.height / 2;
      return {
        x: camera.cx + dxPx / pxPerCm,
        y: camera.cy - dyPx / pxPerCm,
      };
    },
    [camera.cx, camera.cy, pxPerCm]
  );

  const refPoints = useMemo(
    () => refs.filter((r): r is RefPoint => r.kind === 'point'),
    [refs]
  );

  const computeSnap = useCallback(
    (rawMath: Point2D, snapToRefs = true) => {
      const refRadius = snapToRefs && grid.snapToRefPoints ? 12 / pxPerCm : 0;
      return snapPoint(rawMath, grid.step, refPoints, refRadius);
    },
    [grid.step, grid.snapToRefPoints, refPoints, pxPerCm]
  );

  const isShapeVisuallyFilled = useCallback(
    (s: DesignShape): boolean => {
      if (s.kind === 'group' && s.children) {
        return s.children.some((c) => c.visible && isShapeVisuallyFilled(c));
      }
      if (appMode === 'laser-prep') {
        return getShapeLaserLayer(s) === 'engrave-fill';
      }
      if (viewMode !== 'paint') return false;
      if (s.kind === 'tessellation') {
        return Boolean(s.tessellation?.autoColor);
      }
      return isShapeFillable(s) && Boolean(s.fillColor) && s.fillColor !== 'none';
    },
    [appMode, viewMode]
  );

  // Compute hit-testing in math coordinates
  const findShapeAt = useCallback(
    (
      p: Point2D,
      preferDirect = false
    ): { shape: DesignShape; hollowFallback: DesignShape | null } => {
      const tol = 12 / pxPerCm;
      let hollowFallback: DesignShape | null = null;
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        if (!s.visible) continue;
        const hitKind = hitTestShape(s, p, tol);
        if (!hitKind) continue;
        if (
          hitKind === 'stroke' ||
          !preferDirect ||
          isShapeVisuallyFilled(s) ||
          selectedShapeIds.includes(s.id)
        ) {
          return { shape: s, hollowFallback };
        }
        if (!hollowFallback) {
          hollowFallback = s;
        }
      }
      return { shape: null as unknown as DesignShape, hollowFallback };
    },
    [shapes, pxPerCm, isShapeVisuallyFilled, selectedShapeIds]
  );

  const findRefAt = useCallback(
    (p: Point2D, filterKind?: RefObject['kind']): RefObject | null => {
      const ptTol = 14 / pxPerCm;
      const lineTol = 10 / pxPerCm;
      // Points first
      if (!filterKind || filterKind === 'point') {
        for (let i = refs.length - 1; i >= 0; i--) {
          const r = refs[i];
          if (!r.visible || r.kind !== 'point') continue;
          if (Math.hypot(p.x - r.x, p.y - r.y) <= ptTol) return r;
        }
      }
      // Vectors
      if (!filterKind || filterKind === 'vector') {
        for (let i = refs.length - 1; i >= 0; i--) {
          const r = refs[i];
          if (!r.visible || r.kind !== 'vector') continue;
          if (distancePointToSegment(p, r.from, r.to) <= lineTol) return r;
        }
      }
      // Lines
      if (!filterKind || filterKind === 'line') {
        for (let i = refs.length - 1; i >= 0; i--) {
          const r = refs[i];
          if (!r.visible || r.kind !== 'line') continue;
          if (distancePointToLine(p, r.p1, r.p2) <= lineTol) return r;
        }
      }
      return null;
    },
    [refs, pxPerCm]
  );

  // Selected bounding box
  const selectionBounds: BoundingBox | null = useMemo(() => {
    const sel = shapes.filter((s) => selectedShapeIds.includes(s.id) && s.visible);
    if (sel.length === 0) return null;
    const pts: Point2D[] = [];
    for (const s of sel) {
      const b = getShapeMathBounds(s);
      if (b) {
        pts.push({ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY });
      }
    }
    return boundsFromPoints(pts);
  }, [shapes, selectedShapeIds]);

  const selectedAreDerived = useMemo(
    () =>
      shapes
        .filter((s) => selectedShapeIds.includes(s.id))
        .some((s) => Boolean(s.derivedFrom)),
    [shapes, selectedShapeIds]
  );

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
    const nextZoom = Math.max(0.25, Math.min(12, camera.zoom * factor));
    const mouseMath = clientToMath(e.clientX, e.clientY);
    const scaleRatio = nextZoom / camera.zoom;
    const nextCx = mouseMath.x - (mouseMath.x - camera.cx) / scaleRatio;
    const nextCy = mouseMath.y - (mouseMath.y - camera.cy) / scaleRatio;
    setCamera({ cx: nextCx, cy: nextCy, zoom: nextZoom });
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    const rawMath = clientToMath(e.clientX, e.clientY);
    const snap = computeSnap(rawMath);
    setSnappedCursor(snap);

    // Middle mouse button or Pan tool or Spacebar -> Pan
    if (
      e.button === 1 ||
      activeTool === 'pan' ||
      (appMode === 'laser-prep' && laserTool === 'pan') ||
      spacePressed
    ) {
      setDrag({
        kind: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startCx: camera.cx,
        startCy: camera.cy,
      });
      return;
    }

    if (e.button !== 0) return;

    // Mode 2: Laser Depth Classification clicks
    if (appMode === 'laser-prep') {
      const { shape: shapeHit, hollowFallback } = findShapeAt(
        rawMath,
        laserTool !== 'brush'
      );
      if (laserTool === 'brush') {
        const targetHit = shapeHit ?? hollowFallback;
        if (targetHit && onAssignLayerToShapes) {
          onAssignLayerToShapes([targetHit.id], activeBrushLayer);
          onSelectShapes([targetHit.id]);
        }
        return;
      }
      if (shapeHit) {
        if (e.shiftKey) {
          const nextSel = selectedShapeIds.includes(shapeHit.id)
            ? selectedShapeIds.filter((id) => id !== shapeHit.id)
            : [...selectedShapeIds, shapeHit.id];
          onSelectShapes(nextSel);
        } else {
          onSelectShapes([shapeHit.id]);
        }
        return;
      }
      setDrag({
        kind: 'marquee-select',
        startMath: rawMath,
        currentMath: rawMath,
        startClientX: e.clientX,
        startClientY: e.clientY,
        additive: e.shiftKey,
        clickFallbackShapeId: hollowFallback?.id,
      });
      return;
    }

    // Trim tool (Scissors: erase only the sub-segment between intersections)
    if (activeTool === 'trim') {
      onTrimAtPoint?.(rawMath, 12 / pxPerCm);
      setTrimHover(null);
      return;
    }

    // Eraser tool
    if (activeTool === 'eraser') {
      const refHit = findRefAt(rawMath);
      if (refHit) {
        onDeleteRef(refHit.id);
        return;
      }
      const { shape: shapeHit } = findShapeAt(rawMath, false);
      if (shapeHit) {
        onDeleteShape(shapeHit.id);
      }
      return;
    }

    // Transformation wizard clicks
    if (wizard) {
      if (wizard.step === 'pick-shape') {
        const { shape: hit } = findShapeAt(rawMath, false);
        if (hit) {
          onSelectShapes([hit.id]);
          setWizard({
            ...wizard,
            sourceIds: [hit.id],
            step: 'pick-ref',
          });
        }
        return;
      }

      if (wizard.step === 'pick-ref') {
        if (wizard.tool === 't-axial') {
          const lineHit = findRefAt(rawMath, 'line');
          if (lineHit && lineHit.kind === 'line') {
            onApplyTransform(wizard.sourceIds, {
              type: 'axial',
              lineId: lineHit.id,
              keepOriginal: wizard.keepOriginal,
            });
            setWizard({ ...wizard, step: 'pick-shape', sourceIds: [] });
            onSelectTool('select');
          }
          return;
        }

        if (wizard.tool === 't-central') {
          const ptHit = findRefAt(rawMath, 'point');
          const pt =
            ptHit && ptHit.kind === 'point'
              ? ptHit
              : onCreateRefPoint(snap.point);
          onApplyTransform(wizard.sourceIds, {
            type: 'central',
            pointId: pt.id,
            keepOriginal: wizard.keepOriginal,
          });
          setWizard({ ...wizard, step: 'pick-shape', sourceIds: [] });
          onSelectTool('select');
          return;
        }

        if (wizard.tool === 't-rotation' || wizard.tool === 't-rosette') {
          const ptHit = findRefAt(rawMath, 'point');
          const pt =
            ptHit && ptHit.kind === 'point'
              ? ptHit
              : onCreateRefPoint(snap.point);
          setWizard({
            ...wizard,
            refId: pt.id,
            step: 'configure',
          });
          return;
        }

        if (wizard.tool === 't-translation') {
          const vecHit = findRefAt(rawMath, 'vector');
          if (vecHit && vecHit.kind === 'vector') {
            setWizard({
              ...wizard,
              refId: vecHit.id,
              dx: roundCoord(vecHit.to.x - vecHit.from.x),
              dy: roundCoord(vecHit.to.y - vecHit.from.y),
              step: 'configure',
            });
          }
          return;
        }
      }
      return;
    }

    // Reference placement tools
    if (activeTool === 'ref-point') {
      const pt = onCreateRefPoint(snap.point);
      onSelectRef(pt.id);
      return;
    }

    if (activeTool === 'ref-line' || activeTool === 'ref-vector') {
      if (!pendingRefStart) {
        setPendingRefStart(snap.point);
      } else {
        const p2 = snap.point;
        if (Math.hypot(p2.x - pendingRefStart.x, p2.y - pendingRefStart.y) > 0.05) {
          if (activeTool === 'ref-line') {
            onCreateRefLine(pendingRefStart, p2);
          } else {
            onCreateRefVector(pendingRefStart, p2);
          }
        }
        setPendingRefStart(null);
      }
      return;
    }

    // Drawing tools
    if (activeTool === 'preset') {
      onCreateShape(
        {
          kind: 'preset',
          presetId: activePreset,
          matrix: translationMatrix(snap.point.x, snap.point.y),
          fillColor: 'none',
          strokeWidthMm: 0.35,
          visible: true,
        },
        true
      );
      return;
    }

    if (activeTool === 'text') {
      onOpenTextModal?.(snap.point);
      return;
    }

    if (activeTool === 'curve') {
      if (!pendingCurve) {
        setPendingCurve({ start: snap.point });
      } else if (!pendingCurve.end) {
        if (
          Math.hypot(
            snap.point.x - pendingCurve.start.x,
            snap.point.y - pendingCurve.start.y
          ) >= 0.08
        ) {
          setPendingCurve({ ...pendingCurve, end: snap.point });
        }
      } else {
        const d = threePointCurveToQuadraticPath(
          pendingCurve.start,
          pendingCurve.end,
          snap.point
        );
        onCreateShape(
          {
            kind: 'curve',
            localPaths: [d],
            matrix: IDENTITY_MATRIX,
            fillColor: 'none',
            strokeWidthMm: 0.35,
            visible: true,
          },
          true
        );
        setPendingCurve(null);
      }
      return;
    }

    if (activeTool === 'spline') {
      if (pendingSpline.length >= 3) {
        const first = pendingSpline[0];
        const closeTol = Math.max(0.12, 14 / pxPerCm);
        if (Math.hypot(rawMath.x - first.x, rawMath.y - first.y) <= closeTol) {
          const d = splinePointsToCubicPath(pendingSpline, true);
          onCreateShape(
            {
              kind: 'spline',
              localPaths: [d],
              matrix: IDENTITY_MATRIX,
              fillColor: 'none',
              strokeWidthMm: 0.35,
              visible: true,
            },
            true
          );
          setPendingSpline([]);
          return;
        }
      }
      const last = pendingSpline[pendingSpline.length - 1];
      if (
        !last ||
        Math.hypot(snap.point.x - last.x, snap.point.y - last.y) >= 0.05
      ) {
        setPendingSpline((prev) => [...prev, snap.point]);
      }
      return;
    }

    if (activeTool === 'freehand') {
      setDrag({ kind: 'draw-freehand', points: [rawMath] });
      return;
    }

    if (activeTool === 'dots') {
      setDrag({ kind: 'draw-dots', points: [rawMath] });
      return;
    }

    if (activeTool === 'segment') {
      setDrag({ kind: 'draw-segment', start: snap.point, current: snap.point });
      return;
    }

    if (activeTool === 'circle') {
      setDrag({ kind: 'draw-circle', center: snap.point, edge: snap.point });
      return;
    }

    if (activeTool === 'ellipse') {
      setDrag({ kind: 'draw-ellipse', start: snap.point, current: snap.point });
      return;
    }

    if (activeTool === 'polygon') {
      setDrag({ kind: 'draw-polygon', center: snap.point, edge: snap.point });
      return;
    }

    // Select tool
    if (activeTool === 'select') {
      // Check reference point first
      const ptHit = findRefAt(rawMath, 'point');
      if (ptHit && ptHit.kind === 'point') {
        onSelectRef(ptHit.id);
        onSelectShapes([]);
        onBeginDragHistory();
        setDrag({ kind: 'move-ref-point', id: ptHit.id });
        return;
      }

      // Check shape hit (prioritize stroke/filled hits; hollow interiors allow marquee dragging)
      const { shape: shapeHit, hollowFallback } = findShapeAt(rawMath, true);
      if (shapeHit) {
        onSelectRef(null);
        let nextSel = selectedShapeIds;
        if (e.shiftKey) {
          nextSel = selectedShapeIds.includes(shapeHit.id)
            ? selectedShapeIds.filter((id) => id !== shapeHit.id)
            : [...selectedShapeIds, shapeHit.id];
          onSelectShapes(nextSel);
          return;
        } else if (!selectedShapeIds.includes(shapeHit.id)) {
          nextSel = [shapeHit.id];
          onSelectShapes(nextSel);
        }

        const movable = shapes.filter(
          (s) => nextSel.includes(s.id) && !s.derivedFrom && !s.locked
        );
        if (movable.length > 0) {
          const bPts: Point2D[] = [];
          movable.forEach((s) => {
            const b = getShapeMathBounds(s);
            if (b) bPts.push({ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY });
          });
          const ob = boundsFromPoints(bPts);
          onBeginDragHistory();
          setDrag({
            kind: 'move-shapes',
            startMath: rawMath,
            originCenter: ob ? { x: ob.cx, y: ob.cy } : rawMath,
            items: movable.map((s) => ({ id: s.id, startMatrix: s.matrix })),
          });
        }
        return;
      }

      // Check other ref (line/vector) just to select in panel
      if (!hollowFallback) {
        const anyRef = findRefAt(rawMath);
        if (anyRef) {
          onSelectRef(anyRef.id);
          onSelectShapes([]);
          return;
        }
      }

      // Empty or hollow interior drag -> marquee selection box
      setDrag({
        kind: 'marquee-select',
        startMath: rawMath,
        currentMath: rawMath,
        startClientX: e.clientX,
        startClientY: e.clientY,
        additive: e.shiftKey,
        clickFallbackShapeId: hollowFallback?.id,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rawMath = clientToMath(e.clientX, e.clientY);
    const snap = computeSnap(rawMath);
    setSnappedCursor(snap);

    if (!drag) {
      if (appMode === 'design' && activeTool === 'trim') {
        setTrimHover(findTrimHoverTarget(shapes, rawMath, 12 / pxPerCm));
      } else if (trimHover) {
        setTrimHover(null);
      }
      return;
    }

    if (drag.kind === 'pan') {
      const dxPx = e.clientX - drag.startClientX;
      const dyPx = e.clientY - drag.startClientY;
      setCamera({
        ...camera,
        cx: drag.startCx - dxPx / pxPerCm,
        cy: drag.startCy + dyPx / pxPerCm,
      });
      return;
    }

    if (drag.kind === 'move-ref-point') {
      const pt = refs.find((r) => r.id === drag.id && r.kind === 'point');
      if (pt && pt.kind === 'point') {
        const gridOnly = snapPoint(rawMath, grid.step);
        onUpdateRefPosition(drag.id, {
          ...pt,
          x: gridOnly.point.x,
          y: gridOnly.point.y,
        });
      }
      return;
    }

    if (drag.kind === 'move-shapes') {
      const rawDx = rawMath.x - drag.startMath.x;
      const rawDy = rawMath.y - drag.startMath.y;
      const targetCx = snapValue(drag.originCenter.x + rawDx, grid.step);
      const targetCy = snapValue(drag.originCenter.y + rawDy, grid.step);
      const dx = targetCx - drag.originCenter.x;
      const dy = targetCy - drag.originCenter.y;
      const tMat = translationMatrix(dx, dy);
      onUpdateShapeMatrices(
        drag.items.map((it) => ({
          id: it.id,
          matrix: multiplyMatrices(tMat, it.startMatrix),
        }))
      );
      return;
    }

    if (drag.kind === 'scale-shapes') {
      const dist = Math.max(0.15, Math.hypot(rawMath.x - drag.anchor.x, rawMath.y - drag.anchor.y));
      const factor = Math.max(0.1, Math.min(10, dist / Math.max(0.15, drag.startDist)));
      const sMat = scaleMatrix(factor, factor, drag.anchor);
      onUpdateShapeMatrices(
        drag.items.map((it) => ({
          id: it.id,
          matrix: multiplyMatrices(sMat, it.startMatrix),
        }))
      );
      return;
    }

    if (drag.kind === 'rotate-shapes') {
      let currentAngle =
        (Math.atan2(rawMath.y - drag.center.y, rawMath.x - drag.center.x) * 180) /
        Math.PI;
      let delta = currentAngle - drag.startAngleDeg;
      if (e.shiftKey) {
        delta = Math.round(delta / 15) * 15;
      }
      const rMat = rotationMatrix(delta, drag.center);
      onUpdateShapeMatrices(
        drag.items.map((it) => ({
          id: it.id,
          matrix: multiplyMatrices(rMat, it.startMatrix),
        }))
      );
      return;
    }

    if (drag.kind === 'marquee-select') {
      setDrag({ ...drag, currentMath: rawMath });
      return;
    }

    if (drag.kind === 'draw-freehand') {
      const last = drag.points[drag.points.length - 1];
      if (!last || Math.hypot(rawMath.x - last.x, rawMath.y - last.y) >= 4 / pxPerCm) {
        setDrag({ ...drag, points: [...drag.points, rawMath] });
      }
      return;
    }

    if (drag.kind === 'draw-dots') {
      const last = drag.points[drag.points.length - 1];
      if (!last || Math.hypot(rawMath.x - last.x, rawMath.y - last.y) >= 4 / pxPerCm) {
        setDrag({ ...drag, points: [...drag.points, rawMath] });
      }
      return;
    }

    if (drag.kind === 'draw-segment') {
      setDrag({ ...drag, current: snap.point });
      return;
    }

    if (drag.kind === 'draw-circle') {
      setDrag({ ...drag, edge: snap.point });
      return;
    }

    if (drag.kind === 'draw-ellipse') {
      setDrag({ ...drag, current: snap.point });
      return;
    }

    if (drag.kind === 'draw-polygon') {
      setDrag({ ...drag, edge: snap.point });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;

    if (drag.kind === 'marquee-select') {
      const distPx = Math.hypot(
        e.clientX - drag.startClientX,
        e.clientY - drag.startClientY
      );
      if (distPx < 4) {
        if (drag.clickFallbackShapeId) {
          onSelectRef(null);
          if (drag.additive) {
            const nextSel = selectedShapeIds.includes(drag.clickFallbackShapeId)
              ? selectedShapeIds.filter((id) => id !== drag.clickFallbackShapeId)
              : [...selectedShapeIds, drag.clickFallbackShapeId];
            onSelectShapes(nextSel);
          } else {
            onSelectShapes([drag.clickFallbackShapeId]);
          }
        } else if (!drag.additive) {
          onSelectShapes([]);
          onSelectRef(null);
        }
      } else {
        const rect = {
          minX: Math.min(drag.startMath.x, drag.currentMath.x),
          minY: Math.min(drag.startMath.y, drag.currentMath.y),
          maxX: Math.max(drag.startMath.x, drag.currentMath.x),
          maxY: Math.max(drag.startMath.y, drag.currentMath.y),
        };
        const hitIds = shapes
          .filter(
            (s) =>
              s.visible &&
              shapeIntersectsRect(s, rect, {
                matchFilledInterior: isShapeVisuallyFilled(s),
              })
          )
          .map((s) => s.id);
        onSelectRef(null);
        if (drag.additive) {
          onSelectShapes(Array.from(new Set([...selectedShapeIds, ...hitIds])));
        } else {
          onSelectShapes(hitIds);
        }
      }
      setDrag(null);
      return;
    }

    if (drag.kind === 'draw-freehand' && drag.points.length >= 2) {
      const d = pointsToSmoothCubicPath(drag.points, 0.04);
      onCreateShape(
        {
          kind: 'freehand',
          localPaths: [d],
          matrix: IDENTITY_MATRIX,
          fillColor: 'none',
          strokeWidthMm: 0.35,
          visible: true,
        },
        true
      );
    } else if (drag.kind === 'draw-dots' && drag.points.length >= 1) {
      const dots = sampleDotsAlongPoints(drag.points, 0.38);
      if (dots.length > 0) {
        onCreateShape(
          {
            kind: 'dots',
            localDots: dots,
            dotRadiusCm: 0.08,
            matrix: IDENTITY_MATRIX,
            fillColor: 'none',
            strokeWidthMm: 0.3,
            visible: true,
          },
          true
        );
      }
    } else if (drag.kind === 'draw-segment') {
      const len = Math.hypot(
        drag.current.x - drag.start.x,
        drag.current.y - drag.start.y
      );
      if (len >= 0.08) {
        const d = `M ${roundCoord(drag.start.x)} ${roundCoord(drag.start.y)} L ${roundCoord(drag.current.x)} ${roundCoord(drag.current.y)}`;
        onCreateShape(
          {
            kind: 'segment',
            localPaths: [d],
            matrix: IDENTITY_MATRIX,
            fillColor: 'none',
            strokeWidthMm: 0.35,
            visible: true,
          },
          true
        );
      }
    } else if (drag.kind === 'draw-circle') {
      const r = Math.hypot(drag.edge.x - drag.center.x, drag.edge.y - drag.center.y);
      if (r >= 0.1) {
        const d = circleToPath(drag.center.x, drag.center.y, r);
        onCreateShape(
          {
            kind: 'circle',
            localPaths: [d],
            matrix: IDENTITY_MATRIX,
            fillColor: 'none',
            strokeWidthMm: 0.35,
            visible: true,
          },
          true
        );
      }
    } else if (drag.kind === 'draw-ellipse') {
      const rx = Math.abs(drag.current.x - drag.start.x) / 2;
      const ry = Math.abs(drag.current.y - drag.start.y) / 2;
      if (rx >= 0.1 && ry >= 0.1) {
        const cx = (drag.start.x + drag.current.x) / 2;
        const cy = (drag.start.y + drag.current.y) / 2;
        const d = ellipseToPath(cx, cy, rx, ry);
        onCreateShape(
          {
            kind: 'ellipse',
            localPaths: [d],
            matrix: IDENTITY_MATRIX,
            fillColor: 'none',
            strokeWidthMm: 0.35,
            visible: true,
          },
          true
        );
      }
    } else if (drag.kind === 'draw-polygon') {
      const r = Math.hypot(drag.edge.x - drag.center.x, drag.edge.y - drag.center.y);
      if (r >= 0.15) {
        const d = regularPolygonToPath(drag.center.x, drag.center.y, r, polygonSides);
        onCreateShape(
          {
            kind: 'polygon',
            sides: polygonSides,
            localPaths: [d],
            matrix: IDENTITY_MATRIX,
            fillColor: 'none',
            strokeWidthMm: 0.35,
            visible: true,
          },
          true
        );
      }
    }

    setDrag(null);
  };

  // Start scale or rotation from selection handle
  const startHandleScale = (e: React.PointerEvent, anchor: Point2D) => {
    e.stopPropagation();
    const rawMath = clientToMath(e.clientX, e.clientY);
    const movable = shapes.filter(
      (s) => selectedShapeIds.includes(s.id) && !s.derivedFrom && !s.locked
    );
    if (movable.length === 0) return;
    onBeginDragHistory();
    setDrag({
      kind: 'scale-shapes',
      anchor,
      startDist: Math.max(0.15, Math.hypot(rawMath.x - anchor.x, rawMath.y - anchor.y)),
      items: movable.map((s) => ({ id: s.id, startMatrix: s.matrix })),
    });
  };

  const startHandleRotate = (e: React.PointerEvent, center: Point2D) => {
    e.stopPropagation();
    const rawMath = clientToMath(e.clientX, e.clientY);
    const movable = shapes.filter(
      (s) => selectedShapeIds.includes(s.id) && !s.derivedFrom && !s.locked
    );
    if (movable.length === 0) return;
    onBeginDragHistory();
    const startAngleDeg =
      (Math.atan2(rawMath.y - center.y, rawMath.x - center.x) * 180) / Math.PI;
    setDrag({
      kind: 'rotate-shapes',
      center,
      startAngleDeg,
      items: movable.map((s) => ({ id: s.id, startMatrix: s.matrix })),
    });
  };

  // Grid line calculation
  const gridElements = useMemo(() => {
    const halfW = vbW / 20; // cm
    const halfH = vbH / 20;
    const minX = Math.floor(camera.cx - halfW) - 1;
    const maxX = Math.ceil(camera.cx + halfW) + 1;
    const minY = Math.floor(camera.cy - halfH) - 1;
    const maxY = Math.ceil(camera.cy + halfH) + 1;

    const majorX: number[] = [];
    const majorY: number[] = [];
    for (let x = minX; x <= maxX; x++) majorX.push(x);
    for (let y = minY; y <= maxY; y++) majorY.push(y);

    const minorX: number[] = [];
    const minorY: number[] = [];
    if (grid.step > 0 && grid.step < 1 && grid.step * pxPerCm >= 9) {
      const subPerCm = Math.round(1 / grid.step);
      for (let x = minX; x < maxX; x++) {
        for (let k = 1; k < subPerCm; k++) {
          minorX.push(roundCoord(x + k * grid.step));
        }
      }
      for (let y = minY; y < maxY; y++) {
        for (let k = 1; k < subPerCm; k++) {
          minorY.push(roundCoord(y + k * grid.step));
        }
      }
    }

    return { minX, maxX, minY, maxY, majorX, majorY, minorX, minorY };
  }, [vbW, vbH, camera.cx, camera.cy, grid.step, pxPerCm]);

  const borderCutPaths = useMemo(() => buildBoardBorderSvgPaths(board), [board]);

  // Ghost preview for Rotation / Rosette / Translation configure step
  const ghostPreviews = useMemo(() => {
    if (!wizard || wizard.step !== 'configure') return [];
    const srcShapes = shapes.filter((s) => wizard.sourceIds.includes(s.id));
    if (srcShapes.length === 0) return [];

    const copiesCount =
      wizard.tool === 't-rosette'
        ? Math.max(1, wizard.copies - 1)
        : wizard.tool === 't-translation'
          ? Math.max(1, wizard.repeatCount)
          : 1;

    const params: TransformParams =
      wizard.tool === 't-rotation'
        ? {
            type: 'rotation',
            pointId: wizard.refId,
            angleDeg: wizard.angleDeg,
            keepOriginal: wizard.keepOriginal,
          }
        : wizard.tool === 't-rosette'
          ? {
              type: 'rosette',
              pointId: wizard.refId,
              copies: wizard.copies,
              keepOriginal: true,
            }
          : {
              type: 'translation',
              vectorId: wizard.refId,
              dx: wizard.dx,
              dy: wizard.dy,
              repeatCount: wizard.repeatCount,
              keepOriginal: wizard.keepOriginal,
            };

    const result: { paths: string[]; dots?: Point2D[] }[] = [];
    const appendGhost = (shape: DesignShape, m: Matrix2D) => {
      if (!shape.visible) return;
      if (shape.kind === 'group' && shape.children) {
        for (const ch of shape.children) {
          appendGhost(ch, multiplyMatrices(m, ch.matrix));
        }
        return;
      }
      if (shape.kind === 'dots' && shape.localDots) {
        result.push({
          paths: [],
          dots: shape.localDots.map((pt) =>
            mathToSvgMm(applyMatrix(m, pt), board.widthCm, board.heightCm)
          ),
        });
      } else {
        const lp = getShapeLocalPaths(shape);
        result.push({
          paths: lp.map(
            (d) => transformMathPath(d, m, board.widthCm, board.heightCm).svgD
          ),
        });
      }
    };

    for (let c = 0; c < copiesCount; c++) {
      const opMat = buildTransformMatrixForParams(params, refs, c);
      for (const s of srcShapes) {
        appendGhost(s, multiplyMatrices(opMat, s.matrix));
      }
    }
    return result;
  }, [wizard, shapes, refs, board.widthCm, board.heightCm]);

  const selectedShapes = useMemo(
    () => shapes.filter((s) => selectedShapeIds.includes(s.id) && s.visible),
    [shapes, selectedShapeIds]
  );
  const canGroup = canGroupShapes(selectedShapes);
  const canUngroup = canUngroupShapes(selectedShapes);
  const canJoin = canJoinShapes(selectedShapes);
  const canSplit = canSplitShapes(selectedShapes, shapes);
  const singleSelected = selectedShapes.length === 1 ? selectedShapes[0] : null;
  const showToggleClose = singleSelected ? canToggleCloseShape(singleSelected) : false;
  const singleIsClosed = singleSelected ? isShapeClosed(singleSelected) : false;

  const strokeScale = mmPerPx; // 1 screen pixel in mm

  const cursorStyle =
    drag?.kind === 'pan' ||
    activeTool === 'pan' ||
    (appMode === 'laser-prep' && laserTool === 'pan') ||
    spacePressed
      ? 'grab'
      : appMode === 'laser-prep'
        ? laserTool === 'brush'
          ? 'crosshair'
          : 'pointer'
        : activeTool === 'select'
          ? 'default'
          : 'crosshair';

  // Helper to clip infinite RefLine to visible viewport box
  const getInfiniteLineEndpointsMm = (line: RefLine): [Point2D, Point2D] | null => {
    const dx = line.p2.x - line.p1.x;
    const dy = line.p2.y - line.p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    const ux = dx / len;
    const uy = dy / len;
    const reach = Math.max(board.widthCm, board.heightCm, vbW / 10, vbH / 10) * 2;
    const a = { x: line.p1.x - ux * reach, y: line.p1.y - uy * reach };
    const b = { x: line.p1.x + ux * reach, y: line.p1.y + uy * reach };
    return [
      mathToSvgMm(a, board.widthCm, board.heightCm),
      mathToSvgMm(b, board.widthCm, board.heightCm),
    ];
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 relative bg-slate-200/80 overflow-hidden select-none"
    >
      {/* Top Guidance Banner for Laser Prep Mode */}
      {appMode === 'laser-prep' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[92%] flex flex-wrap items-center justify-center gap-2 bg-white/95 backdrop-blur-xs border border-orange-200 shadow-lg rounded-xl px-3.5 py-2 text-xs">
          <span className="font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200 text-[10px] uppercase">
            Modo Profundidad Láser
          </span>
          {laserTool === 'brush' ? (
            <span className="text-slate-700 font-medium flex items-center gap-1.5">
              Pincel activo:{' '}
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: LASER_LAYER_MAP[activeBrushLayer].color }}
              />
              <strong>{LASER_LAYER_MAP[activeBrushLayer].name}</strong> — Haz clic sobre cualquier figura para asignarle esta profundidad.
            </span>
          ) : (
            <span className="text-slate-700 font-medium">
              Haz clic en una figura (o usa Shift+clic / Pincel Láser) y elige su profundidad a la derecha.
            </span>
          )}
        </div>
      )}

      {/* Block Feedback Toast Banner */}
      {appMode === 'design' && blockFeedback && !wizard && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[92%] flex items-center gap-2 bg-slate-900 text-white shadow-xl rounded-xl px-3.5 py-2 text-xs">
          <span className="font-medium">{blockFeedback}</span>
          {onDismissBlockFeedback && (
            <button
              type="button"
              onClick={onDismissBlockFeedback}
              className="p-0.5 rounded hover:bg-white/15 cursor-pointer"
              title="Cerrar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Contextual Selection & Block Actions Bar */}
      {appMode === 'design' &&
        !wizard &&
        !blockFeedback &&
        activeTool === 'select' &&
        selectedShapes.length > 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[92%] flex flex-wrap items-center justify-center gap-1.5 bg-white/95 backdrop-blur-xs border border-indigo-200 shadow-lg rounded-xl px-3 py-1.5 text-xs">
            <span className="text-[11px] font-bold text-slate-800 pr-1">
              {selectedShapes.length === 1 && singleSelected?.kind === 'group'
                ? `${singleSelected.name} (${getGroupLeafStats(singleSelected).leafCount} elem.)`
                : selectedShapes.length === 1
                  ? singleSelected?.name
                  : `${selectedShapes.length} seleccionados`}
            </span>

            {canGroup && onGroupSelected && (
              <button
                type="button"
                onClick={onGroupSelected}
                title="Agrupar selección en un bloque conjunto (Ctrl+G)"
                className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition"
              >
                <Group className="w-3.5 h-3.5" />
                <span>Agrupar en bloque</span>
              </button>
            )}

            {canJoin && onJoinSelected && (
              <button
                type="button"
                onClick={onJoinSelected}
                title="Unir líneas conectadas en una sola figura cerrada rellenable (Ctrl+J)"
                className="px-2 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition"
              >
                <Combine className="w-3.5 h-3.5" />
                <span>Unir trazos</span>
              </button>
            )}

            {canSplit && onSplitSelected && (
              <button
                type="button"
                onClick={onSplitSelected}
                title="Dividir en trazos individuales o por sus intersecciones para borrar partes por separado (Ctrl+Shift+J)"
                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition"
              >
                <Split className="w-3.5 h-3.5" />
                <span>Dividir</span>
              </button>
            )}

            {canUngroup && onUngroupSelected && (
              <button
                type="button"
                onClick={onUngroupSelected}
                title="Desagrupar bloque en sus elementos originales (Ctrl+Shift+G)"
                className="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition"
              >
                <Ungroup className="w-3.5 h-3.5" />
                <span>Desagrupar</span>
              </button>
            )}

            {showToggleClose && singleSelected && onToggleCloseShape && (
              <button
                type="button"
                onClick={() => onToggleCloseShape(singleSelected.id)}
                title={
                  singleIsClosed
                    ? 'Abrir el contorno para editarlo como línea abierta'
                    : 'Cerrar el contorno conectando inicio y fin para poder pintarlo'
                }
                className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition"
              >
                <Pentagon className="w-3.5 h-3.5" />
                <span>{singleIsClosed ? 'Abrir contorno' : 'Cerrar contorno'}</span>
              </button>
            )}

            {onDuplicateShapes && (
              <button
                type="button"
                onClick={() => onDuplicateShapes(selectedShapeIds)}
                title="Duplicar selección (Ctrl+D)"
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                onDeleteShapes
                  ? onDeleteShapes(selectedShapeIds)
                  : selectedShapeIds.forEach((id) => onDeleteShape(id))
              }
              title="Eliminar selección (Supr)"
              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      {/* Top Guidance Banner for Multi-Step Tools & Isometric Transformations */}
      {appMode === 'design' &&
        (wizard ||
          activeTool === 'ref-line' ||
          activeTool === 'ref-vector' ||
          activeTool === 'preset' ||
          activeTool === 'curve' ||
          activeTool === 'spline' ||
          activeTool === 'text' ||
          activeTool === 'trim' ||
          (mirrorSymmetry > 1 &&
            (activeTool === 'freehand' ||
              activeTool === 'dots' ||
              activeTool === 'segment'))) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[92%] flex flex-wrap items-center justify-center gap-2 bg-white/95 backdrop-blur-xs border border-slate-200 shadow-lg rounded-xl px-3.5 py-2 text-xs">
          {!wizard && activeTool === 'trim' && (
            <span className="text-rose-700 font-medium">
              ✂️ <strong>Recortar tramo:</strong> Pasa el mouse sobre la parte de la línea o intersección que no quieras y haz clic para borrar solo ese tramo.
            </span>
          )}
          {!wizard && activeTool === 'preset' && (
            <span className="text-slate-700 font-medium">
              Estampa seleccionada:{' '}
              <strong className="text-indigo-700">
                {PRESET_DEFINITIONS[activePreset].label}
              </strong>{' '}
              — Haz clic en el lienzo para colocarla (con imán a la cuadrícula).
            </span>
          )}

          {!wizard && activeTool === 'text' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-700 font-medium">
                Texto vectorial: Haz clic en el tablero donde quieras colocarlo, o
              </span>
              <button
                type="button"
                onClick={() => onOpenTextModal?.({ x: 0, y: 0 })}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] cursor-pointer"
              >
                Escribir en (0, 0)
              </button>
            </div>
          )}

          {!wizard && activeTool === 'curve' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-700 font-medium">
                {!pendingCurve
                  ? 'Curva de 3 puntos (Paso 1): Haz clic en el punto inicial.'
                  : !pendingCurve.end
                    ? 'Curva (Paso 2): Haz clic en el punto final.'
                    : 'Curva (Paso 3): Mueve el mouse para darle la curva exacta y haz clic para fijarla.'}
              </span>
              {pendingCurve && (
                <button
                  type="button"
                  onClick={() => setPendingCurve(null)}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium cursor-pointer"
                >
                  Reiniciar
                </button>
              )}
            </div>
          )}

          {!wizard && activeTool === 'spline' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-700 font-medium">
                {pendingSpline.length === 0
                  ? 'Curva continua: Haz clic punto por punto para trazar curvas suaves.'
                  : pendingSpline.length < 3
                    ? `Curva continua (${pendingSpline.length} puntos): Sigue haciendo clic o doble clic para terminar.`
                    : `Curva continua (${pendingSpline.length} puntos): Haz clic en el punto inicial para cerrarla o usa:`}
              </span>
              {pendingSpline.length >= 2 && (
                <button
                  type="button"
                  onClick={() => finishPendingSpline(false)}
                  className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold cursor-pointer"
                >
                  Terminar abierta
                </button>
              )}
              {pendingSpline.length >= 3 && (
                <button
                  type="button"
                  onClick={() => finishPendingSpline(true)}
                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                >
                  Cerrar figura
                </button>
              )}
              {pendingSpline.length >= 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPendingSpline((prev) => prev.slice(0, -1))}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium cursor-pointer"
                  >
                    Deshacer punto
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingSpline([])}
                    className="px-2 py-0.5 rounded text-rose-600 hover:bg-rose-50 text-[11px] font-medium cursor-pointer"
                  >
                    Cancelar
                  </button>
                </>
              )}
            </div>
          )}

          {!wizard && activeTool === 'ref-line' && (
            <span className="text-slate-700 font-medium">
              {pendingRefStart
                ? `Punto 1 en (${formatNum(pendingRefStart.x)}, ${formatNum(pendingRefStart.y)}). Haz clic en el segundo punto de la recta.`
                : 'Recta / Eje: Haz clic en el primer punto (con imán a cuadrícula).'}
            </span>
          )}

          {!wizard && activeTool === 'ref-vector' && (
            <span className="text-slate-700 font-medium">
              {pendingRefStart
                ? `Origen en (${formatNum(pendingRefStart.x)}, ${formatNum(pendingRefStart.y)}). Haz clic en la punta del vector.`
                : 'Vector de traslación: Haz clic en el punto de inicio.'}
            </span>
          )}

          {!wizard &&
            mirrorSymmetry > 1 &&
            (activeTool === 'freehand' ||
              activeTool === 'dots' ||
              activeTool === 'segment' ||
              activeTool === 'curve' ||
              activeTool === 'spline' ||
              activeTool === 'preset' ||
              activeTool === 'text') && (
              <span className="text-violet-700 font-semibold">
                ✨ Espejo radial {mirrorSymmetry}× activo alrededor de (0, 0)
              </span>
            )}

          {wizard && (
            <>
              <span className="font-bold text-emerald-700 uppercase tracking-wide text-[10px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {wizard.tool === 't-axial' && 'Simetría Axial'}
                {wizard.tool === 't-central' && 'Simetría Central'}
                {wizard.tool === 't-rotation' && 'Rotación'}
                {wizard.tool === 't-rosette' && 'Rosetón / Mandala'}
                {wizard.tool === 't-translation' && 'Traslación'}
              </span>

              {wizard.step === 'pick-shape' && (
                <span className="text-slate-700 font-medium">
                  Paso 1: Haz clic en la figura que quieres transformar.
                </span>
              )}

              {wizard.step === 'pick-ref' && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-700 font-medium">
                    {wizard.tool === 't-axial' &&
                      'Paso 2: Haz clic en una recta guía, o elige un eje rápido:'}
                    {wizard.tool === 't-central' &&
                      'Paso 2: Haz clic en un punto centro (o directo en la cuadrícula).'}
                    {(wizard.tool === 't-rotation' || wizard.tool === 't-rosette') &&
                      'Paso 2: Haz clic en el punto centro de rotación.'}
                    {wizard.tool === 't-translation' &&
                      'Paso 2: Haz clic en un vector guía o ingresa el desplazamiento:'}
                  </span>

                  {wizard.tool === 't-axial' && (
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { k: 'y', label: 'Eje Y' },
                          { k: 'x', label: 'Eje X' },
                          { k: 'diag1', label: 'y = x' },
                          { k: 'diag2', label: 'y = -x' },
                        ] as const
                      ).map((ax) => (
                        <button
                          key={ax.k}
                          type="button"
                          onClick={() => {
                            const line = onQuickAddAxis(ax.k);
                            onApplyTransform(wizard.sourceIds, {
                              type: 'axial',
                              lineId: line.id,
                              keepOriginal: wizard.keepOriginal,
                            });
                            setWizard(null);
                            onSelectTool('select');
                          }}
                          className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-semibold text-[11px] cursor-pointer"
                        >
                          {ax.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {wizard.tool === 't-translation' && (
                    <button
                      type="button"
                      onClick={() => setWizard({ ...wizard, step: 'configure' })}
                      className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold text-[11px] cursor-pointer"
                    >
                      Escribir (dx, dy) en cm
                    </button>
                  )}

                  {(wizard.tool === 't-axial' || wizard.tool === 't-central') && (
                    <label className="flex items-center gap-1 text-[11px] text-slate-600 border-l border-slate-200 pl-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wizard.keepOriginal}
                        onChange={(e) =>
                          setWizard({ ...wizard, keepOriginal: e.target.checked })
                        }
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      Mantener original
                    </label>
                  )}
                </div>
              )}

              {wizard.step === 'configure' && (
                <div className="flex flex-wrap items-center gap-2">
                  {wizard.tool === 't-rotation' && (
                    <>
                      <span className="text-slate-600">Ángulo:</span>
                      {[30, 45, 60, 90, 120, 180].map((ang) => (
                        <button
                          key={ang}
                          type="button"
                          onClick={() => setWizard({ ...wizard, angleDeg: ang })}
                          className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold cursor-pointer ${
                            wizard.angleDeg === ang
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {ang}°
                        </button>
                      ))}
                      <input
                        type="number"
                        step={5}
                        value={wizard.angleDeg}
                        onChange={(e) =>
                          setWizard({ ...wizard, angleDeg: Number(e.target.value) })
                        }
                        className="w-14 px-1.5 py-0.5 border border-slate-300 rounded text-center font-semibold"
                      />
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wizard.keepOriginal}
                          onChange={(e) =>
                            setWizard({ ...wizard, keepOriginal: e.target.checked })
                          }
                          className="rounded border-slate-300 text-emerald-600"
                        />
                        Mantener original
                      </label>
                    </>
                  )}

                  {wizard.tool === 't-rosette' && (
                    <>
                      <span className="text-slate-600">Repeticiones totales:</span>
                      {[4, 6, 8, 10, 12].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setWizard({ ...wizard, copies: n })}
                          className={`px-2 py-0.5 rounded border text-[11px] font-semibold cursor-pointer ${
                            wizard.copies === n
                              ? 'bg-violet-600 text-white border-violet-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {n}×
                        </button>
                      ))}
                      <input
                        type="number"
                        min={2}
                        max={24}
                        value={wizard.copies}
                        onChange={(e) =>
                          setWizard({
                            ...wizard,
                            copies: Math.max(2, Math.min(24, Number(e.target.value) || 6)),
                          })
                        }
                        className="w-12 px-1 py-0.5 border border-slate-300 rounded text-center font-semibold"
                      />
                    </>
                  )}

                  {wizard.tool === 't-translation' && (
                    <>
                      <label className="flex items-center gap-1 text-slate-600">
                        dx:
                        <input
                          type="number"
                          step={grid.step || 0.5}
                          value={wizard.dx}
                          onChange={(e) =>
                            setWizard({
                              ...wizard,
                              refId: undefined,
                              dx: Number(e.target.value) || 0,
                            })
                          }
                          className="w-14 px-1 py-0.5 border border-slate-300 rounded text-center font-semibold"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-slate-600">
                        dy:
                        <input
                          type="number"
                          step={grid.step || 0.5}
                          value={wizard.dy}
                          onChange={(e) =>
                            setWizard({
                              ...wizard,
                              refId: undefined,
                              dy: Number(e.target.value) || 0,
                            })
                          }
                          className="w-14 px-1 py-0.5 border border-slate-300 rounded text-center font-semibold"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-slate-600">
                        Copias:
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={wizard.repeatCount}
                          onChange={(e) =>
                            setWizard({
                              ...wizard,
                              repeatCount: Math.max(
                                1,
                                Math.min(12, Number(e.target.value) || 1)
                              ),
                            })
                          }
                          className="w-12 px-1 py-0.5 border border-slate-300 rounded text-center font-semibold"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wizard.keepOriginal}
                          onChange={(e) =>
                            setWizard({ ...wizard, keepOriginal: e.target.checked })
                          }
                          className="rounded border-slate-300 text-emerald-600"
                        />
                        Mantener original
                      </label>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (wizard.tool === 't-rotation') {
                        onApplyTransform(wizard.sourceIds, {
                          type: 'rotation',
                          pointId: wizard.refId,
                          angleDeg: wizard.angleDeg,
                          keepOriginal: wizard.keepOriginal,
                        });
                      } else if (wizard.tool === 't-rosette') {
                        onApplyTransform(wizard.sourceIds, {
                          type: 'rosette',
                          pointId: wizard.refId,
                          copies: wizard.copies,
                          keepOriginal: true,
                        });
                      } else if (wizard.tool === 't-translation') {
                        onApplyTransform(wizard.sourceIds, {
                          type: 'translation',
                          vectorId: wizard.refId,
                          dx: wizard.dx,
                          dy: wizard.dy,
                          repeatCount: wizard.repeatCount,
                          keepOriginal: wizard.keepOriginal,
                        });
                      }
                      setWizard(null);
                      onSelectTool('select');
                    }}
                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer shadow-xs"
                  >
                    Aplicar
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setWizard(null);
                  onSelectTool('select');
                }}
                className="text-slate-400 hover:text-slate-700 font-medium pl-1 cursor-pointer"
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      )}

      {/* Main SVG Workspace */}
      <svg
        ref={svgRef}
        viewBox={viewBoxStr}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => {
          if (activeTool === 'spline' && pendingSpline.length >= 2) {
            finishPendingSpline(false);
          }
        }}
        style={{ cursor: cursorStyle, touchAction: 'none' }}
        className="w-full h-full block"
      >
        <defs>
          <filter id="board-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow
              dx="0"
              dy={2 * strokeScale}
              stdDeviation={6 * strokeScale}
              floodColor="#0f172a"
              floodOpacity="0.14"
            />
          </filter>
          <pattern id="wood-grain" width="60" height="60" patternUnits="userSpaceOnUse">
            <rect width="60" height="60" fill="#f3dfc1" />
            <path
              d="M 0 10 Q 20 8 40 11 T 60 10 M 0 28 Q 25 31 50 27 T 60 28 M 0 46 Q 15 44 35 47 T 60 46"
              fill="none"
              stroke="#e5c89f"
              strokeWidth="0.9"
            />
          </pattern>
        </defs>

        {/* Wooden / Paper Board Surface */}
        <g filter="url(#board-shadow)">
          {board.borderShape === 'circle' ? (
            <circle
              cx={(board.widthCm * 10) / 2}
              cy={(board.heightCm * 10) / 2}
              r={(Math.min(board.widthCm, board.heightCm) * 10) / 2}
              fill={
                appMode === 'laser-prep' && laserPreviewStyle === 'wood'
                  ? 'url(#wood-grain)'
                  : viewMode === 'laser' || appMode === 'laser-prep'
                    ? '#ffffff'
                    : '#fffdf9'
              }
            />
          ) : (
            <rect
              x={0}
              y={0}
              width={board.widthCm * 10}
              height={board.heightCm * 10}
              rx={board.borderShape === 'rounded' ? board.cornerRadiusCm * 10 : 0}
              fill={
                appMode === 'laser-prep' && laserPreviewStyle === 'wood'
                  ? 'url(#wood-grain)'
                  : viewMode === 'laser' || appMode === 'laser-prep'
                    ? '#ffffff'
                    : '#fffdf9'
              }
            />
          )}
        </g>

        {/* Adaptive Grid */}
        {grid.showGrid && appMode === 'design' && (
          <g pointerEvents="none">
            {gridElements.minorX.map((x) => {
              const sx = mathToSvgMm({ x, y: 0 }, board.widthCm, board.heightCm).x;
              return (
                <line
                  key={`mx-${x}`}
                  x1={sx}
                  y1={viewBoxMinY}
                  x2={sx}
                  y2={viewBoxMinY + vbH}
                  stroke="#e2e8f0"
                  strokeOpacity={0.65}
                  strokeWidth={0.6 * strokeScale}
                />
              );
            })}
            {gridElements.minorY.map((y) => {
              const sy = mathToSvgMm({ x: 0, y }, board.widthCm, board.heightCm).y;
              return (
                <line
                  key={`my-${y}`}
                  x1={viewBoxMinX}
                  y1={sy}
                  x2={viewBoxMinX + vbW}
                  y2={sy}
                  stroke="#e2e8f0"
                  strokeOpacity={0.65}
                  strokeWidth={0.6 * strokeScale}
                />
              );
            })}
            {gridElements.majorX.map((x) => {
              const sx = mathToSvgMm({ x, y: 0 }, board.widthCm, board.heightCm).x;
              const isAxis = x === 0 && grid.showAxes;
              return (
                <line
                  key={`X-${x}`}
                  x1={sx}
                  y1={viewBoxMinY}
                  x2={sx}
                  y2={viewBoxMinY + vbH}
                  stroke={isAxis ? '#94a3b8' : '#cbd5e1'}
                  strokeOpacity={isAxis ? 0.9 : 0.7}
                  strokeWidth={(isAxis ? 1.3 : 0.8) * strokeScale}
                />
              );
            })}
            {gridElements.majorY.map((y) => {
              const sy = mathToSvgMm({ x: 0, y }, board.widthCm, board.heightCm).y;
              const isAxis = y === 0 && grid.showAxes;
              return (
                <line
                  key={`Y-${y}`}
                  x1={viewBoxMinX}
                  y1={sy}
                  x2={viewBoxMinX + vbW}
                  y2={sy}
                  stroke={isAxis ? '#94a3b8' : '#cbd5e1'}
                  strokeOpacity={isAxis ? 0.9 : 0.7}
                  strokeWidth={(isAxis ? 1.3 : 0.8) * strokeScale}
                />
              );
            })}
          </g>
        )}

        {/* Axes when grid is off */}
        {!grid.showGrid && grid.showAxes && appMode === 'design' && (
          <g pointerEvents="none">
            <line
              x1={mathToSvgMm({ x: 0, y: 0 }, board.widthCm, board.heightCm).x}
              y1={viewBoxMinY}
              x2={mathToSvgMm({ x: 0, y: 0 }, board.widthCm, board.heightCm).x}
              y2={viewBoxMinY + vbH}
              stroke="#94a3b8"
              strokeWidth={1.2 * strokeScale}
            />
            <line
              x1={viewBoxMinX}
              y1={mathToSvgMm({ x: 0, y: 0 }, board.widthCm, board.heightCm).y}
              x2={viewBoxMinX + vbW}
              y2={mathToSvgMm({ x: 0, y: 0 }, board.widthCm, board.heightCm).y}
              stroke="#94a3b8"
              strokeWidth={1.2 * strokeScale}
            />
          </g>
        )}

        {/* Axis numbers */}
        {grid.showNumbers && grid.showAxes && appMode === 'design' && (
          <g pointerEvents="none" fill="#64748b" fontSize={10 * strokeScale} fontFamily="monospace">
            {gridElements.majorX
              .filter((x) => {
                if (x === 0) return false;
                if (pxPerCm < 24) return x % 2 === 0;
                return true;
              })
              .map((x) => {
                const pos = mathToSvgMm({ x, y: 0 }, board.widthCm, board.heightCm);
                return (
                  <text key={`nx-${x}`} x={pos.x + 2 * strokeScale} y={pos.y - 3 * strokeScale}>
                    {x}
                  </text>
                );
              })}
            {gridElements.majorY
              .filter((y) => {
                if (y === 0) return false;
                if (pxPerCm < 24) return y % 2 === 0;
                return true;
              })
              .map((y) => {
                const pos = mathToSvgMm({ x: 0, y }, board.widthCm, board.heightCm);
                return (
                  <text key={`ny-${y}`} x={pos.x + 3 * strokeScale} y={pos.y - 2 * strokeScale}>
                    {y}
                  </text>
                );
              })}
          </g>
        )}

        {/* Design Shapes (Engraving Layer) */}
        <g strokeLinecap="round" strokeLinejoin="round">
          {(() => {
            const renderShapeSvg = (
              shape: DesignShape,
              parentMatrix: Matrix2D,
              inheritedLayer: LaserDepthId | undefined,
              isSel: boolean,
              isWizSrc: boolean
            ): React.ReactNode => {
              if (!shape.visible) return null;
              const worldMatrix = multiplyMatrices(parentMatrix, shape.matrix);
              const effectiveLayer = shape.laserLayer ?? inheritedLayer;

              if (shape.kind === 'group' && shape.children) {
                return (
                  <g key={shape.id}>
                    {shape.children.map((child) =>
                      renderShapeSvg(child, worldMatrix, effectiveLayer, isSel, isWizSrc)
                    )}
                  </g>
                );
              }

              const shapeLayerId = effectiveLayer ?? 'engrave-medium';
              const layerDef = LASER_LAYER_MAP[shapeLayerId];
              const isLaserPrep = appMode === 'laser-prep';
              const isWood = isLaserPrep && laserPreviewStyle === 'wood';

              if (shape.kind === 'dots' && shape.localDots) {
                const rMm = (shape.dotRadiusCm ?? 0.08) * 10;
                const sx = Math.hypot(worldMatrix[0], worldMatrix[1]);
                const sy = Math.hypot(worldMatrix[2], worldMatrix[3]);
                const scaledRMm = Math.max(0.3, rMm * ((sx + sy) / 2));
                const dotColor = isWizSrc
                  ? '#059669'
                  : isLaserPrep
                    ? isWood
                      ? layerDef.woodPreviewColor
                      : layerDef.color
                    : isSel && activeTool === 'select'
                      ? '#1d4ed8'
                      : '#0f172a';
                return (
                  <g key={shape.id}>
                    {shape.localDots.map((dot, idx) => {
                      const sp = mathToSvgMm(
                        applyMatrix(worldMatrix, dot),
                        board.widthCm,
                        board.heightCm
                      );
                      return (
                        <circle
                          key={idx}
                          cx={sp.x}
                          cy={sp.y}
                          r={scaledRMm}
                          fill={dotColor}
                        />
                      );
                    })}
                  </g>
                );
              }

              if (shape.kind === 'tessellation' && shape.tessellation) {
                const baseSw = Math.max(shape.strokeWidthMm, 1.3 * strokeScale);
                const showTessPaint =
                  !isLaserPrep && viewMode === 'paint' && shape.tessellation.autoColor;
                const hw = shape.tessellation.widthCm / 2;
                const hh = shape.tessellation.heightCm / 2;
                const borderPts = [
                  { x: -hw, y: -hh },
                  { x: hw, y: -hh },
                  { x: hw, y: hh },
                  { x: -hw, y: hh },
                ].map((pt) =>
                  mathToSvgMm(
                    applyMatrix(worldMatrix, pt),
                    board.widthCm,
                    board.heightCm
                  )
                );

                return (
                  <g key={shape.id}>
                    {shape.tessellation.tiles.map((tile, idx) => {
                      const ptsStr = tile.points
                        .map((pt) => {
                          const sp = mathToSvgMm(
                            applyMatrix(worldMatrix, pt),
                            board.widthCm,
                            board.heightCm
                          );
                          return `${sp.x},${sp.y}`;
                        })
                        .join(' ');
                      const roleLayerId =
                        shape.tessellation?.roleLaserLayers?.[tile.role] ?? shapeLayerId;
                      const roleDef = LASER_LAYER_MAP[roleLayerId];
                      const tileStroke = isWizSrc
                        ? '#059669'
                        : isLaserPrep
                          ? isWood
                            ? roleDef.woodPreviewColor
                            : roleDef.color
                          : isSel && activeTool === 'select'
                            ? '#1d4ed8'
                            : '#000000';
                      const tileFill = isLaserPrep
                        ? roleLayerId === 'engrave-fill'
                          ? isWood
                            ? roleDef.woodPreviewColor
                            : roleDef.color
                          : 'none'
                        : showTessPaint
                          ? tile.fillColor
                          : 'none';
                      const tileSw = isLaserPrep
                        ? baseSw * roleDef.woodStrokeWidthFactor
                        : baseSw;

                      return (
                        <polygon
                          key={idx}
                          points={ptsStr}
                          fill={tileFill}
                          fillOpacity={isLaserPrep ? (isWood ? 0.85 : 0.78) : 0.72}
                          stroke={tileStroke}
                          strokeWidth={tileSw}
                          strokeLinejoin="round"
                        />
                      );
                    })}
                    {shape.tessellation.includeBorder &&
                      (() => {
                        const bLayerId =
                          shape.tessellation?.borderLaserLayer ?? shapeLayerId;
                        const bDef = LASER_LAYER_MAP[bLayerId];
                        const bStroke = isWizSrc
                          ? '#059669'
                          : isLaserPrep
                            ? isWood
                              ? bDef.woodPreviewColor
                              : bDef.color
                            : isSel && activeTool === 'select'
                              ? '#1d4ed8'
                              : '#000000';
                        return (
                          <polygon
                            points={borderPts.map((p) => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke={bStroke}
                            strokeWidth={
                              isLaserPrep
                                ? baseSw * bDef.woodStrokeWidthFactor
                                : baseSw * 1.25
                            }
                            strokeLinejoin="round"
                          />
                        );
                      })()}
                  </g>
                );
              }

              const localPaths = getShapeLocalPaths(shape);
              const showPaint =
                !isLaserPrep &&
                viewMode === 'paint' &&
                isShapeFillable(shape) &&
                shape.fillColor &&
                shape.fillColor !== 'none';
              const isLayerFill = isLaserPrep && shapeLayerId === 'engrave-fill';
              const strokeColor = isWizSrc
                ? '#059669'
                : isLaserPrep
                  ? isWood
                    ? layerDef.woodPreviewColor
                    : layerDef.color
                  : isSel && activeTool === 'select'
                    ? '#1d4ed8'
                    : '#000000';
              const sw = isLaserPrep
                ? Math.max(shape.strokeWidthMm, 1.4 * strokeScale) *
                  layerDef.woodStrokeWidthFactor
                : Math.max(shape.strokeWidthMm, 1.4 * strokeScale);

              return (
                <g key={shape.id}>
                  {localPaths.map((d, idx) => {
                    const { svgD } = transformMathPath(
                      d,
                      worldMatrix,
                      board.widthCm,
                      board.heightCm
                    );
                    if (!svgD) return null;
                    const isClosed = d.trim().toUpperCase().endsWith('Z');
                    const fillThisPath =
                      showPaint && (shape.kind === 'preset' ? idx === 0 : isClosed);
                    const fill = isLayerFill
                      ? isClosed
                        ? isWood
                          ? layerDef.woodPreviewColor
                          : layerDef.color
                        : 'none'
                      : fillThisPath
                        ? shape.fillColor
                        : 'none';
                    return (
                      <path
                        key={idx}
                        d={svgD}
                        fill={fill}
                        fillRule="evenodd"
                        fillOpacity={isLayerFill ? (isWood ? 0.85 : 0.78) : 0.72}
                        stroke={strokeColor}
                        strokeWidth={sw}
                      />
                    );
                  })}
                </g>
              );
            };

            return shapes.map((shape) => {
              const isSel = selectedShapeIds.includes(shape.id);
              const isWizSrc = Boolean(wizard?.sourceIds.includes(shape.id));
              return renderShapeSvg(
                shape,
                IDENTITY_MATRIX,
                undefined,
                isSel,
                isWizSrc
              );
            });
          })()}
        </g>

        {/* Ghost Preview for Rotation / Rosette / Translation */}
        {ghostPreviews.length > 0 && (
          <g pointerEvents="none" opacity={0.55}>
            {ghostPreviews.map((gp, i) => (
              <g key={i}>
                {gp.paths.map((d, j) => (
                  <path
                    key={j}
                    d={d}
                    fill="none"
                    stroke="#059669"
                    strokeDasharray={`${4 * strokeScale} ${3 * strokeScale}`}
                    strokeWidth={1.6 * strokeScale}
                  />
                ))}
                {gp.dots?.map((pt, j) => (
                  <circle
                    key={j}
                    cx={pt.x}
                    cy={pt.y}
                    r={0.8}
                    fill="#059669"
                  />
                ))}
              </g>
            ))}
          </g>
        )}

        {/* Laser Cut Border (RED) */}
        <g pointerEvents="none">
          {borderCutPaths.map((d, idx) => (
            <path
              key={idx}
              d={d}
              fill="none"
              stroke={
                appMode === 'laser-prep' && laserPreviewStyle === 'wood'
                  ? '#1f1209'
                  : '#ef4444'
              }
              strokeWidth={Math.max(0.4, 2 * strokeScale)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>

        {/* Geometric References (Never exported to laser) */}
        {grid.showReferences && appMode === 'design' && (
          <g>
            {refs.map((ref) => {
              if (!ref.visible) return null;
              const isSel = selectedRefId === ref.id;

              if (ref.kind === 'line') {
                const pts = getInfiniteLineEndpointsMm(ref);
                if (!pts) return null;
                return (
                  <g key={ref.id}>
                    <line
                      x1={pts[0].x}
                      y1={pts[0].y}
                      x2={pts[1].x}
                      y2={pts[1].y}
                      stroke={isSel ? '#d97706' : ref.color}
                      strokeWidth={(isSel ? 2.4 : 1.6) * strokeScale}
                      strokeDasharray={`${6 * strokeScale} ${4 * strokeScale}`}
                    />
                    {(() => {
                      const mid = mathToSvgMm(
                        {
                          x: (ref.p1.x + ref.p2.x) / 2,
                          y: (ref.p1.y + ref.p2.y) / 2,
                        },
                        board.widthCm,
                        board.heightCm
                      );
                      return (
                        <text
                          x={mid.x + 4 * strokeScale}
                          y={mid.y - 4 * strokeScale}
                          fontSize={11 * strokeScale}
                          fontWeight="bold"
                          fill={ref.color}
                        >
                          {ref.name}
                        </text>
                      );
                    })()}
                  </g>
                );
              }

              if (ref.kind === 'vector') {
                const a = mathToSvgMm(ref.from, board.widthCm, board.heightCm);
                const b = mathToSvgMm(ref.to, board.widthCm, board.heightCm);
                const angle = Math.atan2(b.y - a.y, b.x - a.x);
                const head = 9 * strokeScale;
                const p1x = b.x - head * Math.cos(angle - Math.PI / 6);
                const p1y = b.y - head * Math.sin(angle - Math.PI / 6);
                const p2x = b.x - head * Math.cos(angle + Math.PI / 6);
                const p2y = b.y - head * Math.sin(angle + Math.PI / 6);
                return (
                  <g key={ref.id}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={isSel ? '#0284c7' : ref.color}
                      strokeWidth={(isSel ? 2.5 : 1.8) * strokeScale}
                    />
                    <polygon
                      points={`${b.x},${b.y} ${p1x},${p1y} ${p2x},${p2y}`}
                      fill={isSel ? '#0284c7' : ref.color}
                    />
                    <text
                      x={(a.x + b.x) / 2 + 4 * strokeScale}
                      y={(a.y + b.y) / 2 - 5 * strokeScale}
                      fontSize={11 * strokeScale}
                      fontWeight="bold"
                      fill={ref.color}
                    >
                      {ref.name}
                    </text>
                  </g>
                );
              }

              if (ref.kind === 'point') {
                const sp = mathToSvgMm(ref, board.widthCm, board.heightCm);
                return (
                  <g key={ref.id}>
                    {isSel && (
                      <circle
                        cx={sp.x}
                        cy={sp.y}
                        r={8 * strokeScale}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={1.6 * strokeScale}
                      />
                    )}
                    <circle
                      cx={sp.x}
                      cy={sp.y}
                      r={4.2 * strokeScale}
                      fill={ref.color}
                      stroke="#ffffff"
                      strokeWidth={1.4 * strokeScale}
                    />
                    <text
                      x={sp.x + 6 * strokeScale}
                      y={sp.y - 6 * strokeScale}
                      fontSize={11 * strokeScale}
                      fontWeight="bold"
                      fill="#b45309"
                    >
                      {ref.name} ({formatNum(ref.x)}, {formatNum(ref.y)})
                    </text>
                  </g>
                );
              }

              return null;
            })}
          </g>
        )}

        {/* Active Drawing Previews */}
        {drag?.kind === 'draw-freehand' && drag.points.length >= 2 && (
          <path
            d={
              transformMathPath(
                pointsToSmoothCubicPath(drag.points, 0.03),
                IDENTITY_MATRIX,
                board.widthCm,
                board.heightCm
              ).svgD
            }
            fill="none"
            stroke="#4f46e5"
            strokeWidth={1.8 * strokeScale}
            strokeLinecap="round"
          />
        )}

        {drag?.kind === 'draw-dots' && (
          <g>
            {sampleDotsAlongPoints(drag.points, 0.38).map((pt, i) => {
              const sp = mathToSvgMm(pt, board.widthCm, board.heightCm);
              return <circle key={i} cx={sp.x} cy={sp.y} r={0.8} fill="#4f46e5" />;
            })}
          </g>
        )}

        {drag?.kind === 'draw-segment' && (
          <line
            x1={mathToSvgMm(drag.start, board.widthCm, board.heightCm).x}
            y1={mathToSvgMm(drag.start, board.widthCm, board.heightCm).y}
            x2={mathToSvgMm(drag.current, board.widthCm, board.heightCm).x}
            y2={mathToSvgMm(drag.current, board.widthCm, board.heightCm).y}
            stroke="#4f46e5"
            strokeWidth={1.8 * strokeScale}
          />
        )}

        {drag?.kind === 'draw-circle' && (
          <circle
            cx={mathToSvgMm(drag.center, board.widthCm, board.heightCm).x}
            cy={mathToSvgMm(drag.center, board.widthCm, board.heightCm).y}
            r={
              Math.hypot(
                drag.edge.x - drag.center.x,
                drag.edge.y - drag.center.y
              ) * 10
            }
            fill="none"
            stroke="#4f46e5"
            strokeWidth={1.8 * strokeScale}
          />
        )}

        {drag?.kind === 'draw-ellipse' && (
          <ellipse
            cx={
              mathToSvgMm(
                {
                  x: (drag.start.x + drag.current.x) / 2,
                  y: (drag.start.y + drag.current.y) / 2,
                },
                board.widthCm,
                board.heightCm
              ).x
            }
            cy={
              mathToSvgMm(
                {
                  x: (drag.start.x + drag.current.x) / 2,
                  y: (drag.start.y + drag.current.y) / 2,
                },
                board.widthCm,
                board.heightCm
              ).y
            }
            rx={(Math.abs(drag.current.x - drag.start.x) / 2) * 10}
            ry={(Math.abs(drag.current.y - drag.start.y) / 2) * 10}
            fill="none"
            stroke="#4f46e5"
            strokeWidth={1.8 * strokeScale}
          />
        )}

        {drag?.kind === 'draw-polygon' && (
          <path
            d={
              transformMathPath(
                regularPolygonToPath(
                  drag.center.x,
                  drag.center.y,
                  Math.max(
                    0.05,
                    Math.hypot(
                      drag.edge.x - drag.center.x,
                      drag.edge.y - drag.center.y
                    )
                  ),
                  polygonSides
                ),
                IDENTITY_MATRIX,
                board.widthCm,
                board.heightCm
              ).svgD
            }
            fill="none"
            stroke="#4f46e5"
            strokeWidth={1.8 * strokeScale}
          />
        )}

        {/* Pending 3-Point Curve Preview */}
        {activeTool === 'curve' && pendingCurve && (
          <g pointerEvents="none">
            {(() => {
              const p1Mm = mathToSvgMm(
                pendingCurve.start,
                board.widthCm,
                board.heightCm
              );
              if (!pendingCurve.end) {
                const p2Mm = mathToSvgMm(
                  snappedCursor.point,
                  board.widthCm,
                  board.heightCm
                );
                return (
                  <>
                    <line
                      x1={p1Mm.x}
                      y1={p1Mm.y}
                      x2={p2Mm.x}
                      y2={p2Mm.y}
                      stroke="#4f46e5"
                      strokeDasharray={`${5 * strokeScale} ${3 * strokeScale}`}
                      strokeWidth={1.6 * strokeScale}
                    />
                    <circle cx={p1Mm.x} cy={p1Mm.y} r={4 * strokeScale} fill="#4f46e5" />
                  </>
                );
              }
              const p2Mm = mathToSvgMm(
                pendingCurve.end,
                board.widthCm,
                board.heightCm
              );
              const previewD = threePointCurveToQuadraticPath(
                pendingCurve.start,
                pendingCurve.end,
                snappedCursor.point
              );
              const { svgD } = transformMathPath(
                previewD,
                IDENTITY_MATRIX,
                board.widthCm,
                board.heightCm
              );
              return (
                <>
                  <line
                    x1={p1Mm.x}
                    y1={p1Mm.y}
                    x2={p2Mm.x}
                    y2={p2Mm.y}
                    stroke="#94a3b8"
                    strokeDasharray={`${4 * strokeScale} ${3 * strokeScale}`}
                    strokeWidth={1 * strokeScale}
                  />
                  <path
                    d={svgD}
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth={1.8 * strokeScale}
                    strokeLinecap="round"
                  />
                  <circle cx={p1Mm.x} cy={p1Mm.y} r={4 * strokeScale} fill="#4f46e5" />
                  <circle cx={p2Mm.x} cy={p2Mm.y} r={4 * strokeScale} fill="#4f46e5" />
                </>
              );
            })()}
          </g>
        )}

        {/* Pending Multi-Point Continuous Spline Preview */}
        {activeTool === 'spline' && pendingSpline.length >= 1 && (
          <g pointerEvents="none">
            {(() => {
              const first = pendingSpline[0];
              const closeTol = Math.max(0.12, 14 / pxPerCm);
              const hoveringClose =
                pendingSpline.length >= 3 &&
                Math.hypot(
                  snappedCursor.point.x - first.x,
                  snappedCursor.point.y - first.y
                ) <= closeTol;
              const previewPts = hoveringClose
                ? pendingSpline
                : [...pendingSpline, snappedCursor.point];
              const previewD = splinePointsToCubicPath(previewPts, hoveringClose);
              const { svgD } = transformMathPath(
                previewD,
                IDENTITY_MATRIX,
                board.widthCm,
                board.heightCm
              );
              const firstMm = mathToSvgMm(first, board.widthCm, board.heightCm);
              return (
                <>
                  {svgD && (
                    <path
                      d={svgD}
                      fill={hoveringClose ? 'rgba(16, 185, 129, 0.12)' : 'none'}
                      stroke={hoveringClose ? '#059669' : '#4f46e5'}
                      strokeWidth={1.8 * strokeScale}
                      strokeLinecap="round"
                    />
                  )}
                  {pendingSpline.map((pt, idx) => {
                    const pm = mathToSvgMm(pt, board.widthCm, board.heightCm);
                    return (
                      <circle
                        key={idx}
                        cx={pm.x}
                        cy={pm.y}
                        r={(idx === 0 ? 4.5 : 3.2) * strokeScale}
                        fill={idx === 0 && pendingSpline.length >= 3 ? '#10b981' : '#4f46e5'}
                        stroke="#ffffff"
                        strokeWidth={1.2 * strokeScale}
                      />
                    );
                  })}
                  {pendingSpline.length >= 3 && (
                    <circle
                      cx={firstMm.x}
                      cy={firstMm.y}
                      r={(hoveringClose ? 9 : 7) * strokeScale}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={1.4 * strokeScale}
                      strokeDasharray={`${3 * strokeScale} ${2 * strokeScale}`}
                    />
                  )}
                </>
              );
            })()}
          </g>
        )}

        {/* Pending Reference Line/Vector Preview */}
        {pendingRefStart && (activeTool === 'ref-line' || activeTool === 'ref-vector') && (
          <g pointerEvents="none">
            {(() => {
              const a = mathToSvgMm(pendingRefStart, board.widthCm, board.heightCm);
              const b = mathToSvgMm(snappedCursor.point, board.widthCm, board.heightCm);
              return (
                <>
                  <circle cx={a.x} cy={a.y} r={4 * strokeScale} fill="#f59e0b" />
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="#f59e0b"
                    strokeDasharray={`${5 * strokeScale} ${3 * strokeScale}`}
                    strokeWidth={1.6 * strokeScale}
                  />
                </>
              );
            })()}
          </g>
        )}

        {/* Selection Bounding Box & Transform Handles */}
        {(activeTool === 'select' || appMode === 'laser-prep') &&
          selectionBounds &&
          !wizard && (
          <g>
            {(() => {
              const tl = mathToSvgMm(
                { x: selectionBounds.minX, y: selectionBounds.maxY },
                board.widthCm,
                board.heightCm
              );
              const br = mathToSvgMm(
                { x: selectionBounds.maxX, y: selectionBounds.minY },
                board.widthCm,
                board.heightCm
              );
              const tr = { x: br.x, y: tl.y };
              const bl = { x: tl.x, y: br.y };
              const topMid = { x: (tl.x + br.x) / 2, y: tl.y };
              const rotHandle = { x: topMid.x, y: topMid.y - 22 * strokeScale };
              const boxCenter = { x: selectionBounds.cx, y: selectionBounds.cy };
              const hs = 4.5 * strokeScale;

              return (
                <>
                  <rect
                    x={tl.x}
                    y={tl.y}
                    width={Math.max(1, br.x - tl.x)}
                    height={Math.max(1, br.y - tl.y)}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={1.2 * strokeScale}
                    strokeDasharray={`${4 * strokeScale} ${3 * strokeScale}`}
                    pointerEvents="none"
                  />

                  {!selectedAreDerived && appMode === 'design' && (
                    <>
                      {/* Rotation stem & handle */}
                      <line
                        x1={topMid.x}
                        y1={topMid.y}
                        x2={rotHandle.x}
                        y2={rotHandle.y}
                        stroke="#3b82f6"
                        strokeWidth={1.2 * strokeScale}
                      />
                      <circle
                        cx={rotHandle.x}
                        cy={rotHandle.y}
                        r={5 * strokeScale}
                        fill="#ffffff"
                        stroke="#2563eb"
                        strokeWidth={1.6 * strokeScale}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(e) => startHandleRotate(e, boxCenter)}
                      />

                      {/* 4 corner scale handles */}
                      {[
                        {
                          pos: tl,
                          anchor: { x: selectionBounds.maxX, y: selectionBounds.minY },
                          cursor: 'nwse-resize',
                        },
                        {
                          pos: tr,
                          anchor: { x: selectionBounds.minX, y: selectionBounds.minY },
                          cursor: 'nesw-resize',
                        },
                        {
                          pos: br,
                          anchor: { x: selectionBounds.minX, y: selectionBounds.maxY },
                          cursor: 'nwse-resize',
                        },
                        {
                          pos: bl,
                          anchor: { x: selectionBounds.maxX, y: selectionBounds.maxY },
                          cursor: 'nesw-resize',
                        },
                      ].map((h, idx) => (
                        <rect
                          key={idx}
                          x={h.pos.x - hs}
                          y={h.pos.y - hs}
                          width={hs * 2}
                          height={hs * 2}
                          rx={1.5 * strokeScale}
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth={1.5 * strokeScale}
                          style={{ cursor: h.cursor }}
                          onPointerDown={(e) => startHandleScale(e, h.anchor)}
                        />
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </g>
        )}

        {/* Marquee Box Selection Overlay */}
        {drag?.kind === 'marquee-select' &&
          (Math.abs(drag.currentMath.x - drag.startMath.x) > 0.02 ||
            Math.abs(drag.currentMath.y - drag.startMath.y) > 0.02) && (
            <g pointerEvents="none">
              {(() => {
                const a = mathToSvgMm(
                  {
                    x: Math.min(drag.startMath.x, drag.currentMath.x),
                    y: Math.max(drag.startMath.y, drag.currentMath.y),
                  },
                  board.widthCm,
                  board.heightCm
                );
                const b = mathToSvgMm(
                  {
                    x: Math.max(drag.startMath.x, drag.currentMath.x),
                    y: Math.min(drag.startMath.y, drag.currentMath.y),
                  },
                  board.widthCm,
                  board.heightCm
                );
                return (
                  <rect
                    x={a.x}
                    y={a.y}
                    width={Math.max(0.5, b.x - a.x)}
                    height={Math.max(0.5, b.y - a.y)}
                    fill="rgba(59, 130, 246, 0.12)"
                    stroke="#2563eb"
                    strokeWidth={1.3 * strokeScale}
                    strokeDasharray={`${4 * strokeScale} ${3 * strokeScale}`}
                  />
                );
              })()}
            </g>
          )}

        {/* Trim Hover Preview Overlay (Red Highlight on Targeted Sub-Segment) */}
        {appMode === 'design' && activeTool === 'trim' && trimHover && (
          <g pointerEvents="none">
            {(() => {
              const { svgD } = transformMathPath(
                trimHover.previewPathD,
                IDENTITY_MATRIX,
                board.widthCm,
                board.heightCm
              );
              if (!svgD) return null;
              return (
                <>
                  <path
                    d={svgD}
                    fill="none"
                    stroke="#fecdd3"
                    strokeWidth={7 * strokeScale}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={svgD}
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth={3.2 * strokeScale}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              );
            })()}
          </g>
        )}

        {/* Magnetic Snap Indicator */}
        {appMode === 'design' &&
        ((activeTool !== 'select' &&
          activeTool !== 'pan' &&
          activeTool !== 'eraser' &&
          activeTool !== 'trim') ||
          drag?.kind === 'move-ref-point') ? (
          <g pointerEvents="none">
            {(() => {
              const sp = mathToSvgMm(
                snappedCursor.point,
                board.widthCm,
                board.heightCm
              );
              const color = snappedCursor.snappedToRef ? '#d97706' : '#4f46e5';
              return (
                <>
                  <circle
                    cx={sp.x}
                    cy={sp.y}
                    r={6 * strokeScale}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.4 * strokeScale}
                    strokeOpacity={0.85}
                  />
                  <circle cx={sp.x} cy={sp.y} r={2 * strokeScale} fill={color} />
                </>
              );
            })()}
          </g>
        ) : null}
      </svg>

      {/* Bottom-Left Coordinates & Legend HUD */}
      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg px-2.5 py-1 shadow-xs text-[11px] font-mono text-slate-700 flex items-center gap-2">
          <span>
            ({formatNum(snappedCursor.point.x)}, {formatNum(snappedCursor.point.y)}) cm
          </span>
          {snappedCursor.snappedToRef && (
            <span className="text-amber-700 font-sans font-semibold">
              • Imán: {snappedCursor.snappedToRef.name}
            </span>
          )}
        </div>

        <div className="bg-white/90 backdrop-blur-xs border border-slate-200 rounded-lg px-2.5 py-1 shadow-xs text-[10px] text-slate-600 hidden sm:flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-rose-500 inline-block" /> Corte borde
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-slate-900 inline-block" /> Grabado interior
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-amber-500 inline-block border-b border-dashed" /> Guías (no láser)
          </span>
        </div>
      </div>

      {/* Bottom-Right Zoom Controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg p-1 shadow-xs">
        <button
          type="button"
          onClick={() =>
            setCamera((c) => ({ ...c, zoom: Math.max(0.25, c.zoom / 1.25) }))
          }
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
          title="Alejar"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-[11px] font-semibold text-slate-700 px-1.5 min-w-[44px] text-center">
          {Math.round(camera.zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() =>
            setCamera((c) => ({ ...c, zoom: Math.min(12, c.zoom * 1.25) }))
          }
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
          title="Acercar"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-slate-200 mx-0.5" />
        <button
          type="button"
          onClick={() => setCamera({ cx: 0, cy: 0, zoom: 1 })}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
          title="Centrar tablero"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
