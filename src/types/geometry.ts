export interface Point2D {
  x: number;
  y: number;
}

/**
 * 2D affine matrix in mathematical coordinates (cm, +x right, +y up):
 * | a  c  tx |
 * | b  d  ty |
 * | 0  0  1  |
 * x' = a*x + c*y + tx
 * y' = b*x + d*y + ty
 */
export type Matrix2D = [number, number, number, number, number, number];

export type GridStep = 1 | 0.5 | 0.25 | 0.1 | 0;

export type BorderShape = 'rect' | 'rounded' | 'circle';

export interface BoardConfig {
  widthCm: number;
  heightCm: number;
  borderShape: BorderShape;
  cornerRadiusCm: number;
  hangingHole: boolean;
  hangingHoleDiameterMm: number;
}

export interface GridConfig {
  step: GridStep;
  showGrid: boolean;
  showAxes: boolean;
  showNumbers: boolean;
  showReferences: boolean;
  snapToRefPoints: boolean;
}

export type ViewMode = 'paint' | 'laser';

export type PresetId =
  | 'heart'
  | 'petal'
  | 'heart-petal'
  | 'leaf'
  | 'paisley'
  | 'flower'
  | 'star'
  | 'arrow'
  | 'diamond'
  | 'crescent'
  | 'spiral'
  | 'arch';

export type ShapeKind =
  | 'freehand'
  | 'dots'
  | 'segment'
  | 'circle'
  | 'ellipse'
  | 'polygon'
  | 'preset';

export interface ShapeDerivedFrom {
  transformId: string;
  sourceShapeId: string;
  copyIndex: number;
}

export interface DesignShape {
  id: string;
  name: string;
  kind: ShapeKind;
  /** Local paths in cm centered/defined in local space */
  localPaths?: string[];
  /** For 'dots': centers of small engraved circles in local space */
  localDots?: Point2D[];
  dotRadiusCm?: number;
  /** For 'polygon': number of sides */
  sides?: number;
  /** For 'preset': preset identifier */
  presetId?: PresetId;
  /** Transform matrix from local space (cm) to math board space (cm) */
  matrix: Matrix2D;
  /** Preview paint fill color ('none' = transparent) */
  fillColor: string;
  /** Visual stroke width in mm (used in UI & laser export defaults) */
  strokeWidthMm: number;
  visible: boolean;
  locked?: boolean;
  /** If created by an isometric transformation, links back to the TransformRecord */
  derivedFrom?: ShapeDerivedFrom;
}

export interface RefPoint {
  kind: 'point';
  id: string;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  color: string;
}

export interface RefLine {
  kind: 'line';
  id: string;
  name: string;
  p1: Point2D;
  p2: Point2D;
  visible: boolean;
  color: string;
}

export interface RefVector {
  kind: 'vector';
  id: string;
  name: string;
  from: Point2D;
  to: Point2D;
  visible: boolean;
  color: string;
}

export type RefObject = RefPoint | RefLine | RefVector;

export type TransformType =
  | 'axial'
  | 'central'
  | 'rotation'
  | 'rosette'
  | 'translation';

export interface TransformParams {
  type: TransformType;
  /** For axial symmetry */
  lineId?: string;
  /** For central symmetry, rotation, or rosette */
  pointId?: string;
  /** For rotation (degrees, CCW in math coords) */
  angleDeg?: number;
  /** For rosette */
  copies?: number;
  /** For translation */
  vectorId?: string;
  dx?: number;
  dy?: number;
  repeatCount?: number;
  /** Keep original shape visible (true) or hide/replace (false) */
  keepOriginal: boolean;
}

export interface TransformRecord {
  id: string;
  name: string;
  summary: string;
  params: TransformParams;
  sourceIds: string[];
  createdShapeIds: string[];
  visible: boolean;
}

export type ToolId =
  | 'select'
  | 'pan'
  | 'freehand'
  | 'dots'
  | 'segment'
  | 'circle'
  | 'ellipse'
  | 'polygon'
  | 'preset'
  | 'ref-point'
  | 'ref-line'
  | 'ref-vector'
  | 't-axial'
  | 't-central'
  | 't-rotation'
  | 't-rosette'
  | 't-translation'
  | 'eraser';

export interface ProjectStateSnapshot {
  shapes: DesignShape[];
  refs: RefObject[];
  transforms: TransformRecord[];
}

export interface SavedProjectFile {
  version: 1;
  appName: string;
  board: BoardConfig;
  grid: GridConfig;
  shapes: DesignShape[];
  refs: RefObject[];
  transforms: TransformRecord[];
}
