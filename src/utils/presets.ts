import { DesignShape, Point2D, PresetId } from '../types/geometry';
import {
  applyMatrix,
  BoundingBox,
  boundsFromPoints,
  circleToPath,
  roundCoord,
  transformMathPath,
} from './math2d';

export interface PresetDefinition {
  id: PresetId;
  label: string;
  /** Paths in local math coords (cm), centered near (0,0), ~2.5-3 cm size */
  paths: string[];
  /** Whether the first path is a closed fillable silhouette */
  fillable: boolean;
}

function buildStarPath(outerR = 1.5, innerR = 0.65, points = 5): string {
  const coords: string[] = [];
  const start = Math.PI / 2;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = start + (i * Math.PI) / points;
    const x = roundCoord(r * Math.cos(a));
    const y = roundCoord(r * Math.sin(a));
    coords.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
  }
  return coords.join(' ') + ' Z';
}

function buildFlowerPaths(): string[] {
  const paths: string[] = [];
  // Outer 6 petals
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rot = (x: number, y: number): [number, number] => [
      roundCoord(x * cos - y * sin),
      roundCoord(x * sin + y * cos),
    ];
    const [sx, sy] = rot(0, 0.45);
    const [c1x, c1y] = rot(-0.75, 1.05);
    const [c2x, c2y] = rot(-0.6, 1.85);
    const [tx, ty] = rot(0, 1.85);
    const [c3x, c3y] = rot(0.6, 1.85);
    const [c4x, c4y] = rot(0.75, 1.05);
    paths.push(
      `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty} C ${c3x} ${c3y} ${c4x} ${c4y} ${sx} ${sy} Z`
    );
  }
  // Center circle
  paths.push(circleToPath(0, 0, 0.45));
  return paths;
}

function buildSpiralPath(): string {
  const pts: Point2D[] = [];
  const turns = 2.5;
  const steps = 64;
  const maxR = 1.5;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * 2 * Math.PI;
    const r = t * maxR;
    pts.push({
      x: roundCoord(r * Math.cos(angle)),
      y: roundCoord(r * Math.sin(angle)),
    });
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

export const PRESET_DEFINITIONS: Record<PresetId, PresetDefinition> = {
  heart: {
    id: 'heart',
    label: 'Corazón',
    fillable: true,
    paths: [
      'M 0 -1.25 C -0.45 -0.85 -1.45 -0.25 -1.45 0.55 C -1.45 1.15 -0.95 1.45 -0.45 1.45 C -0.15 1.45 0 1.25 0 1.0 C 0 1.25 0.15 1.45 0.45 1.45 C 0.95 1.45 1.45 1.15 1.45 0.55 C 1.45 -0.25 0.45 -0.85 0 -1.25 Z',
    ],
  },
  petal: {
    id: 'petal',
    label: 'Pétalo',
    fillable: true,
    paths: [
      'M 0 -1.4 C -0.95 -0.6 -0.95 0.75 0 1.55 C 0.95 0.75 0.95 -0.6 0 -1.4 Z',
      'M 0 -1.1 L 0 0.75',
    ],
  },
  'heart-petal': {
    id: 'heart-petal',
    label: 'Pétalo doble',
    fillable: true,
    paths: [
      'M 0 -1.35 C -0.8 -0.6 -1.05 0.45 -0.75 1.15 C -0.55 1.55 -0.15 1.45 0 1.1 C 0.15 1.45 0.55 1.55 0.75 1.15 C 1.05 0.45 0.8 -0.6 0 -1.35 Z',
      'M 0 -0.95 L 0 0.65',
    ],
  },
  leaf: {
    id: 'leaf',
    label: 'Hoja',
    fillable: true,
    paths: [
      'M 0 -1.5 C -1.05 -0.75 -1.1 0.55 0 1.55 C 1.1 0.55 1.05 -0.75 0 -1.5 Z',
      'M 0 -1.5 L 0 1.25',
      'M 0 -0.55 L -0.5 -0.05',
      'M 0 -0.55 L 0.5 -0.05',
      'M 0 0.15 L -0.42 0.6',
      'M 0 0.15 L 0.42 0.6',
    ],
  },
  paisley: {
    id: 'paisley',
    label: 'Gota Paisley',
    fillable: true,
    paths: [
      'M -0.1 -1.45 C -0.95 -1.4 -1.25 -0.4 -0.95 0.45 C -0.65 1.25 0.15 1.65 0.85 1.55 C 0.45 1.15 0.45 0.7 0.75 0.15 C 1.15 -0.65 0.75 -1.5 -0.1 -1.45 Z',
      'M -0.12 -0.95 C -0.55 -0.9 -0.7 -0.35 -0.5 0.2 C -0.32 0.65 0.05 0.9 0.35 0.85 C 0.18 0.55 0.25 0.25 0.4 -0.1 C 0.6 -0.55 0.35 -0.98 -0.12 -0.95 Z',
    ],
  },
  flower: {
    id: 'flower',
    label: 'Flor',
    fillable: true,
    paths: buildFlowerPaths(),
  },
  star: {
    id: 'star',
    label: 'Estrella',
    fillable: true,
    paths: [buildStarPath(1.5, 0.62, 5)],
  },
  arrow: {
    id: 'arrow',
    label: 'Flecha',
    fillable: true,
    paths: [
      'M 0 1.5 L 1.15 0.25 L 0.45 0.25 L 0.45 -1.45 L -0.45 -1.45 L -0.45 0.25 L -1.15 0.25 Z',
    ],
  },
  diamond: {
    id: 'diamond',
    label: 'Rombo',
    fillable: true,
    paths: [
      'M 0 1.55 L 1.05 0 L 0 -1.55 L -1.05 0 Z',
      'M 0 0.9 L 0.6 0 L 0 -0.9 L -0.6 0 Z',
    ],
  },
  crescent: {
    id: 'crescent',
    label: 'Media luna',
    fillable: true,
    paths: [
      'M 0.35 -1.4 C -0.75 -1.3 -1.35 -0.25 -0.95 0.75 C -0.65 1.35 0.05 1.55 0.65 1.35 C -0.15 1.2 -0.55 0.45 -0.35 -0.35 C -0.2 -0.95 0.1 -1.25 0.35 -1.4 Z',
    ],
  },
  spiral: {
    id: 'spiral',
    label: 'Espiral',
    fillable: false,
    paths: [buildSpiralPath()],
  },
  arch: {
    id: 'arch',
    label: 'Arco',
    fillable: true,
    paths: [
      'M -1.3 -0.9 C -1.3 0.75 1.3 0.75 1.3 -0.9 Z',
      'M -0.85 -0.9 C -0.85 0.2 0.85 0.2 0.85 -0.9',
    ],
  },
};

export const PRESET_LIST = Object.values(PRESET_DEFINITIONS);

export function getShapeLocalPaths(shape: DesignShape): string[] {
  if (shape.kind === 'preset' && shape.presetId) {
    return PRESET_DEFINITIONS[shape.presetId]?.paths ?? [];
  }
  return shape.localPaths ?? [];
}

export function isShapeFillable(shape: DesignShape): boolean {
  if (shape.kind === 'dots' || shape.kind === 'segment') return false;
  if (shape.kind === 'preset' && shape.presetId) {
    return PRESET_DEFINITIONS[shape.presetId]?.fillable ?? true;
  }
  if (shape.kind === 'freehand') return false;
  return true;
}

export function getShapeMathBounds(shape: DesignShape): BoundingBox | null {
  const pts: Point2D[] = [];

  if (shape.kind === 'dots' && shape.localDots) {
    const r = shape.dotRadiusCm ?? 0.08;
    for (const d of shape.localDots) {
      const td = applyMatrix(shape.matrix, d);
      pts.push({ x: td.x - r, y: td.y - r }, { x: td.x + r, y: td.y + r });
    }
    return boundsFromPoints(pts);
  }

  const paths = getShapeLocalPaths(shape);
  for (const d of paths) {
    const res = transformMathPath(d, shape.matrix);
    pts.push(...res.sampledPoints);
  }
  return boundsFromPoints(pts);
}
