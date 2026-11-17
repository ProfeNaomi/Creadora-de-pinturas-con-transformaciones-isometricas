import {
  DesignShape,
  LaserDepthId,
  Matrix2D,
  Point2D,
  ShapeKind,
} from '../types/geometry';
import {
  applyMatrix,
  boundsFromPoints,
  distancePointToSegment,
  IDENTITY_MATRIX,
  multiplyMatrices,
  roundCoord,
  transformMathPath,
  translationMatrix,
} from './math2d';
import { getShapeLocalPaths, getShapeMathBounds } from './presets';
import {
  cloneDesignShape,
  ParsedSubpath,
  parseMathPathSubpaths,
  PathCmd,
  serializeSubpath,
  uid,
} from './blocks';

// ---------------------------------------------------------------------------
// Primitive segments (L, Q, C) in world math coordinates (cm)
// ---------------------------------------------------------------------------

export type SegPrimitive =
  | { kind: 'L'; p0: Point2D; p1: Point2D }
  | { kind: 'Q'; p0: Point2D; p1: Point2D; p2: Point2D }
  | { kind: 'C'; p0: Point2D; p1: Point2D; p2: Point2D; p3: Point2D };

interface Box2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function lerpPt(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function primitiveStart(s: SegPrimitive): Point2D {
  return s.p0;
}

function primitiveEnd(s: SegPrimitive): Point2D {
  return s.kind === 'L' ? s.p1 : s.kind === 'Q' ? s.p2 : s.p3;
}

function evaluatePrimitive(s: SegPrimitive, t: number): Point2D {
  if (s.kind === 'L') return lerpPt(s.p0, s.p1, t);
  const mt = 1 - t;
  if (s.kind === 'Q') {
    return {
      x: mt * mt * s.p0.x + 2 * mt * t * s.p1.x + t * t * s.p2.x,
      y: mt * mt * s.p0.y + 2 * mt * t * s.p1.y + t * t * s.p2.y,
    };
  }
  return {
    x:
      mt * mt * mt * s.p0.x +
      3 * mt * mt * t * s.p1.x +
      3 * mt * t * t * s.p2.x +
      t * t * t * s.p3.x,
    y:
      mt * mt * mt * s.p0.y +
      3 * mt * mt * t * s.p1.y +
      3 * mt * t * t * s.p2.y +
      t * t * t * s.p3.y,
  };
}

function primitiveTangentAt(s: SegPrimitive, atStart: boolean): Point2D {
  if (s.kind === 'L') {
    return { x: s.p1.x - s.p0.x, y: s.p1.y - s.p0.y };
  }
  if (s.kind === 'Q') {
    if (atStart) {
      const dx = s.p1.x - s.p0.x;
      const dy = s.p1.y - s.p0.y;
      return Math.hypot(dx, dy) > 1e-6
        ? { x: dx, y: dy }
        : { x: s.p2.x - s.p0.x, y: s.p2.y - s.p0.y };
    }
    const dx = s.p2.x - s.p1.x;
    const dy = s.p2.y - s.p1.y;
    return Math.hypot(dx, dy) > 1e-6
      ? { x: dx, y: dy }
      : { x: s.p2.x - s.p0.x, y: s.p2.y - s.p0.y };
  }
  if (atStart) {
    let dx = s.p1.x - s.p0.x;
    let dy = s.p1.y - s.p0.y;
    if (Math.hypot(dx, dy) <= 1e-6) {
      dx = s.p2.x - s.p0.x;
      dy = s.p2.y - s.p0.y;
    }
    if (Math.hypot(dx, dy) <= 1e-6) {
      dx = s.p3.x - s.p0.x;
      dy = s.p3.y - s.p0.y;
    }
    return { x: dx, y: dy };
  }
  let dx = s.p3.x - s.p2.x;
  let dy = s.p3.y - s.p2.y;
  if (Math.hypot(dx, dy) <= 1e-6) {
    dx = s.p3.x - s.p1.x;
    dy = s.p3.y - s.p1.y;
  }
  if (Math.hypot(dx, dy) <= 1e-6) {
    dx = s.p3.x - s.p0.x;
    dy = s.p3.y - s.p0.y;
  }
  return { x: dx, y: dy };
}

function isSharpCorner(prevSeg: SegPrimitive, nextSeg: SegPrimitive): boolean {
  const t1 = primitiveTangentAt(prevSeg, false);
  const t2 = primitiveTangentAt(nextSeg, true);
  const len1 = Math.hypot(t1.x, t1.y);
  const len2 = Math.hypot(t2.x, t2.y);
  if (len1 < 1e-6 || len2 < 1e-6) return true;
  const dot = (t1.x * t2.x + t1.y * t2.y) / (len1 * len2);
  const clamped = Math.max(-1, Math.min(1, dot));
  const angleDeg = (Math.acos(clamped) * 180) / Math.PI;
  return angleDeg > 12;
}

function primitiveBox(s: SegPrimitive, pad = 1e-4): Box2D {
  const pts =
    s.kind === 'L'
      ? [s.p0, s.p1]
      : s.kind === 'Q'
        ? [s.p0, s.p1, s.p2]
        : [s.p0, s.p1, s.p2, s.p3];
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
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

function boxesOverlap(a: Box2D, b: Box2D): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY
  );
}

function splitPrimitiveAt(
  s: SegPrimitive,
  t: number
): [SegPrimitive, SegPrimitive] {
  if (s.kind === 'L') {
    const m = lerpPt(s.p0, s.p1, t);
    return [
      { kind: 'L', p0: s.p0, p1: m },
      { kind: 'L', p0: m, p1: s.p1 },
    ];
  }
  if (s.kind === 'Q') {
    const q0 = lerpPt(s.p0, s.p1, t);
    const q1 = lerpPt(s.p1, s.p2, t);
    const r = lerpPt(q0, q1, t);
    return [
      { kind: 'Q', p0: s.p0, p1: q0, p2: r },
      { kind: 'Q', p0: r, p1: q1, p2: s.p2 },
    ];
  }
  const q0 = lerpPt(s.p0, s.p1, t);
  const q1 = lerpPt(s.p1, s.p2, t);
  const q2 = lerpPt(s.p2, s.p3, t);
  const r0 = lerpPt(q0, q1, t);
  const r1 = lerpPt(q1, q2, t);
  const m = lerpPt(r0, r1, t);
  return [
    { kind: 'C', p0: s.p0, p1: q0, p2: r0, p3: m },
    { kind: 'C', p0: m, p1: r1, p2: q2, p3: s.p3 },
  ];
}

function splitPrimitiveAtParams(
  s: SegPrimitive,
  params: number[]
): { parts: SegPrimitive[]; splitBoundaryIndices: boolean[] } {
  const sorted = [...params]
    .filter((t) => t > 1e-4 && t < 1 - 1e-4)
    .sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const t of sorted) {
    if (
      deduped.length === 0 ||
      Math.abs(t - deduped[deduped.length - 1]) > 1e-4
    ) {
      deduped.push(t);
    }
  }
  if (deduped.length === 0) {
    return { parts: [s], splitBoundaryIndices: [false] };
  }

  const parts: SegPrimitive[] = [];
  const boundaries: boolean[] = [false];
  let rem = s;
  let prevT = 0;
  for (const t of deduped) {
    const localT = (t - prevT) / (1 - prevT);
    if (localT <= 1e-4 || localT >= 1 - 1e-4) continue;
    const [left, right] = splitPrimitiveAt(rem, localT);
    parts.push(left);
    boundaries.push(true);
    rem = right;
    prevT = t;
  }
  parts.push(rem);
  return { parts, splitBoundaryIndices: boundaries };
}

function intersectChords(
  a0: Point2D,
  a1: Point2D,
  b0: Point2D,
  b1: Point2D
): { uA: number; uB: number; pt: Point2D; dist: number } | null {
  const rx = a1.x - a0.x;
  const ry = a1.y - a0.y;
  const sx = b1.x - b0.x;
  const sy = b1.y - b0.y;
  const denom = rx * sy - ry * sx;

  if (Math.abs(denom) > 1e-9) {
    const qpx = b0.x - a0.x;
    const qpy = b0.y - a0.y;
    const uA = (qpx * sy - qpy * sx) / denom;
    const uB = (qpx * ry - qpy * rx) / denom;
    if (uA >= -1e-4 && uA <= 1 + 1e-4 && uB >= -1e-4 && uB <= 1 + 1e-4) {
      const ca = Math.max(0, Math.min(1, uA));
      const cb = Math.max(0, Math.min(1, uB));
      const pA = lerpPt(a0, a1, ca);
      const pB = lerpPt(b0, b1, cb);
      return {
        uA: ca,
        uB: cb,
        pt: lerpPt(pA, pB, 0.5),
        dist: Math.hypot(pA.x - pB.x, pA.y - pB.y),
      };
    }
    return null;
  }

  // Parallel/grazing chord fallback: check midpoint proximity
  const midA = lerpPt(a0, a1, 0.5);
  const dMid = distancePointToSegment(midA, b0, b1);
  if (dMid < 2e-3) {
    const lenSqB = sx * sx + sy * sy;
    const uB =
      lenSqB > 1e-10
        ? Math.max(0, Math.min(1, ((midA.x - b0.x) * sx + (midA.y - b0.y) * sy) / lenSqB))
        : 0.5;
    return { uA: 0.5, uB, pt: midA, dist: dMid };
  }
  return null;
}

interface IntersectionHit {
  tA: number;
  tB: number;
  pt: Point2D;
}

function intersectPrimitives(
  segA: SegPrimitive,
  segB: SegPrimitive
): IntersectionHit[] {
  const boxA = primitiveBox(segA, 1e-3);
  const boxB = primitiveBox(segB, 1e-3);
  if (!boxesOverlap(boxA, boxB)) return [];

  // Exact analytical Line-Line intersection
  if (segA.kind === 'L' && segB.kind === 'L') {
    const hits: IntersectionHit[] = [];
    const hit = intersectChords(segA.p0, segA.p1, segB.p0, segB.p1);
    if (hit && hit.dist <= 1e-3) {
      hits.push({ tA: hit.uA, tB: hit.uB, pt: hit.pt });
      return hits;
    }
    // Check collinear overlap endpoints
    const lenA = Math.hypot(segA.p1.x - segA.p0.x, segA.p1.y - segA.p0.y);
    const lenB = Math.hypot(segB.p1.x - segB.p0.x, segB.p1.y - segB.p0.y);
    if (lenA > 1e-5 && lenB > 1e-5) {
      const projOnA = (p: Point2D): number | null => {
        if (distancePointToSegment(p, segA.p0, segA.p1) > 1e-3) return null;
        const dx = segA.p1.x - segA.p0.x;
        const dy = segA.p1.y - segA.p0.y;
        return ((p.x - segA.p0.x) * dx + (p.y - segA.p0.y) * dy) / (lenA * lenA);
      };
      const projOnB = (p: Point2D): number | null => {
        if (distancePointToSegment(p, segB.p0, segB.p1) > 1e-3) return null;
        const dx = segB.p1.x - segB.p0.x;
        const dy = segB.p1.y - segB.p0.y;
        return ((p.x - segB.p0.x) * dx + (p.y - segB.p0.y) * dy) / (lenB * lenB);
      };
      const tb0 = projOnA(segB.p0);
      if (tb0 !== null && tb0 > 1e-4 && tb0 < 1 - 1e-4) {
        hits.push({ tA: tb0, tB: 0, pt: segB.p0 });
      }
      const tb1 = projOnA(segB.p1);
      if (tb1 !== null && tb1 > 1e-4 && tb1 < 1 - 1e-4) {
        hits.push({ tA: tb1, tB: 1, pt: segB.p1 });
      }
      const ta0 = projOnB(segA.p0);
      if (ta0 !== null && ta0 > 1e-4 && ta0 < 1 - 1e-4) {
        hits.push({ tA: 0, tB: ta0, pt: segA.p0 });
      }
      const ta1 = projOnB(segA.p1);
      if (ta1 !== null && ta1 > 1e-4 && ta1 < 1 - 1e-4) {
        hits.push({ tA: 1, tB: ta1, pt: segA.p1 });
      }
    }
    return hits;
  }

  // Recursive De Casteljau subdivision for curves
  const raw: { tA: number; tB: number; pt: Point2D; err: number }[] = [];

  const recurse = (
    curA: SegPrimitive,
    a0: number,
    a1: number,
    curB: SegPrimitive,
    b0: number,
    b1: number,
    depth: number
  ) => {
    const bA = primitiveBox(curA, 5e-4);
    const bB = primitiveBox(curB, 5e-4);
    if (!boxesOverlap(bA, bB)) return;

    const diagA = Math.hypot(bA.maxX - bA.minX, bA.maxY - bA.minY);
    const diagB = Math.hypot(bB.maxX - bB.minX, bB.maxY - bB.minY);

    if (depth >= 16 || (diagA < 5e-4 && diagB < 5e-4)) {
      const hit = intersectChords(
        primitiveStart(curA),
        primitiveEnd(curA),
        primitiveStart(curB),
        primitiveEnd(curB)
      );
      if (hit) {
        const tA = a0 + hit.uA * (a1 - a0);
        const tB = b0 + hit.uB * (b1 - b0);
        const pA = evaluatePrimitive(segA, tA);
        const pB = evaluatePrimitive(segB, tB);
        const err = Math.hypot(pA.x - pB.x, pA.y - pB.y);
        if (err <= 0.01) {
          raw.push({ tA, tB, pt: lerpPt(pA, pB, 0.5), err });
        }
      }
      return;
    }

    const splitA = diagA >= 5e-4 && (curA.kind !== 'L' || diagA >= diagB * 0.4);
    const splitB = diagB >= 5e-4 && (curB.kind !== 'L' || diagB >= diagA * 0.4);

    if (splitA && splitB) {
      const [aL, aR] = splitPrimitiveAt(curA, 0.5);
      const aMid = (a0 + a1) / 2;
      const [bL, bR] = splitPrimitiveAt(curB, 0.5);
      const bMid = (b0 + b1) / 2;
      recurse(aL, a0, aMid, bL, b0, bMid, depth + 1);
      recurse(aL, a0, aMid, bR, bMid, b1, depth + 1);
      recurse(aR, aMid, a1, bL, b0, bMid, depth + 1);
      recurse(aR, aMid, a1, bR, bMid, b1, depth + 1);
    } else if (splitA) {
      const [aL, aR] = splitPrimitiveAt(curA, 0.5);
      const aMid = (a0 + a1) / 2;
      recurse(aL, a0, aMid, curB, b0, b1, depth + 1);
      recurse(aR, aMid, a1, curB, b0, b1, depth + 1);
    } else {
      const [bL, bR] = splitPrimitiveAt(curB, 0.5);
      const bMid = (b0 + b1) / 2;
      recurse(curA, a0, a1, bL, b0, bMid, depth + 1);
      recurse(curA, a0, a1, bR, bMid, b1, depth + 1);
    }
  };

  recurse(segA, 0, 1, segB, 0, 1, 0);

  // Deduplicate clustered intersection roots
  raw.sort((u, v) => u.err - v.err);
  const deduped: IntersectionHit[] = [];
  for (const r of raw) {
    const dup = deduped.some(
      (d) =>
        Math.abs(d.tA - r.tA) < 5e-3 &&
        Math.abs(d.tB - r.tB) < 5e-3 &&
        Math.hypot(d.pt.x - r.pt.x, d.pt.y - r.pt.y) < 0.02
    );
    if (!dup) {
      deduped.push({ tA: r.tA, tB: r.tB, pt: r.pt });
    }
  }
  return deduped;
}

// ---------------------------------------------------------------------------
// Shape Extraction into World Subpaths & Primitives
// ---------------------------------------------------------------------------

interface WorldSubpathPrims {
  closed: boolean;
  prims: SegPrimitive[];
}

function subpathToPrimitives(sp: ParsedSubpath): SegPrimitive[] {
  const prims: SegPrimitive[] = [];
  let curr = sp.start;
  for (const cmd of sp.cmds) {
    if (cmd.kind === 'L') {
      if (Math.hypot(cmd.to.x - curr.x, cmd.to.y - curr.y) > 1e-5) {
        prims.push({ kind: 'L', p0: curr, p1: cmd.to });
      }
      curr = cmd.to;
    } else if (cmd.kind === 'Q') {
      prims.push({ kind: 'Q', p0: curr, p1: cmd.cp1, p2: cmd.to });
      curr = cmd.to;
    } else {
      prims.push({
        kind: 'C',
        p0: curr,
        p1: cmd.cp1,
        p2: cmd.cp2,
        p3: cmd.to,
      });
      curr = cmd.to;
    }
  }
  if (sp.closed && Math.hypot(curr.x - sp.start.x, curr.y - sp.start.y) > 1e-4) {
    prims.push({ kind: 'L', p0: curr, p1: sp.start });
  }
  return prims;
}

function primitivesToSubpath(prims: SegPrimitive[], closed: boolean): ParsedSubpath {
  if (prims.length === 0) {
    return { start: { x: 0, y: 0 }, cmds: [], closed: false };
  }
  const cmds: PathCmd[] = prims.map((s) => {
    if (s.kind === 'L') return { kind: 'L', to: s.p1 };
    if (s.kind === 'Q') return { kind: 'Q', cp1: s.p1, to: s.p2 };
    return { kind: 'C', cp1: s.p1, cp2: s.p2, to: s.p3 };
  });
  return {
    start: primitiveStart(prims[0]),
    cmds,
    closed,
  };
}

function getDeduplicatedTessellationWorldSegments(
  shape: DesignShape,
  worldMatrix: Matrix2D
): [Point2D, Point2D][] {
  if (shape.kind !== 'tessellation' || !shape.tessellation) return [];
  const seen = new Set<string>();
  const segs: [Point2D, Point2D][] = [];
  const addSeg = (p1: Point2D, p2: Point2D) => {
    const m1 = applyMatrix(worldMatrix, p1);
    const m2 = applyMatrix(worldMatrix, p2);
    if (Math.hypot(m2.x - m1.x, m2.y - m1.y) < 1e-4) return;
    const q = (v: number) => Math.round(v * 2000);
    const k1 = `${q(m1.x)},${q(m1.y)}`;
    const k2 = `${q(m2.x)},${q(m2.y)}`;
    const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    if (seen.has(key)) return;
    seen.add(key);
    segs.push([m1, m2]);
  };

  for (const tile of shape.tessellation.tiles) {
    for (let i = 0; i < tile.points.length; i++) {
      addSeg(tile.points[i], tile.points[(i + 1) % tile.points.length]);
    }
  }
  if (shape.tessellation.includeBorder) {
    const hw = shape.tessellation.widthCm / 2;
    const hh = shape.tessellation.heightCm / 2;
    const bp = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ];
    for (let i = 0; i < 4; i++) {
      addSeg(bp[i], bp[(i + 1) % 4]);
    }
  }
  return segs;
}

function extractShapeWorldSubpaths(
  shape: DesignShape,
  worldMatrix: Matrix2D
): WorldSubpathPrims[] {
  if (!shape.visible) return [];
  if (shape.kind === 'dots') return [];
  if (shape.kind === 'tessellation') {
    return getDeduplicatedTessellationWorldSegments(shape, worldMatrix).map(
      ([p0, p1]) => ({
        closed: false,
        prims: [{ kind: 'L', p0, p1 }],
      })
    );
  }
  const paths = getShapeLocalPaths(shape);
  const out: WorldSubpathPrims[] = [];
  for (const d of paths) {
    const { svgD } = transformMathPath(d, worldMatrix);
    if (!svgD) continue;
    const parsed = parseMathPathSubpaths(svgD);
    for (const sp of parsed) {
      const prims = subpathToPrimitives(sp);
      if (prims.length > 0) {
        out.push({ closed: sp.closed, prims });
      }
    }
  }
  return out;
}

interface LeafEntry {
  shape: DesignShape;
  worldMatrix: Matrix2D;
  effectiveLayer?: LaserDepthId;
  rootTopId: string;
}

function collectLeafEntries(
  shapes: DesignShape[],
  parentMatrix: Matrix2D = IDENTITY_MATRIX,
  inheritedLayer?: LaserDepthId,
  rootTopId?: string
): LeafEntry[] {
  const out: LeafEntry[] = [];
  for (const s of shapes) {
    if (!s.visible) continue;
    const worldMatrix = multiplyMatrices(parentMatrix, s.matrix);
    const effectiveLayer = s.laserLayer ?? inheritedLayer;
    const topId = rootTopId ?? s.id;
    if (s.kind === 'group' && s.children) {
      out.push(...collectLeafEntries(s.children, worldMatrix, effectiveLayer, topId));
    } else if (s.kind !== 'dots') {
      out.push({ shape: s, worldMatrix, effectiveLayer, rootTopId: topId });
    }
  }
  return out;
}

function distancePointToPrimitive(p: Point2D, seg: SegPrimitive): number {
  if (seg.kind === 'L') {
    return distancePointToSegment(p, seg.p0, seg.p1);
  }
  const steps = seg.kind === 'Q' ? 14 : 18;
  let minD = Infinity;
  let prev = primitiveStart(seg);
  for (let i = 1; i <= steps; i++) {
    const curr = evaluatePrimitive(seg, i / steps);
    const d = distancePointToSegment(p, prev, curr);
    if (d < minD) minD = d;
    prev = curr;
  }
  return minD;
}

function primitiveLengthApprox(s: SegPrimitive): number {
  if (s.kind === 'L') {
    return Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y);
  }
  let len = 0;
  let prev = primitiveStart(s);
  for (let i = 1; i <= 8; i++) {
    const curr = evaluatePrimitive(s, i / 8);
    len += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    prev = curr;
  }
  return len;
}

// ---------------------------------------------------------------------------
// Splitting Subpaths at Intersections and Corners
// ---------------------------------------------------------------------------

interface ChainPiece {
  prims: SegPrimitive[];
  closed: boolean;
}

function splitWorldSubpaths(
  targetSubpaths: WorldSubpathPrims[],
  cutterSubpaths: WorldSubpathPrims[],
  options: { splitAtCorners: boolean; checkSelfIntersections: boolean }
): ChainPiece[][] {
  return targetSubpaths.map((sp, spIdx) => {
    const n = sp.prims.length;
    if (n === 0) return [];

    const primSplits: number[][] = Array.from({ length: n }, () => []);
    const vertexIntersections: boolean[] = Array(n + 1).fill(false);

    // Intersect against all cutter subpaths
    for (const cSp of cutterSubpaths) {
      for (const cPrim of cSp.prims) {
        for (let i = 0; i < n; i++) {
          const hits = intersectPrimitives(sp.prims[i], cPrim);
          for (const h of hits) {
            if (h.tA <= 1e-4) {
              vertexIntersections[i] = true;
            } else if (h.tA >= 1 - 1e-4) {
              vertexIntersections[i + 1] = true;
            } else {
              primSplits[i].push(h.tA);
            }
          }
        }
      }
    }

    // Check self-intersections within targetSubpaths
    if (options.checkSelfIntersections) {
      for (let oSpIdx = 0; oSpIdx < targetSubpaths.length; oSpIdx++) {
        const oSp = targetSubpaths[oSpIdx];
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < oSp.prims.length; j++) {
            if (oSpIdx === spIdx) {
              if (j <= i + 1) continue;
              if (sp.closed && i === 0 && j === n - 1) continue;
            }
            const hits = intersectPrimitives(sp.prims[i], oSp.prims[j]);
            for (const h of hits) {
              if (h.tA <= 1e-4) vertexIntersections[i] = true;
              else if (h.tA >= 1 - 1e-4) vertexIntersections[i + 1] = true;
              else primSplits[i].push(h.tA);
            }
          }
        }
      }
    }

    // Mark sharp corners if requested
    const vertexCut: boolean[] = Array(n + 1).fill(false);
    for (let v = 0; v <= n; v++) {
      vertexCut[v] = vertexIntersections[v];
    }
    if (sp.closed && (vertexIntersections[0] || vertexIntersections[n])) {
      vertexCut[0] = true;
      vertexCut[n] = true;
    }

    if (options.splitAtCorners) {
      for (let i = 1; i < n; i++) {
        if (isSharpCorner(sp.prims[i - 1], sp.prims[i])) {
          vertexCut[i] = true;
        }
      }
      if (sp.closed && n >= 2 && isSharpCorner(sp.prims[n - 1], sp.prims[0])) {
        vertexCut[0] = true;
        vertexCut[n] = true;
      }
    }

    // Build flat sub-primitives with start-cut flags
    const subPrims: SegPrimitive[] = [];
    const cutAtStart: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const { parts, splitBoundaryIndices } = splitPrimitiveAtParams(
        sp.prims[i],
        primSplits[i]
      );
      parts.forEach((part, k) => {
        if (primitiveLengthApprox(part) < 1e-4) return;
        subPrims.push(part);
        cutAtStart.push(k === 0 ? vertexCut[i] : splitBoundaryIndices[k]);
      });
    }

    if (subPrims.length === 0) return [];

    // Group sub-primitives into continuous chains
    if (!sp.closed) {
      const chains: ChainPiece[] = [];
      let current: SegPrimitive[] = [subPrims[0]];
      for (let k = 1; k < subPrims.length; k++) {
        if (cutAtStart[k]) {
          chains.push({ prims: current, closed: false });
          current = [subPrims[k]];
        } else {
          current.push(subPrims[k]);
        }
      }
      if (current.length > 0) chains.push({ prims: current, closed: false });
      return chains;
    }

    const firstCutIdx = cutAtStart.findIndex(Boolean);
    if (firstCutIdx === -1) {
      return [{ prims: subPrims, closed: true }];
    }

    const rotatedPrims = [
      ...subPrims.slice(firstCutIdx),
      ...subPrims.slice(0, firstCutIdx),
    ];
    const rotatedCuts = [
      ...cutAtStart.slice(firstCutIdx),
      ...cutAtStart.slice(0, firstCutIdx),
    ];

    const chains: ChainPiece[] = [];
    let current: SegPrimitive[] = [rotatedPrims[0]];
    for (let k = 1; k < rotatedPrims.length; k++) {
      if (rotatedCuts[k]) {
        chains.push({ prims: current, closed: false });
        current = [rotatedPrims[k]];
      } else {
        current.push(rotatedPrims[k]);
      }
    }
    if (current.length > 0) chains.push({ prims: current, closed: false });
    return chains;
  });
}

function chainToDesignShape(
  chain: ChainPiece,
  baseName: string,
  template: {
    strokeWidthMm: number;
    laserLayer?: LaserDepthId;
    fillColor?: string;
  }
): DesignShape | null {
  if (chain.prims.length === 0) return null;
  const sp = primitivesToSubpath(chain.prims, chain.closed);
  const worldD = serializeSubpath(sp);
  if (!worldD) return null;

  const { sampledPoints } = transformMathPath(worldD, IDENTITY_MATRIX);
  const bounds = boundsFromPoints(sampledPoints);
  const cx = bounds ? roundCoord(bounds.cx) : 0;
  const cy = bounds ? roundCoord(bounds.cy) : 0;
  const inv = translationMatrix(-cx, -cy);
  const localD = transformMathPath(worldD, inv).svgD;
  if (!localD) return null;

  let kind: ShapeKind = 'path';
  if (!chain.closed && chain.prims.length === 1) {
    if (chain.prims[0].kind === 'L') kind = 'segment';
    else kind = 'curve';
  }

  return {
    id: uid('sh'),
    name: baseName,
    kind,
    localPaths: [localD],
    matrix: translationMatrix(cx, cy),
    fillColor:
      chain.closed && template.fillColor && template.fillColor !== 'none'
        ? template.fillColor
        : 'none',
    strokeWidthMm: template.strokeWidthMm,
    laserLayer: template.laserLayer,
    visible: true,
  };
}

// ---------------------------------------------------------------------------
// Trim Tool (Hover Preview + Click Trim)
// ---------------------------------------------------------------------------

export interface TrimTargetInfo {
  rootTopId: string;
  leafId: string;
  previewPathD: string;
  dist: number;
  subpathIdx: number;
  chainIdx: number;
  targetSubpaths: WorldSubpathPrims[];
  chainsPerSubpath: ChainPiece[][];
  leafEntry: LeafEntry;
}

export function findTrimHoverTarget(
  allShapes: DesignShape[],
  p: Point2D,
  tolCm: number
): TrimTargetInfo | null {
  const leaves = collectLeafEntries(allShapes);
  let bestTarget: TrimTargetInfo | null = null;

  // Iterate topmost leaves first, picking closest chain within tolCm
  for (let idx = leaves.length - 1; idx >= 0; idx--) {
    const leaf = leaves[idx];
    const worldBounds = getShapeMathBounds(
      { ...leaf.shape, matrix: leaf.worldMatrix },
      IDENTITY_MATRIX
    );
    if (
      !worldBounds ||
      p.x < worldBounds.minX - tolCm ||
      p.x > worldBounds.maxX + tolCm ||
      p.y < worldBounds.minY - tolCm ||
      p.y > worldBounds.maxY + tolCm
    ) {
      continue;
    }

    const targetSubpaths = extractShapeWorldSubpaths(leaf.shape, leaf.worldMatrix);
    if (targetSubpaths.length === 0) continue;

    // Quick proximity check before intersecting
    let nearAny = false;
    for (const sp of targetSubpaths) {
      for (const pr of sp.prims) {
        if (distancePointToPrimitive(p, pr) <= tolCm) {
          nearAny = true;
          break;
        }
      }
      if (nearAny) break;
    }
    if (!nearAny) continue;

    // Collect cutter subpaths from overlapping leaves
    const cutterSubpaths: WorldSubpathPrims[] = [];
    for (let j = 0; j < leaves.length; j++) {
      if (j === idx) continue;
      const other = leaves[j];
      const otherBounds = getShapeMathBounds(
        { ...other.shape, matrix: other.worldMatrix },
        IDENTITY_MATRIX
      );
      if (!otherBounds) continue;
      if (
        otherBounds.maxX < worldBounds.minX - 0.05 ||
        otherBounds.minX > worldBounds.maxX + 0.05 ||
        otherBounds.maxY < worldBounds.minY - 0.05 ||
        otherBounds.minY > worldBounds.maxY + 0.05
      ) {
        continue;
      }
      cutterSubpaths.push(
        ...extractShapeWorldSubpaths(other.shape, other.worldMatrix)
      );
    }

    const chainsPerSubpath = splitWorldSubpaths(targetSubpaths, cutterSubpaths, {
      splitAtCorners: true,
      checkSelfIntersections: true,
    });

    for (let spIdx = 0; spIdx < chainsPerSubpath.length; spIdx++) {
      const chains = chainsPerSubpath[spIdx];
      for (let cIdx = 0; cIdx < chains.length; cIdx++) {
        const ch = chains[cIdx];
        let minD = Infinity;
        for (const pr of ch.prims) {
          const d = distancePointToPrimitive(p, pr);
          if (d < minD) minD = d;
        }
        if (minD <= tolCm && (!bestTarget || minD < bestTarget.dist)) {
          const previewPathD = serializeSubpath(
            primitivesToSubpath(ch.prims, ch.closed)
          );
          bestTarget = {
            rootTopId: leaf.rootTopId,
            leafId: leaf.shape.id,
            previewPathD,
            dist: minD,
            subpathIdx: spIdx,
            chainIdx: cIdx,
            targetSubpaths,
            chainsPerSubpath,
            leafEntry: leaf,
          };
        }
      }
    }
  }

  return bestTarget;
}

export interface TrimExecutionResult {
  targetRootId: string;
  replacementShapes: DesignShape[];
  trimmedWasSinglePiece: boolean;
}

export function trimShapeAtPoint(
  allShapes: DesignShape[],
  p: Point2D,
  tolCm: number
): TrimExecutionResult | null {
  const target = findTrimHoverTarget(allShapes, p, tolCm);
  if (!target) return null;

  // Keep untouched subpaths whole, and keep contiguous non-deleted segments
  // stitched across corners so trimming one edge leaves the rest cohesive.
  const remainingChains: ChainPiece[] = [];
  target.chainsPerSubpath.forEach((chains, spIdx) => {
    const origSub = target.targetSubpaths[spIdx];
    if (spIdx !== target.subpathIdx) {
      if (origSub && origSub.prims.length > 0) {
        remainingChains.push({ prims: origSub.prims, closed: origSub.closed });
      }
      return;
    }

    if (origSub?.closed) {
      if (chains.length <= 1) return;
      const orderedAfterCut = [
        ...chains.slice(target.chainIdx + 1),
        ...chains.slice(0, target.chainIdx),
      ];
      const mergedPrims = orderedAfterCut.flatMap((c) => c.prims);
      if (mergedPrims.length > 0) {
        remainingChains.push({ prims: mergedPrims, closed: false });
      }
    } else {
      const before = chains.slice(0, target.chainIdx).flatMap((c) => c.prims);
      const after = chains.slice(target.chainIdx + 1).flatMap((c) => c.prims);
      if (before.length > 0) remainingChains.push({ prims: before, closed: false });
      if (after.length > 0) remainingChains.push({ prims: after, closed: false });
    }
  });

  const leafShape = target.leafEntry.shape;
  const totalChains = target.chainsPerSubpath.reduce((a, c) => a + c.length, 0);

  const builtPieces: DesignShape[] = [];
  remainingChains.forEach((ch, i) => {
    const pieceName =
      remainingChains.length === 1
        ? leafShape.name
        : `${leafShape.name} (${i + 1})`;
    const created = chainToDesignShape(ch, pieceName, {
      strokeWidthMm: leafShape.strokeWidthMm,
      laserLayer: target.leafEntry.effectiveLayer,
      fillColor: leafShape.fillColor,
    });
    if (created) builtPieces.push(created);
  });

  // If the trimmed leaf lived inside a top-level group, rebuild that group with the remaining pieces
  if (target.rootTopId !== target.leafId) {
    const rootGroup = allShapes.find((s) => s.id === target.rootTopId);
    if (rootGroup && rootGroup.kind === 'group') {
      const replaceLeafInGroup = (
        g: DesignShape,
        parentMat: Matrix2D
      ): DesignShape | null => {
        if (!g.children) return g;
        const gWorld = multiplyMatrices(parentMat, g.matrix);
        const invGWorld = invertOrIdentity(gWorld);
        const nextChildren: DesignShape[] = [];

        for (const ch of g.children) {
          if (ch.id === target.leafId) {
            for (const bp of builtPieces) {
              nextChildren.push({
                ...bp,
                matrix: multiplyMatrices(invGWorld, bp.matrix),
              });
            }
          } else if (ch.kind === 'group') {
            const sub = replaceLeafInGroup(ch, gWorld);
            if (sub) nextChildren.push(sub);
          } else {
            nextChildren.push(ch);
          }
        }

        if (nextChildren.length === 0) return null;
        return { ...g, children: nextChildren };
      };

      const updatedGroup = replaceLeafInGroup(rootGroup, IDENTITY_MATRIX);
      return {
        targetRootId: target.rootTopId,
        replacementShapes: updatedGroup ? [updatedGroup] : [],
        trimmedWasSinglePiece: totalChains <= 1,
      };
    }
  }

  return {
    targetRootId: target.rootTopId,
    replacementShapes: builtPieces,
    trimmedWasSinglePiece: totalChains <= 1,
  };
}

function invertOrIdentity(m: Matrix2D): Matrix2D {
  const [a, b, c, d, tx, ty] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-10) return IDENTITY_MATRIX;
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

// ---------------------------------------------------------------------------
// Split / Explode Shapes ("Dividir trazos", exact inverse of "Unir trazos")
// ---------------------------------------------------------------------------

export function canSplitShapes(
  selectedShapes: DesignShape[],
  allVisibleShapes: DesignShape[]
): boolean {
  const visibleSel = selectedShapes.filter((s) => s.visible && s.kind !== 'dots');
  if (visibleSel.length === 0) return false;

  const selectedLeaves = collectLeafEntries(visibleSel);
  if (selectedLeaves.length === 0) return false;

  if (visibleSel.some((s) => s.kind === 'tessellation' || s.kind === 'group')) {
    return true;
  }

  for (const leaf of selectedLeaves) {
    const subpaths = extractShapeWorldSubpaths(leaf.shape, leaf.worldMatrix);
    if (subpaths.length >= 2) return true;
    if (subpaths.length === 1 && subpaths[0].prims.length >= 2) return true;
  }

  // Check if any selected leaf intersects another visible leaf (selected or external)
  const allLeaves = collectLeafEntries(allVisibleShapes);
  for (const leaf of selectedLeaves) {
    const sBounds = getShapeMathBounds(
      { ...leaf.shape, matrix: leaf.worldMatrix },
      IDENTITY_MATRIX
    );
    if (!sBounds) continue;
    const sSubs = extractShapeWorldSubpaths(leaf.shape, leaf.worldMatrix);
    for (const o of allLeaves) {
      if (o.shape.id === leaf.shape.id) continue;
      const oBounds = getShapeMathBounds(
        { ...o.shape, matrix: o.worldMatrix },
        IDENTITY_MATRIX
      );
      if (
        !oBounds ||
        oBounds.maxX < sBounds.minX - 0.05 ||
        oBounds.minX > sBounds.maxX + 0.05 ||
        oBounds.maxY < sBounds.minY - 0.05 ||
        oBounds.minY > sBounds.maxY + 0.05
      ) {
        continue;
      }
      const oSubs = extractShapeWorldSubpaths(o.shape, o.worldMatrix);
      for (const sSp of sSubs) {
        for (const sPr of sSp.prims) {
          for (const oSp of oSubs) {
            for (const oPr of oSp.prims) {
              if (intersectPrimitives(sPr, oPr).length > 0) return true;
            }
          }
        }
      }
    }
  }

  return false;
}

export function splitShapesIntoParts(
  selectedShapes: DesignShape[],
  allVisibleShapes: DesignShape[]
): { consumedIds: string[]; createdShapes: DesignShape[] } | null {
  const visibleSel = selectedShapes.filter((s) => s.visible && s.kind !== 'dots');
  if (visibleSel.length === 0) return null;

  const selectedLeaves = collectLeafEntries(visibleSel);
  if (selectedLeaves.length === 0) return null;

  const selectedRootIds = new Set(visibleSel.map((s) => s.id));
  const externalLeaves = collectLeafEntries(
    allVisibleShapes.filter((s) => s.visible && !selectedRootIds.has(s.id))
  );

  const createdShapes: DesignShape[] = [];
  const consumedIds: string[] = [];

  const leafSubpaths = selectedLeaves.map((l) =>
    extractShapeWorldSubpaths(l.shape, l.worldMatrix)
  );
  const leafWorldBounds = selectedLeaves.map((l) =>
    getShapeMathBounds({ ...l.shape, matrix: l.worldMatrix }, IDENTITY_MATRIX)
  );
  const externalSubpaths = externalLeaves.map((l) =>
    extractShapeWorldSubpaths(l.shape, l.worldMatrix)
  );
  const externalWorldBounds = externalLeaves.map((l) =>
    getShapeMathBounds({ ...l.shape, matrix: l.worldMatrix }, IDENTITY_MATRIX)
  );

  for (let i = 0; i < selectedLeaves.length; i++) {
    const leaf = selectedLeaves[i];
    const targetSubs = leafSubpaths[i];
    if (targetSubs.length === 0) continue;

    const leafBounds = leafWorldBounds[i];
    const cutters: WorldSubpathPrims[] = [];

    for (let e = 0; e < externalLeaves.length; e++) {
      const eBounds = externalWorldBounds[e];
      if (
        leafBounds &&
        eBounds &&
        eBounds.maxX >= leafBounds.minX - 0.05 &&
        eBounds.minX <= leafBounds.maxX + 0.05 &&
        eBounds.maxY >= leafBounds.minY - 0.05 &&
        eBounds.minY <= leafBounds.maxY + 0.05
      ) {
        cutters.push(...externalSubpaths[e]);
      }
    }

    for (let j = 0; j < selectedLeaves.length; j++) {
      if (i === j) continue;
      const otherBounds = leafWorldBounds[j];
      if (
        leafBounds &&
        otherBounds &&
        otherBounds.maxX >= leafBounds.minX - 0.05 &&
        otherBounds.minX <= leafBounds.maxX + 0.05 &&
        otherBounds.maxY >= leafBounds.minY - 0.05 &&
        otherBounds.minY <= leafBounds.maxY + 0.05
      ) {
        cutters.push(...leafSubpaths[j]);
      }
    }

    const chainsPerSub = splitWorldSubpaths(targetSubs, cutters, {
      splitAtCorners: true,
      checkSelfIntersections: true,
    });

    let allChains = chainsPerSub.flat();

    if (allChains.length === 1 && allChains[0].prims.length >= 2) {
      allChains = allChains[0].prims.map((pr) => ({
        prims: [pr],
        closed: false,
      }));
    }

    if (allChains.length === 0) continue;

    const didSplit =
      allChains.length >= 2 ||
      leaf.rootTopId !== leaf.shape.id ||
      leaf.shape.kind === 'tessellation';

    if (!didSplit) {
      continue;
    }

    if (!consumedIds.includes(leaf.rootTopId)) {
      consumedIds.push(leaf.rootTopId);
    }

    allChains.forEach((ch, idx) => {
      const piece = chainToDesignShape(
        ch,
        allChains.length === 1 ? leaf.shape.name : `${leaf.shape.name} · ${idx + 1}`,
        {
          strokeWidthMm: leaf.shape.strokeWidthMm,
          laserLayer: leaf.effectiveLayer,
          fillColor: leaf.shape.fillColor,
        }
      );
      if (piece) createdShapes.push(piece);
    });
  }

  // Also preserve any dots inside selected groups if a group was split
  for (const s of visibleSel) {
    if (s.kind === 'group' && s.children && consumedIds.includes(s.id)) {
      const collectDots = (g: DesignShape, parentMat: Matrix2D) => {
        const wMat = multiplyMatrices(parentMat, g.matrix);
        for (const ch of g.children ?? []) {
          if (!ch.visible) continue;
          if (ch.kind === 'group') collectDots(ch, wMat);
          else if (ch.kind === 'dots') {
            createdShapes.push(
              cloneDesignShape(ch, {
                freshIds: true,
                matrix: multiplyMatrices(wMat, ch.matrix),
                derivedFrom: undefined,
              })
            );
          }
        }
      };
      collectDots(s, IDENTITY_MATRIX);
    }
  }

  if (consumedIds.length === 0 || createdShapes.length === 0) return null;
  return { consumedIds, createdShapes };
}
