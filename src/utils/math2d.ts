import {
  DesignShape,
  GridStep,
  Matrix2D,
  Point2D,
  RefObject,
  RefPoint,
  TransformParams,
  TransformRecord,
} from '../types/geometry';

export const IDENTITY_MATRIX: Matrix2D = [1, 0, 0, 1, 0, 0];

const KAPPA = 0.5522847498307936;

export function roundCoord(n: number): number {
  const r = Math.round(n * 10000) / 10000;
  return Object.is(r, -0) ? 0 : r;
}

export function formatNum(n: number, decimals = 2): string {
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(n * factor) / factor;
  const clean = Object.is(rounded, -0) ? 0 : rounded;
  return Number(clean.toFixed(decimals)).toString();
}

export function multiplyMatrices(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  const [a1, b1, c1, d1, tx1, ty1] = m1;
  const [a2, b2, c2, d2, tx2, ty2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * tx2 + c1 * ty2 + tx1,
    b1 * tx2 + d1 * ty2 + ty1,
  ];
}

export function applyMatrix(m: Matrix2D, p: Point2D): Point2D {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5],
  };
}

export function invertMatrix(m: Matrix2D): Matrix2D | null {
  const [a, b, c, d, tx, ty] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-10) return null;
  const invDet = 1 / det;
  return [
    d * invDet,
    -b * invDet,
    -c * invDet,
    a * invDet,
    (c * ty - d * tx) * invDet,
    (b * tx - a * ty) * invDet,
  ];
}

export function translationMatrix(dx: number, dy: number): Matrix2D {
  return [1, 0, 0, 1, dx, dy];
}

export function rotationMatrix(angleDeg: number, center: Point2D = { x: 0, y: 0 }): Matrix2D {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const tx = center.x - (cos * center.x - sin * center.y);
  const ty = center.y - (sin * center.x + cos * center.y);
  return [cos, sin, -sin, cos, tx, ty];
}

export function scaleMatrix(
  sx: number,
  sy: number,
  center: Point2D = { x: 0, y: 0 }
): Matrix2D {
  return [sx, 0, 0, sy, center.x * (1 - sx), center.y * (1 - sy)];
}

export function centralSymmetryMatrix(center: Point2D): Matrix2D {
  return [-1, 0, 0, -1, 2 * center.x, 2 * center.y];
}

export function axialReflectionMatrix(p1: Point2D, p2: Point2D): Matrix2D {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return IDENTITY_MATRIX;
  const ux = dx / Math.sqrt(lenSq);
  const uy = dy / Math.sqrt(lenSq);
  // Reflection across unit vector u through origin: [2ux^2 - 1, 2ux*uy, 2ux*uy, 2uy^2 - 1]
  const a = 2 * ux * ux - 1;
  const b = 2 * ux * uy;
  const c = b;
  const d = 2 * uy * uy - 1;
  // Translate p1 to origin, reflect, translate back
  const tx = p1.x - (a * p1.x + c * p1.y);
  const ty = p1.y - (b * p1.x + d * p1.y);
  return [a, b, c, d, tx, ty];
}

export function snapValue(val: number, step: GridStep): number {
  if (step === 0) return roundCoord(val);
  return roundCoord(Math.round(val / step) * step);
}

export function snapPoint(
  p: Point2D,
  step: GridStep,
  refPoints: RefPoint[] = [],
  refSnapRadiusCm = 0
): { point: Point2D; snappedToRef: RefPoint | null } {
  if (refSnapRadiusCm > 0 && refPoints.length > 0) {
    let best: RefPoint | null = null;
    let bestDist = refSnapRadiusCm;
    for (const rp of refPoints) {
      if (!rp.visible) continue;
      const dist = Math.hypot(p.x - rp.x, p.y - rp.y);
      if (dist <= bestDist) {
        bestDist = dist;
        best = rp;
      }
    }
    if (best) {
      return { point: { x: best.x, y: best.y }, snappedToRef: best };
    }
  }

  return {
    point: {
      x: snapValue(p.x, step),
      y: snapValue(p.y, step),
    },
    snappedToRef: null,
  };
}

export function distancePointToLine(p: Point2D, l1: Point2D, l2: Point2D): number {
  const dx = l2.x - l1.x;
  const dy = l2.y - l1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-8) return Math.hypot(p.x - l1.x, p.y - l1.y);
  return Math.abs(dy * p.x - dx * p.y + l2.x * l1.y - l2.y * l1.x) / len;
}

export function distancePointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function circleToPath(cx: number, cy: number, r: number): string {
  return ellipseToPath(cx, cy, r, r);
}

export function ellipseToPath(cx: number, cy: number, rx: number, ry: number): string {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  const x0 = cx - rx;
  const x1 = cx + rx;
  const y0 = cy - ry;
  const y1 = cy + ry;
  return [
    `M ${roundCoord(x1)} ${roundCoord(cy)}`,
    `C ${roundCoord(x1)} ${roundCoord(cy + oy)} ${roundCoord(cx + ox)} ${roundCoord(y1)} ${roundCoord(cx)} ${roundCoord(y1)}`,
    `C ${roundCoord(cx - ox)} ${roundCoord(y1)} ${roundCoord(x0)} ${roundCoord(cy + oy)} ${roundCoord(x0)} ${roundCoord(cy)}`,
    `C ${roundCoord(x0)} ${roundCoord(cy - oy)} ${roundCoord(cx - ox)} ${roundCoord(y0)} ${roundCoord(cx)} ${roundCoord(y0)}`,
    `C ${roundCoord(cx + ox)} ${roundCoord(y0)} ${roundCoord(x1)} ${roundCoord(cy - oy)} ${roundCoord(x1)} ${roundCoord(cy)}`,
    'Z',
  ].join(' ');
}

export function regularPolygonToPath(cx: number, cy: number, r: number, sides: number): string {
  const n = Math.max(3, Math.round(sides));
  const pts: Point2D[] = [];
  const startAngle = Math.PI / 2; // Top vertex pointing up in math coords
  for (let i = 0; i < n; i++) {
    const a = startAngle + (i * 2 * Math.PI) / n;
    pts.push({
      x: roundCoord(cx + r * Math.cos(a)),
      y: roundCoord(cy + r * Math.sin(a)),
    });
  }
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
}

function perpDist(p: Point2D, a: Point2D, b: Point2D): number {
  return distancePointToSegment(p, a, b);
}

export function simplifyRDP(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpDist(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyRDP(points.slice(0, index + 1), epsilon);
    const right = simplifyRDP(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[end]];
}

export function pointsToSmoothCubicPath(rawPoints: Point2D[], toleranceCm = 0.05): string {
  if (rawPoints.length === 0) return '';
  if (rawPoints.length === 1) {
    const p = rawPoints[0];
    return `M ${roundCoord(p.x)} ${roundCoord(p.y)} L ${roundCoord(p.x + 0.01)} ${roundCoord(p.y)}`;
  }
  const pts = simplifyRDP(rawPoints, toleranceCm);
  if (pts.length === 2) {
    return `M ${roundCoord(pts[0].x)} ${roundCoord(pts[0].y)} L ${roundCoord(pts[1].x)} ${roundCoord(pts[1].y)}`;
  }

  let d = `M ${roundCoord(pts[0].x)} ${roundCoord(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${roundCoord(cp1x)} ${roundCoord(cp1y)} ${roundCoord(cp2x)} ${roundCoord(cp2y)} ${roundCoord(p2.x)} ${roundCoord(p2.y)}`;
  }
  return d;
}

/**
 * Quadratic Bezier passing exactly through `through` at t = 0.5 between `start` and `end`.
 */
export function threePointCurveToQuadraticPath(
  start: Point2D,
  end: Point2D,
  through: Point2D
): string {
  const cx = 2 * through.x - 0.5 * (start.x + end.x);
  const cy = 2 * through.y - 0.5 * (start.y + end.y);
  return `M ${roundCoord(start.x)} ${roundCoord(start.y)} Q ${roundCoord(cx)} ${roundCoord(cy)} ${roundCoord(end.x)} ${roundCoord(end.y)}`;
}

/**
 * Smooth Catmull-Rom cubic Bezier spline preserving exact anchor points (open or closed).
 */
export function splinePointsToCubicPath(pts: Point2D[], closed = false): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) {
    return `M ${roundCoord(pts[0].x)} ${roundCoord(pts[0].y)}`;
  }
  if (n === 2 && !closed) {
    return `M ${roundCoord(pts[0].x)} ${roundCoord(pts[0].y)} L ${roundCoord(pts[1].x)} ${roundCoord(pts[1].y)}`;
  }

  let d = `M ${roundCoord(pts[0].x)} ${roundCoord(pts[0].y)}`;
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = closed ? pts[(i + 2) % n] : pts[Math.min(n - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${roundCoord(cp1x)} ${roundCoord(cp1y)} ${roundCoord(cp2x)} ${roundCoord(cp2y)} ${roundCoord(p2.x)} ${roundCoord(p2.y)}`;
  }
  if (closed) d += ' Z';
  return d;
}

export function sampleDotsAlongPoints(rawPoints: Point2D[], spacingCm = 0.35): Point2D[] {
  if (rawPoints.length === 0) return [];
  const dots: Point2D[] = [{ x: roundCoord(rawPoints[0].x), y: roundCoord(rawPoints[0].y) }];
  let acc = 0;
  let prev = rawPoints[0];

  for (let i = 1; i < rawPoints.length; i++) {
    const curr = rawPoints[i];
    let segDx = curr.x - prev.x;
    let segDy = curr.y - prev.y;
    let segLen = Math.hypot(segDx, segDy);

    while (acc + segLen >= spacingCm && segLen > 1e-6) {
      const remain = spacingCm - acc;
      const t = remain / segLen;
      const nx = prev.x + segDx * t;
      const ny = prev.y + segDy * t;
      dots.push({ x: roundCoord(nx), y: roundCoord(ny) });
      prev = { x: nx, y: ny };
      segDx = curr.x - prev.x;
      segDy = curr.y - prev.y;
      segLen = Math.hypot(segDx, segDy);
      acc = 0;
    }
    acc += segLen;
    prev = curr;
  }
  return dots;
}

export function mathToSvgMm(p: Point2D, boardWidthCm: number, boardHeightCm: number): Point2D {
  return {
    x: roundCoord((boardWidthCm / 2 + p.x) * 10),
    y: roundCoord((boardHeightCm / 2 - p.y) * 10),
  };
}

export function svgMmToMath(pMm: Point2D, boardWidthCm: number, boardHeightCm: number): Point2D {
  return {
    x: pMm.x / 10 - boardWidthCm / 2,
    y: boardHeightCm / 2 - pMm.y / 10,
  };
}

const TOKEN_RE = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;

/**
 * Transforms an SVG path string (supporting M, L, C, Q, Z in math cm coords)
 * by a 2D affine matrix and optionally converts each point to SVG mm coords.
 */
export function transformMathPath(
  d: string,
  matrix: Matrix2D,
  boardWidthCm?: number,
  boardHeightCm?: number
): { svgD: string; sampledPoints: Point2D[] } {
  const tokens = d.match(TOKEN_RE);
  if (!tokens) return { svgD: '', sampledPoints: [] };

  const out: string[] = [];
  const sampledPoints: Point2D[] = [];

  const mapPoint = (x: number, y: number): Point2D => {
    const mp = applyMatrix(matrix, { x, y });
    sampledPoints.push(mp);
    if (boardWidthCm !== undefined && boardHeightCm !== undefined) {
      return mathToSvgMm(mp, boardWidthCm, boardHeightCm);
    }
    return { x: roundCoord(mp.x), y: roundCoord(mp.y) };
  };

  let i = 0;
  let cmd = '';
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[a-zA-Z]$/.test(tok)) {
      cmd = tok.toUpperCase();
      i++;
      if (cmd === 'Z') {
        out.push('Z');
        continue;
      }
    }

    if (cmd === 'M' || cmd === 'L') {
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        const pt = mapPoint(x, y);
        out.push(`${cmd} ${pt.x} ${pt.y}`);
        if (cmd === 'M') cmd = 'L';
      }
    } else if (cmd === 'C') {
      const x1 = parseFloat(tokens[i++]);
      const y1 = parseFloat(tokens[i++]);
      const x2 = parseFloat(tokens[i++]);
      const y2 = parseFloat(tokens[i++]);
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      if (![x1, y1, x2, y2, x, y].some(Number.isNaN)) {
        const p1 = mapPoint(x1, y1);
        const p2 = mapPoint(x2, y2);
        const p3 = mapPoint(x, y);
        out.push(`C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`);
      }
    } else if (cmd === 'Q') {
      const x1 = parseFloat(tokens[i++]);
      const y1 = parseFloat(tokens[i++]);
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      if (![x1, y1, x, y].some(Number.isNaN)) {
        const p1 = mapPoint(x1, y1);
        const p2 = mapPoint(x, y);
        out.push(`Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`);
      }
    } else {
      i++;
    }
  }

  return { svgD: out.join(' '), sampledPoints };
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export function boundsFromPoints(pts: Point2D[]): BoundingBox | null {
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width: Math.max(0.05, maxX - minX),
    height: Math.max(0.05, maxY - minY),
  };
}

export function buildTransformMatrixForParams(
  params: TransformParams,
  refs: RefObject[],
  copyIndex = 0
): Matrix2D {
  if (params.type === 'axial') {
    const line = refs.find((r) => r.id === params.lineId && r.kind === 'line');
    if (!line || line.kind !== 'line') return IDENTITY_MATRIX;
    return axialReflectionMatrix(line.p1, line.p2);
  }
  if (params.type === 'central') {
    const pt = refs.find((r) => r.id === params.pointId && r.kind === 'point');
    const center = pt && pt.kind === 'point' ? { x: pt.x, y: pt.y } : { x: 0, y: 0 };
    return centralSymmetryMatrix(center);
  }
  if (params.type === 'rotation') {
    const pt = refs.find((r) => r.id === params.pointId && r.kind === 'point');
    const center = pt && pt.kind === 'point' ? { x: pt.x, y: pt.y } : { x: 0, y: 0 };
    return rotationMatrix(params.angleDeg ?? 90, center);
  }
  if (params.type === 'rosette') {
    const pt = refs.find((r) => r.id === params.pointId && r.kind === 'point');
    const center = pt && pt.kind === 'point' ? { x: pt.x, y: pt.y } : { x: 0, y: 0 };
    const total = Math.max(2, params.copies ?? 6);
    const angle = ((copyIndex + 1) * 360) / total;
    return rotationMatrix(angle, center);
  }
  if (params.type === 'translation') {
    let dx = params.dx ?? 0;
    let dy = params.dy ?? 0;
    if (params.vectorId) {
      const vec = refs.find((r) => r.id === params.vectorId && r.kind === 'vector');
      if (vec && vec.kind === 'vector') {
        dx = vec.to.x - vec.from.x;
        dy = vec.to.y - vec.from.y;
      }
    }
    const mult = copyIndex + 1;
    return translationMatrix(dx * mult, dy * mult);
  }
  return IDENTITY_MATRIX;
}

/**
 * Recomputes matrices for all shapes derived from isometric transformations
 * in topological order, so moving a base shape or reference updates all linked copies live.
 */
export function recomputeDerivedShapes(
  shapes: DesignShape[],
  refs: RefObject[],
  transforms: TransformRecord[]
): DesignShape[] {
  const transformMap = new Map(transforms.map((t) => [t.id, t]));
  const shapeMap = new Map(shapes.map((s) => [s.id, { ...s }]));
  const visited = new Set<string>();

  const updateShape = (id: string, stack: Set<string>): DesignShape | undefined => {
    const shape = shapeMap.get(id);
    if (!shape) return undefined;
    if (visited.has(id) || !shape.derivedFrom) {
      visited.add(id);
      return shape;
    }
    if (stack.has(id)) {
      visited.add(id);
      return shape;
    }

    stack.add(id);
    const tr = transformMap.get(shape.derivedFrom.transformId);
    const src = updateShape(shape.derivedFrom.sourceShapeId, stack);
    stack.delete(id);

    if (tr && src) {
      const opMatrix = buildTransformMatrixForParams(
        tr.params,
        refs,
        shape.derivedFrom.copyIndex
      );
      shape.matrix = multiplyMatrices(opMatrix, src.matrix);
      shape.visible = tr.visible;
    }
    visited.add(id);
    return shape;
  };

  for (const s of shapes) {
    updateShape(s.id, new Set());
  }

  return shapes.map((s) => shapeMap.get(s.id) ?? s);
}
