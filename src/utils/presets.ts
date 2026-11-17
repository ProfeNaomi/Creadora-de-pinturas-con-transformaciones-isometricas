import { DesignShape, Matrix2D, Point2D, PresetId } from '../types/geometry';
import {
  applyMatrix,
  BoundingBox,
  boundsFromPoints,
  circleToPath,
  ellipseToPath,
  IDENTITY_MATRIX,
  multiplyMatrices,
  roundCoord,
  transformMathPath,
} from './math2d';

export type PresetCategory = 'flores' | 'petalos' | 'figuras' | 'animales';

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
    category: 'animales',
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
  cat: {
    id: 'cat',
    label: 'Gato',
    category: 'animales',
    fillable: true,
    paths: [
      'M -1.05 0.45 L -1.15 1.45 L -0.42 0.88 C -0.15 0.96 0.15 0.96 0.42 0.88 L 1.15 1.45 L 1.05 0.45 C 1.45 -0.05 1.35 -0.85 0 -1.15 C -1.35 -0.85 -1.45 -0.05 -1.05 0.45 Z',
      'M -0.92 0.55 L -0.98 1.15 L -0.52 0.78 Z',
      'M 0.92 0.55 L 0.98 1.15 L 0.52 0.78 Z',
      circleToPath(-0.48, 0.1, 0.15),
      circleToPath(0.48, 0.1, 0.15),
      'M -0.16 -0.22 L 0.16 -0.22 L 0 -0.42 Z',
      'M -0.32 -0.58 Q -0.16 -0.72 0 -0.42 Q 0.16 -0.72 0.32 -0.58',
      'M -0.75 -0.28 L -1.45 -0.18',
      'M -0.75 -0.46 L -1.45 -0.54',
      'M 0.75 -0.28 L 1.45 -0.18',
      'M 0.75 -0.46 L 1.45 -0.54',
    ],
  },
  dog: {
    id: 'dog',
    label: 'Perro',
    category: 'animales',
    fillable: true,
    paths: [
      'M -0.65 0.95 C -0.2 1.15 0.2 1.15 0.65 0.95 C 1.2 1.05 1.6 0.45 1.5 -0.35 C 1.45 -0.75 1.08 -0.85 0.95 -0.45 C 0.88 -0.95 0.45 -1.2 0 -1.2 C -0.45 -1.2 -0.88 -0.95 -0.95 -0.45 C -1.08 -0.85 -1.45 -0.75 -1.5 -0.35 C -1.6 0.45 -1.2 1.05 -0.65 0.95 Z',
      'M -0.78 0.72 C -0.95 0.35 -0.98 -0.15 -0.95 -0.45',
      'M 0.78 0.72 C 0.95 0.35 0.98 -0.15 0.95 -0.45',
      circleToPath(-0.42, 0.24, 0.14),
      circleToPath(0.42, 0.24, 0.14),
      'M -0.22 -0.22 C -0.22 -0.12 0.22 -0.12 0.22 -0.22 C 0.22 -0.36 0.08 -0.48 0 -0.48 C -0.08 -0.48 -0.22 -0.36 -0.22 -0.22 Z',
      'M -0.3 -0.65 Q -0.15 -0.8 0 -0.48 Q 0.15 -0.8 0.3 -0.65',
    ],
  },
  paw: {
    id: 'paw',
    label: 'Huella',
    category: 'animales',
    fillable: true,
    paths: [
      [
        'M 0 -0.05 C -0.45 -0.05 -0.85 -0.55 -0.75 -0.98 C -0.65 -1.32 -0.25 -1.25 0 -1.12 C 0.25 -1.25 0.65 -1.32 0.75 -0.98 C 0.85 -0.55 0.45 -0.05 0 -0.05 Z',
        ellipseToPath(-1.05, 0.22, 0.26, 0.36),
        ellipseToPath(-0.38, 0.78, 0.27, 0.38),
        ellipseToPath(0.38, 0.78, 0.27, 0.38),
        ellipseToPath(1.05, 0.22, 0.26, 0.36),
      ].join(' '),
    ],
  },
  bird: {
    id: 'bird',
    label: 'Pájaro',
    category: 'animales',
    fillable: true,
    paths: [
      'M -1.45 -0.25 C -1.05 -0.15 -0.65 -0.35 -0.3 -0.55 C 0.25 -0.85 0.85 -0.45 1.05 0.15 L 1.48 0.22 L 1.12 0.42 C 1.05 0.78 0.72 0.92 0.45 0.68 C 0.15 1.18 -0.35 1.48 -0.85 1.35 C -0.55 0.92 -0.35 0.55 -0.32 0.22 C -0.75 0.12 -1.18 -0.02 -1.45 -0.25 Z',
      circleToPath(0.82, 0.42, 0.08),
      'M -0.15 0.15 C -0.25 0.55 -0.45 0.92 -0.68 1.12',
      'M 0.08 0.12 C 0.02 0.48 -0.12 0.82 -0.28 1.02',
    ],
  },
  owl: {
    id: 'owl',
    label: 'Búho',
    category: 'animales',
    fillable: true,
    paths: [
      'M -0.85 1.35 L -0.45 1.05 C -0.15 1.15 0.15 1.15 0.45 1.05 L 0.85 1.35 C 0.88 0.95 0.95 0.62 0.85 0.32 C 1.15 -0.08 1.12 -0.85 0.55 -1.18 C 0.2 -1.32 -0.2 -1.32 -0.55 -1.18 C -1.12 -0.85 -1.15 -0.08 -0.85 0.32 C -0.95 0.62 -0.88 0.95 -0.85 1.35 Z',
      circleToPath(-0.36, 0.52, 0.32),
      circleToPath(0.36, 0.52, 0.32),
      circleToPath(-0.36, 0.52, 0.11),
      circleToPath(0.36, 0.52, 0.11),
      'M -0.12 0.35 L 0.12 0.35 L 0 0.05 Z',
      'M -0.85 0.22 C -0.45 -0.15 -0.45 -0.78 -0.65 -1.08',
      'M 0.85 0.22 C 0.45 -0.15 0.45 -0.78 0.65 -1.08',
      'M -0.25 -0.35 Q 0 -0.52 0.25 -0.35',
      'M -0.3 -0.68 Q 0 -0.85 0.3 -0.68',
      'M -0.45 -1.22 L -0.55 -1.42',
      'M -0.35 -1.24 L -0.35 -1.45',
      'M -0.25 -1.24 L -0.18 -1.42',
      'M 0.45 -1.22 L 0.55 -1.42',
      'M 0.35 -1.24 L 0.35 -1.45',
      'M 0.25 -1.24 L 0.18 -1.42',
    ],
  },
  fish: {
    id: 'fish',
    label: 'Pez',
    category: 'animales',
    fillable: true,
    paths: [
      'M 1.4 0 C 0.95 0.58 0.45 0.78 -0.05 0.72 L -0.35 1.08 L -0.42 0.55 C -0.65 0.38 -0.82 0.25 -0.95 0.18 L -1.45 0.78 L -1.12 0 L -1.45 -0.78 L -0.95 -0.18 C -0.68 -0.45 -0.25 -0.78 0.35 -0.72 C 0.85 -0.65 1.18 -0.38 1.4 0 Z',
      circleToPath(0.88, 0.16, 0.11),
      'M 0.55 0.45 C 0.38 0.15 0.38 -0.15 0.55 -0.45',
      'M 0.15 -0.1 C -0.15 -0.05 -0.28 -0.32 -0.08 -0.42 C 0.08 -0.32 0.15 -0.2 0.15 -0.1 Z',
    ],
  },
  turtle: {
    id: 'turtle',
    label: 'Tortuga',
    category: 'animales',
    fillable: true,
    paths: [
      'M -0.25 0.95 C -0.3 1.38 -0.18 1.55 0 1.55 C 0.18 1.55 0.3 1.38 0.25 0.95 C 0.65 1.05 1.45 0.82 1.55 0.25 C 1.25 0.12 0.95 0.28 0.75 0.38 C 0.88 0.05 0.85 -0.45 0.65 -0.72 C 0.95 -0.85 1.15 -1.18 0.88 -1.38 C 0.65 -1.25 0.48 -1.02 0.32 -0.92 C 0.15 -1.02 0.08 -1.35 0 -1.45 C -0.08 -1.35 -0.15 -1.02 -0.32 -0.92 C -0.48 -1.02 -0.65 -1.25 -0.88 -1.38 C -1.15 -1.18 -0.95 -0.85 -0.65 -0.72 C -0.85 -0.45 -0.88 0.05 -0.75 0.38 C -0.95 0.28 -1.25 0.12 -1.55 0.25 C -1.45 0.82 -0.65 1.05 -0.25 0.95 Z',
      'M 0 0.92 C 0.58 0.92 0.78 0.38 0.78 -0.08 C 0.78 -0.58 0.48 -0.95 0 -0.95 C -0.48 -0.95 -0.78 -0.58 -0.78 -0.08 C -0.78 0.38 -0.58 0.92 0 0.92 Z',
      'M 0 0.42 L 0.36 0.21 L 0.36 -0.21 L 0 -0.42 L -0.36 -0.21 L -0.36 0.21 Z',
      'M 0 0.42 L 0 0.92',
      'M 0.36 0.21 L 0.72 0.38',
      'M 0.36 -0.21 L 0.68 -0.45',
      'M 0 -0.42 L 0 -0.95',
      'M -0.36 -0.21 L -0.68 -0.45',
      'M -0.36 0.21 L -0.72 0.38',
      circleToPath(-0.14, 1.3, 0.05),
      circleToPath(0.14, 1.3, 0.05),
    ],
  },
  rabbit: {
    id: 'rabbit',
    label: 'Conejo',
    category: 'animales',
    fillable: true,
    paths: [
      'M 0.95 -1.15 L 0.65 -1.15 C 0.65 -0.85 0.75 -0.55 0.85 -0.32 C 1.15 -0.22 1.32 -0.02 1.25 0.15 C 1.15 0.38 0.88 0.52 0.58 0.55 C 0.48 1.05 0.22 1.52 -0.05 1.48 C -0.28 1.44 -0.18 0.92 0.08 0.48 C -0.35 0.35 -0.78 0.02 -0.95 -0.42 C -1.25 -0.32 -1.45 -0.52 -1.38 -0.78 C -1.32 -0.98 -1.08 -1.02 -0.92 -0.92 L -0.78 -1.15 Z',
      'M 0.15 0.58 C 0.02 0.92 -0.02 1.22 0.05 1.32',
      circleToPath(0.72, 0.22, 0.08),
      'M 1.18 0.08 L 1.45 0.12',
      'M 1.18 0.02 L 1.45 -0.06',
    ],
  },
  fox: {
    id: 'fox',
    label: 'Zorro',
    category: 'animales',
    fillable: true,
    paths: [
      'M -0.82 0.65 L -1.15 1.45 L -0.32 0.82 L 0.32 0.82 L 1.15 1.45 L 0.82 0.65 L 1.38 -0.15 L 0.75 -0.48 L 0 -1.25 L -0.75 -0.48 L -1.38 -0.15 Z',
      'M -1.38 -0.15 Q -0.55 -0.22 0 -0.95 Q 0.55 -0.22 1.38 -0.15',
      'M -0.78 0.72 L -0.98 1.2 L -0.48 0.82',
      'M 0.78 0.72 L 0.98 1.2 L 0.48 0.82',
      circleToPath(-0.44, 0.15, 0.11),
      circleToPath(0.44, 0.15, 0.11),
      'M -0.18 -0.98 L 0.18 -0.98 L 0 -1.25 Z',
    ],
  },
  elephant: {
    id: 'elephant',
    label: 'Elefante',
    category: 'animales',
    fillable: true,
    paths: [
      'M -1.15 0.18 C -1.25 0.82 -0.65 1.15 0.05 1.15 C 0.65 1.15 0.98 0.82 0.98 0.35 C 1.15 0.38 1.32 0.65 1.45 0.85 C 1.62 0.75 1.55 0.35 1.32 0.12 C 1.15 -0.05 0.92 -0.08 0.75 -0.12 L 0.75 -1.15 L 0.32 -1.15 L 0.32 -0.58 L -0.28 -0.58 L -0.28 -1.15 L -0.75 -1.15 L -0.75 -0.35 C -1.05 -0.35 -1.25 -0.55 -1.35 -0.78 L -1.42 -0.68 C -1.35 -0.35 -1.22 -0.05 -1.15 0.18 Z',
      'M 0.12 0.78 C -0.45 0.78 -0.58 0.15 -0.15 -0.08 C 0.22 -0.15 0.42 0.25 0.28 0.62',
      circleToPath(0.58, 0.55, 0.09),
      'M 0.88 -0.02 Q 1.18 -0.18 1.32 0.05',
    ],
  },
  whale: {
    id: 'whale',
    label: 'Ballena',
    category: 'animales',
    fillable: true,
    paths: [
      'M -1.15 0.15 C -1.05 0.85 -0.35 1.15 0.45 0.92 C 0.92 0.78 1.18 0.35 1.25 -0.15 C 1.45 -0.05 1.58 0.18 1.62 0.45 C 1.35 0.38 1.22 0.22 1.15 0.05 C 1.28 -0.18 1.45 -0.35 1.58 -0.55 C 1.32 -0.52 1.12 -0.38 0.98 -0.22 C 0.72 -0.72 0.12 -0.95 -0.65 -0.92 C -1.15 -0.9 -1.25 -0.35 -1.15 0.15 Z',
      circleToPath(-0.72, 0.08, 0.09),
      'M -1.05 -0.45 Q -0.65 -0.65 -0.25 -0.45',
      'M -0.35 1.05 C -0.38 1.35 -0.65 1.48 -0.82 1.35',
      'M -0.35 1.05 C -0.32 1.35 -0.05 1.48 0.12 1.35',
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
  if (shape.kind === 'group') {
    return Boolean(shape.children?.some((c) => c.visible && isShapeFillable(c)));
  }
  if (
    shape.kind === 'freehand' ||
    shape.kind === 'path' ||
    shape.kind === 'curve' ||
    shape.kind === 'spline' ||
    shape.kind === 'text'
  ) {
    return getShapeLocalPaths(shape).some((d) =>
      d.trim().toUpperCase().endsWith('Z')
    );
  }
  if (shape.kind === 'preset' && shape.presetId) {
    return PRESET_DEFINITIONS[shape.presetId]?.fillable ?? true;
  }
  return true;
}

function collectShapeBoundPoints(
  shape: DesignShape,
  parentMatrix: Matrix2D,
  pts: Point2D[]
): void {
  const worldMatrix = multiplyMatrices(parentMatrix, shape.matrix);

  if (shape.kind === 'group' && shape.children) {
    for (const child of shape.children) {
      if (child.visible) {
        collectShapeBoundPoints(child, worldMatrix, pts);
      }
    }
    return;
  }

  if (shape.kind === 'dots' && shape.localDots) {
    const sx = Math.hypot(worldMatrix[0], worldMatrix[1]);
    const sy = Math.hypot(worldMatrix[2], worldMatrix[3]);
    const r = (shape.dotRadiusCm ?? 0.08) * ((sx + sy) / 2);
    for (const d of shape.localDots) {
      const td = applyMatrix(worldMatrix, d);
      pts.push({ x: td.x - r, y: td.y - r }, { x: td.x + r, y: td.y + r });
    }
    return;
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
    for (const c of corners) {
      pts.push(applyMatrix(worldMatrix, c));
    }
    return;
  }

  const paths = getShapeLocalPaths(shape);
  for (const d of paths) {
    const res = transformMathPath(d, worldMatrix);
    pts.push(...res.sampledPoints);
  }
}

export function getShapeMathBounds(
  shape: DesignShape,
  parentMatrix: Matrix2D = IDENTITY_MATRIX
): BoundingBox | null {
  const pts: Point2D[] = [];
  collectShapeBoundPoints(shape, parentMatrix, pts);
  return boundsFromPoints(pts);
}
