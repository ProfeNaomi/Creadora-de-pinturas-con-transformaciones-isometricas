import {
  LaserDepthId,
  Matrix2D,
  Point2D,
  TessellationId,
  TessellationSpec,
  TessellationTile,
} from '../types/geometry';
import { applyMatrix, mathToSvgMm, roundCoord } from './math2d';

export type TessellationCategory = 'regular' | 'combo2' | 'combo3' | 'especial';

export interface TessellationMeta {
  id: TessellationId;
  name: string;
  notation: string;
  category: TessellationCategory;
  angleFormula: string;
  description: string;
  roleColors: Record<string, string>;
}

export const TESSELLATION_CATALOG: TessellationMeta[] = [
  {
    id: 'squares',
    name: 'Cuadrados',
    notation: '(4.4.4.4)',
    category: 'regular',
    angleFormula: '90° + 90° + 90° + 90° = 360°',
    description: 'Teselación regular de 1 figura: 4 cuadrados alrededor de cada vértice.',
    roleColors: { sq: '#e0e7ff', sqAlt: '#c7d2fe' },
  },
  {
    id: 'triangles',
    name: 'Triángulos Equiláteros',
    notation: '(3.3.3.3.3.3)',
    category: 'regular',
    angleFormula: '6 × 60° = 360°',
    description: 'Teselación regular de 1 figura: 6 triángulos equiláteros por vértice.',
    roleColors: { triUp: '#bae6fd', triDown: '#fef08a' },
  },
  {
    id: 'hexagons',
    name: 'Hexágonos (Panal)',
    notation: '(6.6.6)',
    category: 'regular',
    angleFormula: '120° + 120° + 120° = 360°',
    description: 'Teselación regular perfecta: 3 hexágonos de 120° forman exactamente 360°.',
    roleColors: { hex: '#fde68a', hexAlt: '#fed7aa' },
  },
  {
    id: 'octagons-squares',
    name: 'Octágonos + Cuadrados',
    notation: '(4.8.8)',
    category: 'combo2',
    angleFormula: '135° + 135° + 90° = 360°',
    description:
      'El octágono (135°) no tesela solo, pero combinado con cuadrados (90°) cierra exacto en 360°.',
    roleColors: { oct: '#bae6fd', sq: '#fecdd3' },
  },
  {
    id: 'kagome',
    name: 'Hexágonos + Triángulos',
    notation: '(3.6.3.6)',
    category: 'combo2',
    angleFormula: '60° + 120° + 60° + 120° = 360°',
    description: 'Combinación estrella de David / Kagome con hexágonos y triángulos.',
    roleColors: { hex: '#ddd6fe', tri: '#bbf7d0' },
  },
  {
    id: 'dodecagons-triangles',
    name: 'Dodecágonos + Triángulos',
    notation: '(3.12.12)',
    category: 'combo2',
    angleFormula: '150° + 150° + 60° = 360°',
    description:
      'El dodecágono (150°) requiere triángulos equiláteros (60°) para completar 360°.',
    roleColors: { dod: '#fed7aa', tri: '#bae6fd' },
  },
  {
    id: 'snub-square',
    name: 'Cuadrados + Triángulos',
    notation: '(3.3.4.3.4)',
    category: 'combo2',
    angleFormula: '60° + 60° + 90° + 60° + 90° = 360°',
    description: 'Mosaico dinámico donde 3 triángulos y 2 cuadrados giran en 360°.',
    roleColors: { sq: '#fecdd3', tri: '#fef08a' },
  },
  {
    id: 'rhombitrihexagonal',
    name: 'Hexágono + Cuadrado + Triángulo',
    notation: '(3.4.6.4)',
    category: 'combo3',
    angleFormula: '60° + 90° + 120° + 90° = 360°',
    description:
      'Combinación de 3 polígonos distintos que juntos suman 360° alrededor de cada vértice.',
    roleColors: { hex: '#ddd6fe', sq: '#bae6fd', tri: '#fecdd3' },
  },
  {
    id: 'great-rhombitrihexagonal',
    name: 'Dodecágono + Hexágono + Cuadrado',
    notation: '(4.6.12)',
    category: 'combo3',
    angleFormula: '90° + 120° + 150° = 360°',
    description:
      'Tres polígonos (4, 6 y 12 lados) unidos en un vértice: 90° + 120° + 150° = 360°.',
    roleColors: { dod: '#fef08a', hex: '#bbf7d0', sq: '#fecdd3' },
  },
  {
    id: 'cairo-pentagons',
    name: 'Pentágonos de El Cairo',
    notation: 'Pentagonal (120°/90°)',
    category: 'especial',
    angleFormula: '3×120° = 360° y 4×90° = 360°',
    description:
      'El pentágono regular (108°) ni el heptágono (~128.6°) teselan solos; el pentágono de El Cairo ajusta sus ángulos a 120° y 90° para teselar perfecto.',
    roleColors: { pA: '#fed7aa', pB: '#bae6fd' },
  },
  {
    id: 'isometric-rhombus',
    name: 'Rombos Isométricos (Cubos 3D)',
    notation: 'Rómbica (60°/120°)',
    category: 'especial',
    angleFormula: '120° + 120° + 120° = 360°',
    description: 'Tres rombos por vértice que crean ilusión óptica de cubos 3D para pintar.',
    roleColors: { r1: '#bae6fd', r2: '#ddd6fe', r3: '#fecdd3' },
  },
];

export const TESSELLATION_MAP: Record<TessellationId, TessellationMeta> =
  TESSELLATION_CATALOG.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<TessellationId, TessellationMeta>
  );

function polygonArea(pts: Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Sutherland-Hodgman polygon clipping against axis-aligned rectangle [minX, maxX] x [minY, maxY]
 */
export function clipPolygonToRect(
  poly: Point2D[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): Point2D[] {
  const clipEdge = (
    pts: Point2D[],
    inside: (p: Point2D) => boolean,
    intersect: (a: Point2D, b: Point2D) => Point2D
  ): Point2D[] => {
    if (pts.length === 0) return [];
    const out: Point2D[] = [];
    for (let i = 0; i < pts.length; i++) {
      const curr = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      const currIn = inside(curr);
      const prevIn = inside(prev);
      if (currIn) {
        if (!prevIn) out.push(intersect(prev, curr));
        out.push(curr);
      } else if (prevIn) {
        out.push(intersect(prev, curr));
      }
    }
    return out;
  };

  let res = poly;
  res = clipEdge(
    res,
    (p) => p.x >= minX,
    (a, b) => {
      const t = (minX - a.x) / (b.x - a.x);
      return { x: minX, y: a.y + t * (b.y - a.y) };
    }
  );
  res = clipEdge(
    res,
    (p) => p.x <= maxX,
    (a, b) => {
      const t = (maxX - a.x) / (b.x - a.x);
      return { x: maxX, y: a.y + t * (b.y - a.y) };
    }
  );
  res = clipEdge(
    res,
    (p) => p.y >= minY,
    (a, b) => {
      const t = (minY - a.y) / (b.y - a.y);
      return { x: a.x + t * (b.x - a.x), y: minY };
    }
  );
  res = clipEdge(
    res,
    (p) => p.y <= maxY,
    (a, b) => {
      const t = (maxY - a.y) / (b.y - a.y);
      return { x: a.x + t * (b.x - a.x), y: maxY };
    }
  );

  // Clean tiny near-duplicate points
  const cleaned: Point2D[] = [];
  for (const p of res) {
    const last = cleaned[cleaned.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-5) {
      cleaned.push({ x: roundCoord(p.x), y: roundCoord(p.y) });
    }
  }
  if (
    cleaned.length > 1 &&
    Math.hypot(
      cleaned[0].x - cleaned[cleaned.length - 1].x,
      cleaned[0].y - cleaned[cleaned.length - 1].y
    ) <= 1e-5
  ) {
    cleaned.pop();
  }
  return cleaned;
}

function regularPolyPoints(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  startDeg: number
): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i < sides; i++) {
    const rad = ((startDeg + (i * 360) / sides) * Math.PI) / 180;
    pts.push({
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    });
  }
  return pts;
}

function rectPoly(cx: number, cy: number, side: number, angleDeg = 0): Point2D[] {
  const r = side / Math.SQRT2;
  return regularPolyPoints(cx, cy, r, 4, 45 + angleDeg);
}

export function generateTessellationSpec(
  id: TessellationId,
  widthCm: number,
  heightCm: number,
  cellSizeCm: number,
  includeBorder: boolean,
  autoColor: boolean
): TessellationSpec {
  const meta = TESSELLATION_MAP[id];
  const s = Math.max(0.4, cellSizeCm);
  const hw = widthCm / 2;
  const hh = heightCm / 2;
  const pad = s * 4;

  const rawTiles: { points: Point2D[]; role: string }[] = [];

  if (id === 'squares') {
    const cols = Math.ceil((hw + pad) / s);
    const rows = Math.ceil((hh + pad) / s);
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        const cx = (c + 0.5) * s;
        const cy = (r + 0.5) * s;
        rawTiles.push({
          points: rectPoly(cx, cy, s, 0),
          role: (r + c) % 2 === 0 ? 'sq' : 'sqAlt',
        });
      }
    }
  } else if (id === 'triangles') {
    const h = (s * Math.sqrt(3)) / 2;
    const cols = Math.ceil((hw + pad) / (s / 2)) + 1;
    const rows = Math.ceil((hh + pad) / h) + 1;
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        const x0 = (c * s) / 2;
        const x1 = ((c + 2) * s) / 2;
        const xm = ((c + 1) * s) / 2;
        const y0 = r * h;
        const y1 = (r + 1) * h;
        if (Math.abs(r + c) % 2 === 0) {
          rawTiles.push({
            points: [
              { x: x0, y: y0 },
              { x: x1, y: y0 },
              { x: xm, y: y1 },
            ],
            role: 'triUp',
          });
        } else {
          rawTiles.push({
            points: [
              { x: x0, y: y1 },
              { x: xm, y: y0 },
              { x: x1, y: y1 },
            ],
            role: 'triDown',
          });
        }
      }
    }
  } else if (id === 'hexagons') {
    const dx = Math.sqrt(3) * s;
    const dy = 1.5 * s;
    const cols = Math.ceil((hw + pad) / dx) + 1;
    const rows = Math.ceil((hh + pad) / dy) + 1;
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        const cx = c * dx + (Math.abs(r) % 2 === 1 ? dx / 2 : 0);
        const cy = r * dy;
        rawTiles.push({
          points: regularPolyPoints(cx, cy, s, 6, 30),
          role: Math.abs(r + c) % 2 === 0 ? 'hex' : 'hexAlt',
        });
      }
    }
  } else if (id === 'octagons-squares') {
    const p = s * (1 + Math.SQRT2);
    const octR = s / (2 * Math.sin(Math.PI / 8));
    const cols = Math.ceil((hw + pad) / p) + 1;
    const rows = Math.ceil((hh + pad) / p) + 1;
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        const cx = c * p;
        const cy = r * p;
        rawTiles.push({
          points: regularPolyPoints(cx, cy, octR, 8, 22.5),
          role: 'oct',
        });
        rawTiles.push({
          points: rectPoly(cx + p / 2, cy + p / 2, s, 45),
          role: 'sq',
        });
      }
    }
  } else if (id === 'kagome') {
    const e1 = { x: 2 * s, y: 0 };
    const e2 = { x: s, y: Math.sqrt(3) * s };
    const nRange = Math.ceil((Math.max(hw, hh) + pad) / s) + 2;
    const triH = (Math.sqrt(3) / 2) * s;
    for (let j = -nRange; j <= nRange; j++) {
      for (let i = -nRange; i <= nRange; i++) {
        const cx = i * e1.x + j * e2.x;
        const cy = i * e1.y + j * e2.y;
        if (Math.abs(cx) > hw + pad || Math.abs(cy) > hh + pad) continue;
        rawTiles.push({
          points: regularPolyPoints(cx, cy, s, 6, 0),
          role: 'hex',
        });
        // Up triangle
        rawTiles.push({
          points: [
            { x: cx + s, y: cy },
            { x: cx + 1.5 * s, y: cy + triH },
            { x: cx + 0.5 * s, y: cy + triH },
          ],
          role: 'tri',
        });
        // Down triangle
        rawTiles.push({
          points: [
            { x: cx, y: cy + 2 * triH },
            { x: cx - 0.5 * s, y: cy + triH },
            { x: cx + 0.5 * s, y: cy + triH },
          ],
          role: 'tri',
        });
      }
    }
  } else if (id === 'dodecagons-triangles') {
    const D = s * (2 + Math.sqrt(3));
    const r12 = s / (2 * Math.sin(Math.PI / 12));
    const triH = (Math.sqrt(3) / 2) * s;
    const e1 = { x: D, y: 0 };
    const e2 = { x: D / 2, y: (D * Math.sqrt(3)) / 2 };
    const nRange = Math.ceil((Math.max(hw, hh) + pad) / D) + 2;
    for (let j = -nRange; j <= nRange; j++) {
      for (let i = -nRange; i <= nRange; i++) {
        const cx = i * e1.x + j * e2.x;
        const cy = i * e1.y + j * e2.y;
        if (Math.abs(cx) > hw + pad || Math.abs(cy) > hh + pad) continue;
        rawTiles.push({
          points: regularPolyPoints(cx, cy, r12, 12, 15),
          role: 'dod',
        });
        // Triangle 1 (pointing down between (0,0), e1, e2)
        rawTiles.push({
          points: [
            { x: cx + D / 2 - s / 2, y: cy + s / 2 + triH },
            { x: cx + D / 2 + s / 2, y: cy + s / 2 + triH },
            { x: cx + D / 2, y: cy + s / 2 },
          ],
          role: 'tri',
        });
        // Triangle 2 (pointing up above top horizontal edge of dodecagon)
        rawTiles.push({
          points: [
            { x: cx - s / 2, y: cy + D / 2 },
            { x: cx + s / 2, y: cy + D / 2 },
            { x: cx, y: cy + D / 2 + triH },
          ],
          role: 'tri',
        });
      }
    }
  } else if (id === 'snub-square') {
    const D = (s * (1 + Math.sqrt(3))) / Math.SQRT2;
    const nRange = Math.ceil((Math.max(hw, hh) + pad) / D) + 2;
    const addOutwardTri = (a: Point2D, b: Point2D) => {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      // Outward normal for CCW vertices is (dy, -dx)
      const apex = {
        x: mx + (Math.sqrt(3) / 2) * dy,
        y: my - (Math.sqrt(3) / 2) * dx,
      };
      rawTiles.push({ points: [a, apex, b], role: 'tri' });
    };

    for (let j = -nRange; j <= nRange; j++) {
      for (let i = -nRange; i <= nRange; i++) {
        const cx = i * D;
        const cy = j * D;
        if (Math.abs(cx) > hw + pad || Math.abs(cy) > hh + pad) continue;
        const sq1 = rectPoly(cx, cy, s, 15);
        rawTiles.push({ points: sq1, role: 'sq' });
        rawTiles.push({
          points: rectPoly(cx + D / 2, cy + D / 2, s, -15),
          role: 'sq',
        });
        for (let k = 0; k < 4; k++) {
          addOutwardTri(sq1[k], sq1[(k + 1) % 4]);
        }
      }
    }
  } else if (id === 'rhombitrihexagonal') {
    const L = s * (1 + Math.sqrt(3));
    const e1 = { x: L, y: 0 };
    const e2 = { x: L / 2, y: (L * Math.sqrt(3)) / 2 };
    const nRange = Math.ceil((Math.max(hw, hh) + pad) / L) + 2;
    const triH = (Math.sqrt(3) / 2) * s;
    const a6 = (Math.sqrt(3) / 2) * s;

    for (let j = -nRange; j <= nRange; j++) {
      for (let i = -nRange; i <= nRange; i++) {
        const cx = i * e1.x + j * e2.x;
        const cy = i * e1.y + j * e2.y;
        if (Math.abs(cx) > hw + pad || Math.abs(cy) > hh + pad) continue;
        // Pointy-top hexagon
        rawTiles.push({
          points: regularPolyPoints(cx, cy, s, 6, 30),
          role: 'hex',
        });
        // 3 squares at 0°, 60°, 120°
        rawTiles.push({ points: rectPoly(cx + L / 2, cy, s, 0), role: 'sq' });
        rawTiles.push({
          points: rectPoly(cx + L / 4, cy + (L * Math.sqrt(3)) / 4, s, 60),
          role: 'sq',
        });
        rawTiles.push({
          points: rectPoly(cx - L / 4, cy + (L * Math.sqrt(3)) / 4, s, 120),
          role: 'sq',
        });
        // Triangle at 30°
        rawTiles.push({
          points: [
            { x: cx + a6, y: cy + s / 2 },
            { x: cx + a6 + s, y: cy + s / 2 },
            { x: cx + a6 + s / 2, y: cy + s / 2 + triH },
          ],
          role: 'tri',
        });
        // Triangle at 90°
        rawTiles.push({
          points: [
            { x: cx, y: cy + s },
            { x: cx + s / 2, y: cy + s + triH },
            { x: cx - s / 2, y: cy + s + triH },
          ],
          role: 'tri',
        });
      }
    }
  } else if (id === 'great-rhombitrihexagonal') {
    const M = s * (3 + Math.sqrt(3));
    const r12 = s / (2 * Math.sin(Math.PI / 12));
    const e1 = { x: M, y: 0 };
    const e2 = { x: M / 2, y: (M * Math.sqrt(3)) / 2 };
    const nRange = Math.ceil((Math.max(hw, hh) + pad) / M) + 2;
    const hexDist = s * (1 + Math.sqrt(3));

    for (let j = -nRange; j <= nRange; j++) {
      for (let i = -nRange; i <= nRange; i++) {
        const cx = i * e1.x + j * e2.x;
        const cy = i * e1.y + j * e2.y;
        if (Math.abs(cx) > hw + pad || Math.abs(cy) > hh + pad) continue;
        // Dodecagon
        rawTiles.push({
          points: regularPolyPoints(cx, cy, r12, 12, 15),
          role: 'dod',
        });
        // 3 squares at 0°, 60°, 120°
        rawTiles.push({ points: rectPoly(cx + M / 2, cy, s, 0), role: 'sq' });
        rawTiles.push({
          points: rectPoly(cx + M / 4, cy + (M * Math.sqrt(3)) / 4, s, 60),
          role: 'sq',
        });
        rawTiles.push({
          points: rectPoly(cx - M / 4, cy + (M * Math.sqrt(3)) / 4, s, 120),
          role: 'sq',
        });
        // 2 flat-top hexagons at 30° and 90°
        rawTiles.push({
          points: regularPolyPoints(
            cx + hexDist * (Math.sqrt(3) / 2),
            cy + hexDist * 0.5,
            s,
            6,
            0
          ),
          role: 'hex',
        });
        rawTiles.push({
          points: regularPolyPoints(cx, cy + hexDist, s, 6, 0),
          role: 'hex',
        });
      }
    }
  } else if (id === 'cairo-pentagons') {
    // Half-cell a scaled so typical edge ≈ s
    const a = (s * Math.sqrt(3)) / 2;
    const c = a * (1 - 1 / Math.sqrt(3));
    const step = 2 * a;
    const nRange = Math.ceil((Math.max(hw, hh) + pad) / step) + 2;

    for (let j = -nRange; j <= nRange; j++) {
      for (let i = -nRange; i <= nRange; i++) {
        if (Math.abs(i + j) % 2 !== 0) continue; // Centers with horizontal segment
        const cx = i * step;
        const cy = j * step;
        if (Math.abs(cx) > hw + pad || Math.abs(cy) > hh + pad) continue;

        // Above horizontal segment
        rawTiles.push({
          points: [
            { x: cx - c, y: cy },
            { x: cx + c, y: cy },
            { x: cx + a, y: cy + a },
            { x: cx, y: cy + 2 * a - c },
            { x: cx - a, y: cy + a },
          ],
          role: 'pA',
        });
        // Below horizontal segment
        rawTiles.push({
          points: [
            { x: cx + c, y: cy },
            { x: cx - c, y: cy },
            { x: cx - a, y: cy - a },
            { x: cx, y: cy - 2 * a + c },
            { x: cx + a, y: cy - a },
          ],
          role: 'pA',
        });
        // Right neighbor (2a, 0) vertical segment -> left & right pentagons
        const rx = cx + step;
        rawTiles.push({
          points: [
            { x: rx, y: cy + c },
            { x: rx, y: cy - c },
            { x: rx - a, y: cy - a },
            { x: rx - 2 * a + c, y: cy },
            { x: rx - a, y: cy + a },
          ],
          role: 'pB',
        });
        rawTiles.push({
          points: [
            { x: rx, y: cy - c },
            { x: rx, y: cy + c },
            { x: rx + a, y: cy + a },
            { x: rx + 2 * a - c, y: cy },
            { x: rx + a, y: cy - a },
          ],
          role: 'pB',
        });
      }
    }
  } else if (id === 'isometric-rhombus') {
    const dx = Math.sqrt(3) * s;
    const dy = 1.5 * s;
    const cols = Math.ceil((hw + pad) / dx) + 1;
    const rows = Math.ceil((hh + pad) / dy) + 1;
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        const cx = c * dx + (Math.abs(r) % 2 === 1 ? dx / 2 : 0);
        const cy = r * dy;
        const hexPts = regularPolyPoints(cx, cy, s, 6, 30);
        // Split hexagon into 3 rhombuses meeting at center (cx, cy)
        rawTiles.push({
          points: [{ x: cx, y: cy }, hexPts[0], hexPts[1], hexPts[2]],
          role: 'r1',
        });
        rawTiles.push({
          points: [{ x: cx, y: cy }, hexPts[2], hexPts[3], hexPts[4]],
          role: 'r2',
        });
        rawTiles.push({
          points: [{ x: cx, y: cy }, hexPts[4], hexPts[5], hexPts[0]],
          role: 'r3',
        });
      }
    }
  }

  const clippedTiles: TessellationTile[] = [];
  for (const rt of rawTiles) {
    const clipped = clipPolygonToRect(rt.points, -hw, hw, -hh, hh);
    if (clipped.length >= 3 && polygonArea(clipped) > 1e-4) {
      clippedTiles.push({
        points: clipped,
        role: rt.role,
        fillColor: autoColor ? (meta.roleColors[rt.role] ?? '#e2e8f0') : 'none',
      });
    }
  }

  return {
    id,
    widthCm,
    heightCm,
    cellSizeCm: s,
    includeBorder,
    autoColor,
    tiles: clippedTiles,
  };
}

/**
 * Extracts deduplicated line segments in SVG mm for laser engraving,
 * preventing the laser head from double-burning shared polygon borders.
 */
export function buildDeduplicatedTessellationLaserPaths(
  spec: TessellationSpec,
  matrix: Matrix2D,
  boardWidthCm: number,
  boardHeightCm: number
): string[] {
  const seen = new Set<string>();
  const pathSegments: string[] = [];

  const addSegment = (p1: Point2D, p2: Point2D) => {
    const m1 = applyMatrix(matrix, p1);
    const m2 = applyMatrix(matrix, p2);
    const s1 = mathToSvgMm(m1, boardWidthCm, boardHeightCm);
    const s2 = mathToSvgMm(m2, boardWidthCm, boardHeightCm);
    if (Math.hypot(s2.x - s1.x, s2.y - s1.y) < 0.05) return;

    const q = (v: number) => Math.round(v * 200);
    const k1 = `${q(s1.x)},${q(s1.y)}`;
    const k2 = `${q(s2.x)},${q(s2.y)}`;
    const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    if (seen.has(key)) return;
    seen.add(key);

    pathSegments.push(`M ${s1.x} ${s1.y} L ${s2.x} ${s2.y}`);
  };

  for (const tile of spec.tiles) {
    const pts = tile.points;
    for (let i = 0; i < pts.length; i++) {
      addSegment(pts[i], pts[(i + 1) % pts.length]);
    }
  }

  if (spec.includeBorder) {
    const hw = spec.widthCm / 2;
    const hh = spec.heightCm / 2;
    const bPts: Point2D[] = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ];
    for (let i = 0; i < 4; i++) {
      addSegment(bPts[i], bPts[(i + 1) % 4]);
    }
  }

  return pathSegments;
}

/**
 * Groups deduplicated tessellation segments (for line/cut layers) and closed polygons
 * (for fill layers) by LaserDepthId.
 */
export function buildTessellationExportByLayer(
  spec: TessellationSpec,
  matrix: Matrix2D,
  boardWidthCm: number,
  boardHeightCm: number,
  defaultLayer: LaserDepthId
): Map<LaserDepthId, { lineSegments: [Point2D, Point2D][]; fillPolygons: Point2D[][] }> {
  const result = new Map<
    LaserDepthId,
    { lineSegments: [Point2D, Point2D][]; fillPolygons: Point2D[][] }
  >();
  const seenPerLayer = new Map<LaserDepthId, Set<string>>();

  const ensureLayer = (layer: LaserDepthId) => {
    if (!result.has(layer)) {
      result.set(layer, { lineSegments: [], fillPolygons: [] });
      seenPerLayer.set(layer, new Set());
    }
    return result.get(layer)!;
  };

  const addSeg = (layer: LaserDepthId, p1: Point2D, p2: Point2D) => {
    const bucket = ensureLayer(layer);
    const seen = seenPerLayer.get(layer)!;
    const m1 = applyMatrix(matrix, p1);
    const m2 = applyMatrix(matrix, p2);
    const s1 = mathToSvgMm(m1, boardWidthCm, boardHeightCm);
    const s2 = mathToSvgMm(m2, boardWidthCm, boardHeightCm);
    if (Math.hypot(s2.x - s1.x, s2.y - s1.y) < 0.05) return;

    const q = (v: number) => Math.round(v * 200);
    const k1 = `${q(s1.x)},${q(s1.y)}`;
    const k2 = `${q(s2.x)},${q(s2.y)}`;
    const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    if (seen.has(key)) return;
    seen.add(key);

    bucket.lineSegments.push([m1, m2]);
  };

  for (const tile of spec.tiles) {
    const layer = spec.roleLaserLayers?.[tile.role] ?? defaultLayer;
    const bucket = ensureLayer(layer);
    if (layer === 'engrave-fill') {
      bucket.fillPolygons.push(tile.points.map((pt) => applyMatrix(matrix, pt)));
    } else {
      for (let i = 0; i < tile.points.length; i++) {
        addSeg(layer, tile.points[i], tile.points[(i + 1) % tile.points.length]);
      }
    }
  }

  if (spec.includeBorder) {
    const borderLayer = spec.borderLaserLayer ?? defaultLayer;
    const hw = spec.widthCm / 2;
    const hh = spec.heightCm / 2;
    const bPts: Point2D[] = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ];
    for (let i = 0; i < 4; i++) {
      addSeg(borderLayer, bPts[i], bPts[(i + 1) % 4]);
    }
  }

  return result;
}
