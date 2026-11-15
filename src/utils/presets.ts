import { DesignShape, Point2D, PresetId } from '../types/geometry';
import {
  applyMatrix,
  BoundingBox,
  boundsFromPoints,
  circleToPath,
  roundCoord,
  transformMathPath,
} from './math2d';

export type PresetCategory = 'flores' | 'petalos' | 'figuras';

export interface PresetDefinition {
  id: PresetId;
  label: string;
  category: PresetCategory;
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

function buildRadialFlowerPaths(
  petalCount: number,
  innerR: number,
  outerR: number,
  petalWidth: number,
  centerR: number,
  pointed = false,
  innerRingR = 0
): string[] {
  const paths: string[] = [];
  for (let i = 0; i < petalCount; i++) {
    const angle = (i * 2 * Math.PI) / petalCount;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rot = (x: number, y: number): [number, number] => [
      roundCoord(x * cos - y * sin),
      roundCoord(x * sin + y * cos),
    ];
    if (pointed) {
      const [sx, sy] = rot(0, innerR);
      const [c1x, c1y] = rot(-petalWidth, (innerR + outerR) * 0.45);
      const [c2x, c2y] = rot(-petalWidth * 0.45, outerR * 0.85);
      const [tx, ty] = rot(0, outerR);
      const [c3x, c3y] = rot(petalWidth * 0.45, outerR * 0.85);
      const [c4x, c4y] = rot(petalWidth, (innerR + outerR) * 0.45);
      paths.push(
        `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty} C ${c3x} ${c3y} ${c4x} ${c4y} ${sx} ${sy} Z`
      );
    } else {
      const [sx, sy] = rot(0, innerR);
      const [c1x, c1y] = rot(-petalWidth, innerR + (outerR - innerR) * 0.45);
      const [c2x, c2y] = rot(-petalWidth * 0.8, outerR);
      const [tx, ty] = rot(0, outerR);
      const [c3x, c3y] = rot(petalWidth * 0.8, outerR);
      const [c4x, c4y] = rot(petalWidth, innerR + (outerR - innerR) * 0.45);
      paths.push(
        `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty} C ${c3x} ${c3y} ${c4x} ${c4y} ${sx} ${sy} Z`
      );
    }
  }
  if (centerR > 0) {
    paths.push(circleToPath(0, 0, centerR));
  }
  if (innerRingR > 0) {
    paths.push(circleToPath(0, 0, innerRingR));
  }
  return paths;
}

function buildSakuraFlowerPaths(): string[] {
  const paths: string[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i * 2 * Math.PI) / 5;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rot = (x: number, y: number): [number, number] => [
      roundCoord(x * cos - y * sin),
      roundCoord(x * sin + y * cos),
    ];
    const [sx, sy] = rot(0, 0.35);
    const [c1x, c1y] = rot(-0.85, 0.95);
    const [c2x, c2y] = rot(-0.75, 1.65);
    const [ltx, lty] = rot(-0.22, 1.6);
    const [nx, ny] = rot(0, 1.32);
    const [rtx, rty] = rot(0.22, 1.6);
    const [c3x, c3y] = rot(0.75, 1.65);
    const [c4x, c4y] = rot(0.85, 0.95);
    paths.push(
      `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${ltx} ${lty} L ${nx} ${ny} L ${rtx} ${rty} C ${c3x} ${c3y} ${c4x} ${c4y} ${sx} ${sy} Z`
    );
  }
  paths.push(circleToPath(0, 0, 0.35));
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
  // --- FLORES ---
  flower: {
    id: 'flower',
    label: 'Flor 6 pétalos',
    category: 'flores',
    fillable: true,
    paths: buildRadialFlowerPaths(6, 0.42, 1.75, 0.72, 0.42),
  },
  'flower-4': {
    id: 'flower-4',
    label: 'Flor 4 pétalos',
    category: 'flores',
    fillable: true,
    paths: buildRadialFlowerPaths(4, 0.35, 1.65, 0.95, 0.35),
  },
  'flower-5': {
    id: 'flower-5',
    label: 'Flor Cerezo',
    category: 'flores',
    fillable: true,
    paths: buildSakuraFlowerPaths(),
  },
  'flower-8': {
    id: 'flower-8',
    label: 'Margarita 8×',
    category: 'flores',
    fillable: true,
    paths: buildRadialFlowerPaths(8, 0.45, 1.75, 0.48, 0.45),
  },
  'flower-sun': {
    id: 'flower-sun',
    label: 'Girasol 12×',
    category: 'flores',
    fillable: true,
    paths: buildRadialFlowerPaths(12, 0.65, 1.75, 0.34, 0.65, true, 0.35),
  },
  'flower-lotus': {
    id: 'flower-lotus',
    label: 'Flor de Loto',
    category: 'flores',
    fillable: true,
    paths: [
      // Center petal
      'M 0 -1.0 C -0.75 -0.25 -0.75 0.95 0 1.65 C 0.75 0.95 0.75 -0.25 0 -1.0 Z',
      // Left petal
      'M -0.2 -0.95 C -1.25 -0.65 -1.65 0.35 -1.35 1.15 C -0.85 0.95 -0.45 0.2 -0.2 -0.95 Z',
      // Right petal
      'M 0.2 -0.95 C 1.25 -0.65 1.65 0.35 1.35 1.15 C 0.85 0.95 0.45 0.2 0.2 -0.95 Z',
      // Outer left base petal
      'M -0.35 -0.95 C -1.45 -1.05 -1.85 -0.45 -1.75 0.25 C -1.35 0.05 -0.85 -0.35 -0.35 -0.95 Z',
      // Outer right base petal
      'M 0.35 -0.95 C 1.45 -1.05 1.85 -0.45 1.75 0.25 C 1.35 0.05 0.85 -0.35 0.35 -0.95 Z',
      // Base curve
      'M -0.95 -1.2 C -0.35 -1.45 0.35 -1.45 0.95 -1.2',
    ],
  },
  'flower-tulip': {
    id: 'flower-tulip',
    label: 'Tulipán',
    category: 'flores',
    fillable: true,
    paths: [
      'M 0 -0.85 C -0.95 -0.85 -1.15 0.25 -0.75 1.25 C -0.35 0.95 -0.15 0.75 0 1.35 C 0.15 0.75 0.35 0.95 0.75 1.25 C 1.15 0.25 0.95 -0.85 0 -0.85 Z',
      'M 0 -0.85 L 0 -1.65',
      'M 0 -1.45 C -0.65 -1.35 -0.85 -0.95 -0.65 -0.65',
      'M 0 -1.45 C 0.65 -1.35 0.85 -0.95 0.65 -0.65',
    ],
  },

  // --- PÉTALOS Y BOTÁNICA ---
  petal: {
    id: 'petal',
    label: 'Pétalo clásico',
    category: 'petalos',
    fillable: true,
    paths: [
      'M 0 -1.4 C -0.95 -0.6 -0.95 0.75 0 1.55 C 0.95 0.75 0.95 -0.6 0 -1.4 Z',
      'M 0 -1.1 L 0 0.75',
    ],
  },
  'heart-petal': {
    id: 'heart-petal',
    label: 'Pétalo doble',
    category: 'petalos',
    fillable: true,
    paths: [
      'M 0 -1.35 C -0.8 -0.6 -1.05 0.45 -0.75 1.15 C -0.55 1.55 -0.15 1.45 0 1.1 C 0.15 1.45 0.55 1.55 0.75 1.15 C 1.05 0.45 0.8 -0.6 0 -1.35 Z',
      'M 0 -0.95 L 0 0.65',
    ],
  },
  'petal-pointed': {
    id: 'petal-pointed',
    label: 'Pétalo aguja',
    category: 'petalos',
    fillable: true,
    paths: [
      'M 0 -1.55 C -0.75 -0.75 -0.55 0.65 0 1.6 C 0.55 0.65 0.75 -0.75 0 -1.55 Z',
      'M 0 -1.25 L 0 1.05',
    ],
  },
  'petal-layered': {
    id: 'petal-layered',
    label: 'Pétalo doble capa',
    category: 'petalos',
    fillable: true,
    paths: [
      'M 0 -1.5 C -1.05 -0.65 -1.05 0.75 0 1.55 C 1.05 0.75 1.05 -0.65 0 -1.5 Z',
      'M 0 -1.05 C -0.6 -0.45 -0.6 0.45 0 1.0 C 0.6 0.45 0.6 -0.45 0 -1.05 Z',
      'M 0 -0.65 L 0 0.45',
    ],
  },
  leaf: {
    id: 'leaf',
    label: 'Hoja botánica',
    category: 'petalos',
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
  'leaf-branch': {
    id: 'leaf-branch',
    label: 'Rama de hojas',
    category: 'petalos',
    fillable: false,
    paths: [
      'M 0 -1.65 L 0 1.45',
      'M 0 1.45 C -0.4 1.1 -0.4 0.7 0 0.45 C 0.4 0.7 0.4 1.1 0 1.45 Z',
      'M 0 0.35 C -0.65 0.55 -1.1 0.35 -1.15 -0.15 C -0.65 -0.25 -0.25 -0.05 0 0.35 Z',
      'M 0 0.35 C 0.65 0.55 1.1 0.35 1.15 -0.15 C 0.65 -0.25 0.25 -0.05 0 0.35 Z',
      'M 0 -0.45 C -0.7 -0.25 -1.2 -0.45 -1.25 -0.95 C -0.7 -1.05 -0.3 -0.85 0 -0.45 Z',
      'M 0 -0.45 C 0.7 -0.25 1.2 -0.45 1.25 -0.95 C 0.7 -1.05 0.3 -0.85 0 -0.45 Z',
    ],
  },
  paisley: {
    id: 'paisley',
    label: 'Gota Paisley',
    category: 'petalos',
    fillable: true,
    paths: [
      'M -0.1 -1.45 C -0.95 -1.4 -1.25 -0.4 -0.95 0.45 C -0.65 1.25 0.15 1.65 0.85 1.55 C 0.45 1.15 0.45 0.7 0.75 0.15 C 1.15 -0.65 0.75 -1.5 -0.1 -1.45 Z',
      'M -0.12 -0.95 C -0.55 -0.9 -0.7 -0.35 -0.5 0.2 C -0.32 0.65 0.05 0.9 0.35 0.85 C 0.18 0.55 0.25 0.25 0.4 -0.1 C 0.6 -0.55 0.35 -0.98 -0.12 -0.95 Z',
    ],
  },
  clover: {
    id: 'clover',
    label: 'Trébol 4 hojas',
    category: 'petalos',
    fillable: true,
    paths: [
      'M 0 0 C -0.65 0.3 -0.85 1.25 -0.35 1.45 C -0.1 1.55 0 1.25 0 1.05 C 0 1.25 0.1 1.55 0.35 1.45 C 0.85 1.25 0.65 0.3 0 0 Z',
      'M 0 0 C 0.3 0.65 1.25 0.85 1.45 0.35 C 1.55 0.1 1.25 0 1.05 0 C 1.25 0 1.55 -0.1 1.45 -0.35 C 1.25 -0.85 0.3 -0.65 0 0 Z',
      'M 0 0 C 0.65 -0.3 0.85 -1.25 0.35 -1.45 C 0.1 -1.55 0 -1.25 0 -1.05 C 0 -1.25 -0.1 -1.55 -0.35 -1.45 C -0.85 -1.25 -0.65 -0.3 0 0 Z',
      'M 0 0 C -0.3 -0.65 -1.25 -0.85 -1.45 -0.35 C -1.55 -0.1 -1.25 0 -1.05 0 C -1.25 0 -1.55 0.1 -1.45 0.35 C -1.25 0.85 -0.3 0.65 0 0 Z',
    ],
  },

  // --- FIGURAS Y ORNAMENTOS ---
  heart: {
    id: 'heart',
    label: 'Corazón',
    category: 'figuras',
    fillable: true,
    paths: [
      'M 0 -1.25 C -0.45 -0.85 -1.45 -0.25 -1.45 0.55 C -1.45 1.15 -0.95 1.45 -0.45 1.45 C -0.15 1.45 0 1.25 0 1.0 C 0 1.25 0.15 1.45 0.45 1.45 C 0.95 1.45 1.45 1.15 1.45 0.55 C 1.45 -0.25 0.45 -0.85 0 -1.25 Z',
    ],
  },
  butterfly: {
    id: 'butterfly',
    label: 'Mariposa',
    category: 'figuras',
    fillable: true,
    paths: [
      // Left upper & lower wings
      'M -0.1 0.1 C -0.75 1.35 -1.75 1.35 -1.65 0.35 C -1.6 -0.15 -0.85 -0.1 -0.2 -0.05 C -0.95 -0.25 -1.45 -0.65 -1.2 -1.25 C -0.95 -1.65 -0.25 -1.1 -0.1 -0.35 Z',
      // Right upper & lower wings
      'M 0.1 0.1 C 0.75 1.35 1.75 1.35 1.65 0.35 C 1.6 -0.15 0.85 -0.1 0.2 -0.05 C 0.95 -0.25 1.45 -0.65 1.2 -1.25 C 0.95 -1.65 0.25 -1.1 0.1 -0.35 Z',
      // Body
      'M 0 -0.85 C -0.12 -0.45 -0.12 0.35 0 0.75 C 0.12 0.35 0.12 -0.45 0 -0.85 Z',
      // Antennae
      'M -0.05 0.75 C -0.25 1.15 -0.45 1.3 -0.6 1.25',
      'M 0.05 0.75 C 0.25 1.15 0.45 1.3 0.6 1.25',
    ],
  },
  star: {
    id: 'star',
    label: 'Estrella 5×',
    category: 'figuras',
    fillable: true,
    paths: [buildStarPath(1.5, 0.62, 5)],
  },
  'star-8': {
    id: 'star-8',
    label: 'Estrella 8×',
    category: 'figuras',
    fillable: true,
    paths: [buildStarPath(1.55, 0.68, 8)],
  },
  diamond: {
    id: 'diamond',
    label: 'Rombo doble',
    category: 'figuras',
    fillable: true,
    paths: [
      'M 0 1.55 L 1.05 0 L 0 -1.55 L -1.05 0 Z',
      'M 0 0.9 L 0.6 0 L 0 -0.9 L -0.6 0 Z',
    ],
  },
  drop: {
    id: 'drop',
    label: 'Gota',
    category: 'figuras',
    fillable: true,
    paths: [
      'M 0 1.55 C -0.95 0.35 -1.05 -0.45 -0.85 -0.95 C -0.6 -1.45 0.6 -1.45 0.85 -0.95 C 1.05 -0.45 0.95 0.35 0 1.55 Z',
    ],
  },
  crescent: {
    id: 'crescent',
    label: 'Media luna',
    category: 'figuras',
    fillable: true,
    paths: [
      'M 0.35 -1.4 C -0.75 -1.3 -1.35 -0.25 -0.95 0.75 C -0.65 1.35 0.05 1.55 0.65 1.35 C -0.15 1.2 -0.55 0.45 -0.35 -0.35 C -0.2 -0.95 0.1 -1.25 0.35 -1.4 Z',
    ],
  },
  crown: {
    id: 'crown',
    label: 'Corona',
    category: 'figuras',
    fillable: true,
    paths: [
      'M -1.35 -0.85 L -1.5 0.65 L -0.75 -0.05 L 0 0.95 L 0.75 -0.05 L 1.5 0.65 L 1.35 -0.85 Z',
      'M -1.35 -1.15 L 1.35 -1.15',
    ],
  },
  arrow: {
    id: 'arrow',
    label: 'Flecha',
    category: 'figuras',
    fillable: true,
    paths: [
      'M 0 1.5 L 1.15 0.25 L 0.45 0.25 L 0.45 -1.45 L -0.45 -1.45 L -0.45 0.25 L -1.15 0.25 Z',
    ],
  },
  arch: {
    id: 'arch',
    label: 'Arco / Escama',
    category: 'figuras',
    fillable: true,
    paths: [
      'M -1.3 -0.9 C -1.3 0.75 1.3 0.75 1.3 -0.9 Z',
      'M -0.85 -0.9 C -0.85 0.2 0.85 0.2 0.85 -0.9',
    ],
  },
  spiral: {
    id: 'spiral',
    label: 'Espiral',
    category: 'figuras',
    fillable: false,
    paths: [buildSpiralPath()],
  },
};

export const PRESET_LIST = Object.values(PRESET_DEFINITIONS);

export function getShapeLocalPaths(shape: DesignShape): string[] {
  if (shape.kind === 'preset' && shape.presetId) {
    return PRESET_DEFINITIONS[shape.presetId]?.paths ?? [];
  }
  if (shape.kind === 'tessellation' && shape.tessellation) {
    const paths = shape.tessellation.tiles.map(
      (t) =>
        t.points
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${roundCoord(p.x)} ${roundCoord(p.y)}`)
          .join(' ') + ' Z'
    );
    if (shape.tessellation.includeBorder) {
      const hw = shape.tessellation.widthCm / 2;
      const hh = shape.tessellation.heightCm / 2;
      paths.push(
        `M ${roundCoord(-hw)} ${roundCoord(-hh)} L ${roundCoord(hw)} ${roundCoord(-hh)} L ${roundCoord(hw)} ${roundCoord(hh)} L ${roundCoord(-hw)} ${roundCoord(hh)} Z`
      );
    }
    return paths;
  }
  return shape.localPaths ?? [];
}

export function isShapeFillable(shape: DesignShape): boolean {
  if (
    shape.kind === 'dots' ||
    shape.kind === 'segment' ||
    shape.kind === 'tessellation'
  ) {
    return false;
  }
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

  if (shape.kind === 'tessellation' && shape.tessellation) {
    const hw = shape.tessellation.widthCm / 2;
    const hh = shape.tessellation.heightCm / 2;
    const corners: Point2D[] = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ];
    return boundsFromPoints(corners.map((c) => applyMatrix(shape.matrix, c)));
  }

  const paths = getShapeLocalPaths(shape);
  for (const d of paths) {
    const res = transformMathPath(d, shape.matrix);
    pts.push(...res.sampledPoints);
  }
  return boundsFromPoints(pts);
}
