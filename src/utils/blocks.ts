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
import { getShapeLocalPaths, getShapeMathBounds, isShapeFillable } from './presets';

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function cloneDesignShape(
  shape: DesignShape,
  options?: {
    freshIds?: boolean;
    name?: string;
    matrix?: Matrix2D;
    derivedFrom?: DesignShape['derivedFrom'];
    visible?: boolean;
  }
): DesignShape {
  const nextId = options?.freshIds ? uid('sh') : shape.id;
  return {
    ...shape,
    id: nextId,
    name: options?.name ?? shape.name,
    matrix: options?.matrix ? [...options.matrix] as Matrix2D : [...shape.matrix] as Matrix2D,
    visible: options?.visible ?? shape.visible,
    derivedFrom:
      options && 'derivedFrom' in options ? options.derivedFrom : shape.derivedFrom,
    localPaths: shape.localPaths ? [...shape.localPaths] : undefined,
    localDots: shape.localDots ? shape.localDots.map((p) => ({ ...p })) : undefined,
    tessellation: shape.tessellation
      ? {
          ...shape.tessellation,
          tiles: shape.tessellation.tiles.map((t) => ({
            ...t,
            points: t.points.map((p) => ({ ...p })),
          })),
          roleLaserLayers: shape.tessellation.roleLaserLayers
            ? { ...shape.tessellation.roleLaserLayers }
            : undefined,
        }
      : undefined,
    children: shape.children
      ? shape.children.map((c) =>
          cloneDesignShape(c, { freshIds: options?.freshIds })
        )
      : undefined,
  };
}

export function collectUsedShapeIds(
  shapes: DesignShape[],
  out = new Set<string>()
): Set<string> {
  for (const s of shapes) {
    out.add(s.id);
    if (s.children) {
      collectUsedShapeIds(s.children, out);
    }
  }
  return out;
}

export interface GroupLeafStats {
  leafCount: number;
  fillableCount: number;
  openPathCount: number;
  layers: Set<LaserDepthId>;
  hasTessellation: boolean;
  hasDots: boolean;
}

export function getGroupLeafStats(
  shape: DesignShape,
  inheritedLayer?: LaserDepthId
): GroupLeafStats {
  const effectiveLayer = shape.laserLayer ?? inheritedLayer ?? 'engrave-medium';

  if (shape.kind === 'group' && shape.children) {
    const acc: GroupLeafStats = {
      leafCount: 0,
      fillableCount: 0,
      openPathCount: 0,
      layers: new Set<LaserDepthId>(),
      hasTessellation: false,
      hasDots: false,
    };
    for (const child of shape.children) {
      if (!child.visible) continue;
      const sub = getGroupLeafStats(child, shape.laserLayer ?? inheritedLayer);
      acc.leafCount += sub.leafCount;
      acc.fillableCount += sub.fillableCount;
      acc.openPathCount += sub.openPathCount;
      sub.layers.forEach((l) => acc.layers.add(l));
      if (sub.hasTessellation) acc.hasTessellation = true;
      if (sub.hasDots) acc.hasDots = true;
    }
    return acc;
  }

  const layers = new Set<LaserDepthId>();
  if (shape.kind === 'tessellation' && shape.tessellation) {
    const roles = new Set(shape.tessellation.tiles.map((t) => t.role));
    if (roles.size === 0) {
      layers.add(effectiveLayer);
    } else {
      roles.forEach((r) => {
        layers.add(shape.tessellation?.roleLaserLayers?.[r] ?? effectiveLayer);
      });
    }
    return {
      leafCount: 1,
      fillableCount: 0,
      openPathCount: 0,
      layers,
      hasTessellation: true,
      hasDots: false,
    };
  }

  layers.add(effectiveLayer);
  const paths = getShapeLocalPaths(shape);
  const hasOpen =
    shape.kind !== 'dots' &&
    paths.some((d) => !d.trim().toUpperCase().endsWith('Z'));

  return {
    leafCount: 1,
    fillableCount: isShapeFillable(shape) ? 1 : 0,
    openPathCount: hasOpen ? 1 : 0,
    layers,
    hasTessellation: false,
    hasDots: shape.kind === 'dots',
  };
}

export function applyLaserLayerRecursive(
  shape: DesignShape,
  layer: LaserDepthId
): DesignShape {
  if (shape.kind === 'group' && shape.children) {
    return {
      ...shape,
      laserLayer: layer,
      children: shape.children.map((c) => applyLaserLayerRecursive(c, layer)),
    };
  }
  return {
    ...shape,
    laserLayer: layer,
  };
}

export function applyFillColorRecursive(
  shape: DesignShape,
  fillColor: string
): DesignShape {
  if (shape.kind === 'group' && shape.children) {
    const nextChildren = shape.children.map((c) =>
      applyFillColorRecursive(c, fillColor)
    );
    const hasFillable = nextChildren.some((c) => c.visible && isShapeFillable(c));
    return {
      ...shape,
      fillColor: hasFillable ? fillColor : shape.fillColor,
      children: nextChildren,
    };
  }
  if (!isShapeFillable(shape)) return shape;
  return {
    ...shape,
    fillColor,
  };
}

export function canGroupShapes(shapes: DesignShape[]): boolean {
  return shapes.filter((s) => s.visible).length >= 2;
}

export function canUngroupShapes(shapes: DesignShape[]): boolean {
  return shapes.some((s) => s.kind === 'group' && (s.children?.length ?? 0) > 0);
}

export function groupShapesIntoBlock(
  shapesToGroup: DesignShape[],
  name: string
): DesignShape {
  const pts: Point2D[] = [];
  for (const s of shapesToGroup) {
    const b = getShapeMathBounds(s);
    if (b) {
      pts.push({ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY });
    }
  }
  const combinedBounds = boundsFromPoints(pts);
  const cx = combinedBounds ? roundCoord(combinedBounds.cx) : 0;
  const cy = combinedBounds ? roundCoord(combinedBounds.cy) : 0;

  const groupMatrix = translationMatrix(cx, cy);
  const invGroupMatrix = translationMatrix(-cx, -cy);

  const children = shapesToGroup.map((s) =>
    cloneDesignShape(s, {
      matrix: multiplyMatrices(invGroupMatrix, s.matrix),
      derivedFrom: undefined,
    })
  );

  const layerSet = new Set(
    children.map((c) => c.laserLayer ?? 'engrave-medium')
  );
  const commonLayer =
    layerSet.size === 1 ? children[0]?.laserLayer : undefined;

  const fillableChildren = children.filter((c) => isShapeFillable(c));
  const fillSet = new Set(fillableChildren.map((c) => c.fillColor));
  const commonFill =
    fillableChildren.length > 0 && fillSet.size === 1
      ? fillableChildren[0].fillColor
      : 'none';

  const avgStroke =
    shapesToGroup.reduce((sum, s) => sum + s.strokeWidthMm, 0) /
    Math.max(1, shapesToGroup.length);

  return {
    id: uid('sh'),
    name,
    kind: 'group',
    children,
    matrix: groupMatrix,
    fillColor: commonFill,
    strokeWidthMm: roundCoord(avgStroke) || 0.35,
    laserLayer: commonLayer,
    visible: true,
  };
}

export function ungroupBlock(
  group: DesignShape,
  existingIds: Set<string>
): DesignShape[] {
  if (group.kind !== 'group' || !group.children) return [];
  return group.children.map((child) => {
    let nextId = child.id;
    if (existingIds.has(nextId)) {
      nextId = uid('sh');
    }
    existingIds.add(nextId);
    const cloned = cloneDesignShape(child, {
      matrix: multiplyMatrices(group.matrix, child.matrix),
      derivedFrom: undefined,
      visible: group.visible && child.visible,
    });
    cloned.id = nextId;
    if (!cloned.laserLayer && group.laserLayer) {
      cloned.laserLayer = group.laserLayer;
    }
    return cloned;
  });
}

// ---------------------------------------------------------------------------
// Path parsing, sampling, hit-testing, marquee intersection & path joining
// ---------------------------------------------------------------------------

export type PathCmd =
  | { kind: 'L'; to: Point2D }
  | { kind: 'C'; cp1: Point2D; cp2: Point2D; to: Point2D }
  | { kind: 'Q'; cp1: Point2D; to: Point2D };

export interface ParsedSubpath {
  start: Point2D;
  cmds: PathCmd[];
  closed: boolean;
}

const PATH_TOKEN_RE = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;

export function parseMathPathSubpaths(d: string): ParsedSubpath[] {
  const tokens = d.match(PATH_TOKEN_RE);
  if (!tokens) return [];

  const subpaths: ParsedSubpath[] = [];
  let current: ParsedSubpath | null = null;
  let curr: Point2D = { x: 0, y: 0 };
  let start: Point2D = { x: 0, y: 0 };
  let i = 0;
  let cmd = '';

  const isNum = (tok: string | undefined): boolean =>
    tok !== undefined && !/^[a-zA-Z]$/.test(tok);

  const readNum = (): number => parseFloat(tokens[i++]);

  const finishCurrent = () => {
    if (current && (current.cmds.length > 0 || current.closed)) {
      subpaths.push(current);
    }
    current = null;
  };

  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[a-zA-Z]$/.test(tok)) {
      cmd = tok;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        if (current) {
          current.closed = true;
          finishCurrent();
          curr = { ...start };
        }
        continue;
      }
    }

    if (cmd === 'M' || cmd === 'm') {
      if (!isNum(tokens[i]) || !isNum(tokens[i + 1])) {
        i++;
        continue;
      }
      finishCurrent();
      const x = readNum();
      const y = readNum();
      const pt =
        cmd === 'm' ? { x: curr.x + x, y: curr.y + y } : { x, y };
      curr = pt;
      start = { ...pt };
      current = { start: { ...pt }, cmds: [], closed: false };
      cmd = cmd === 'm' ? 'l' : 'L';
    } else if (cmd === 'L' || cmd === 'l') {
      if (!isNum(tokens[i]) || !isNum(tokens[i + 1])) {
        i++;
        continue;
      }
      const x = readNum();
      const y = readNum();
      const pt =
        cmd === 'l' ? { x: curr.x + x, y: curr.y + y } : { x, y };
      if (!current) {
        current = { start: { ...curr }, cmds: [], closed: false };
        start = { ...curr };
      }
      current.cmds.push({ kind: 'L', to: pt });
      curr = pt;
    } else if (cmd === 'H' || cmd === 'h') {
      if (!isNum(tokens[i])) {
        i++;
        continue;
      }
      const x = readNum();
      const pt = { x: cmd === 'h' ? curr.x + x : x, y: curr.y };
      if (!current) {
        current = { start: { ...curr }, cmds: [], closed: false };
        start = { ...curr };
      }
      current.cmds.push({ kind: 'L', to: pt });
      curr = pt;
    } else if (cmd === 'V' || cmd === 'v') {
      if (!isNum(tokens[i])) {
        i++;
        continue;
      }
      const y = readNum();
      const pt = { x: curr.x, y: cmd === 'v' ? curr.y + y : y };
      if (!current) {
        current = { start: { ...curr }, cmds: [], closed: false };
        start = { ...curr };
      }
      current.cmds.push({ kind: 'L', to: pt });
      curr = pt;
    } else if (cmd === 'C' || cmd === 'c') {
      if (
        !isNum(tokens[i]) ||
        !isNum(tokens[i + 1]) ||
        !isNum(tokens[i + 2]) ||
        !isNum(tokens[i + 3]) ||
        !isNum(tokens[i + 4]) ||
        !isNum(tokens[i + 5])
      ) {
        i++;
        continue;
      }
      const x1 = readNum();
      const y1 = readNum();
      const x2 = readNum();
      const y2 = readNum();
      const x = readNum();
      const y = readNum();
      const rel = cmd === 'c';
      const cp1 = rel ? { x: curr.x + x1, y: curr.y + y1 } : { x: x1, y: y1 };
      const cp2 = rel ? { x: curr.x + x2, y: curr.y + y2 } : { x: x2, y: y2 };
      const to = rel ? { x: curr.x + x, y: curr.y + y } : { x, y };
      if (!current) {
        current = { start: { ...curr }, cmds: [], closed: false };
        start = { ...curr };
      }
      current.cmds.push({ kind: 'C', cp1, cp2, to });
      curr = to;
    } else if (cmd === 'Q' || cmd === 'q') {
      if (
        !isNum(tokens[i]) ||
        !isNum(tokens[i + 1]) ||
        !isNum(tokens[i + 2]) ||
        !isNum(tokens[i + 3])
      ) {
        i++;
        continue;
      }
      const x1 = readNum();
      const y1 = readNum();
      const x = readNum();
      const y = readNum();
      const rel = cmd === 'q';
      const cp1 = rel ? { x: curr.x + x1, y: curr.y + y1 } : { x: x1, y: y1 };
      const to = rel ? { x: curr.x + x, y: curr.y + y } : { x, y };
      if (!current) {
        current = { start: { ...curr }, cmds: [], closed: false };
        start = { ...curr };
      }
      current.cmds.push({ kind: 'Q', cp1, to });
      curr = to;
    } else {
      i++;
    }
  }

  finishCurrent();
  return subpaths;
}

export function serializeSubpath(sp: ParsedSubpath): string {
  const cmds = [...sp.cmds];
  if (sp.closed && cmds.length >= 2) {
    const last = cmds[cmds.length - 1];
    if (
      last.kind === 'L' &&
      Math.hypot(last.to.x - sp.start.x, last.to.y - sp.start.y) < 1e-4
    ) {
      cmds.pop();
    }
  }
  const parts: string[] = [`M ${roundCoord(sp.start.x)} ${roundCoord(sp.start.y)}`];
  for (const c of cmds) {
    if (c.kind === 'L') {
      parts.push(`L ${roundCoord(c.to.x)} ${roundCoord(c.to.y)}`);
    } else if (c.kind === 'C') {
      parts.push(
        `C ${roundCoord(c.cp1.x)} ${roundCoord(c.cp1.y)} ${roundCoord(c.cp2.x)} ${roundCoord(c.cp2.y)} ${roundCoord(c.to.x)} ${roundCoord(c.to.y)}`
      );
    } else {
      parts.push(
        `Q ${roundCoord(c.cp1.x)} ${roundCoord(c.cp1.y)} ${roundCoord(c.to.x)} ${roundCoord(c.to.y)}`
      );
    }
  }
  if (sp.closed) {
    parts.push('Z');
  }
  return parts.join(' ');
}

function subpathEndPoint(sp: ParsedSubpath): Point2D {
  if (sp.cmds.length === 0) return sp.start;
  return sp.cmds[sp.cmds.length - 1].to;
}

function reverseSubpath(sp: ParsedSubpath): ParsedSubpath {
  if (sp.cmds.length === 0) {
    return { start: { ...sp.start }, cmds: [], closed: sp.closed };
  }
  const pts: Point2D[] = [sp.start, ...sp.cmds.map((c) => c.to)];
  const revCmds: PathCmd[] = [];
  for (let i = sp.cmds.length - 1; i >= 0; i--) {
    const orig = sp.cmds[i];
    const prevPt = pts[i];
    if (orig.kind === 'L') {
      revCmds.push({ kind: 'L', to: { ...prevPt } });
    } else if (orig.kind === 'C') {
      revCmds.push({
        kind: 'C',
        cp1: { ...orig.cp2 },
        cp2: { ...orig.cp1 },
        to: { ...prevPt },
      });
    } else {
      revCmds.push({
        kind: 'Q',
        cp1: { ...orig.cp1 },
        to: { ...prevPt },
      });
    }
  }
  return {
    start: { ...pts[pts.length - 1] },
    cmds: revCmds,
    closed: sp.closed,
  };
}

function snapSubpathEndpoint(
  sp: ParsedSubpath,
  which: 'start' | 'end',
  target: Point2D
): void {
  if (which === 'start') {
    sp.start = { ...target };
  } else if (sp.cmds.length > 0) {
    sp.cmds[sp.cmds.length - 1] = {
      ...sp.cmds[sp.cmds.length - 1],
      to: { ...target },
    };
  } else {
    sp.start = { ...target };
  }
}

export function sampleSubpathPoints(
  sp: ParsedSubpath,
  curveSteps = 14
): { pts: Point2D[]; closed: boolean } {
  const pts: Point2D[] = [{ ...sp.start }];
  let curr = sp.start;

  for (const c of sp.cmds) {
    if (c.kind === 'L') {
      pts.push({ ...c.to });
      curr = c.to;
    } else if (c.kind === 'C') {
      for (let s = 1; s <= curveSteps; s++) {
        const t = s / curveSteps;
        const mt = 1 - t;
        pts.push({
          x:
            mt * mt * mt * curr.x +
            3 * mt * mt * t * c.cp1.x +
            3 * mt * t * t * c.cp2.x +
            t * t * t * c.to.x,
          y:
            mt * mt * mt * curr.y +
            3 * mt * mt * t * c.cp1.y +
            3 * mt * t * t * c.cp2.y +
            t * t * t * c.to.y,
        });
      }
      curr = c.to;
    } else {
      const qSteps = Math.max(8, Math.round(curveSteps * 0.75));
      for (let s = 1; s <= qSteps; s++) {
        const t = s / qSteps;
        const mt = 1 - t;
        pts.push({
          x: mt * mt * curr.x + 2 * mt * t * c.cp1.x + t * t * c.to.x,
          y: mt * mt * curr.y + 2 * mt * t * c.cp1.y + t * t * c.to.y,
        });
      }
      curr = c.to;
    }
  }

  return { pts, closed: sp.closed };
}

function pointInPolygon(p: Point2D, poly: Point2D[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonSignedArea(poly: Point2D[]): number {
  if (poly.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

export interface MathRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function pointInRect(p: Point2D, r: MathRect, pad = 0): boolean {
  return (
    p.x >= r.minX - pad &&
    p.x <= r.maxX + pad &&
    p.y >= r.minY - pad &&
    p.y <= r.maxY + pad
  );
}

function segmentIntersectsRect(a: Point2D, b: Point2D, r: MathRect): boolean {
  if (
    Math.max(a.x, b.x) < r.minX ||
    Math.min(a.x, b.x) > r.maxX ||
    Math.max(a.y, b.y) < r.minY ||
    Math.min(a.y, b.y) > r.maxY
  ) {
    return false;
  }
  if (pointInRect(a, r) || pointInRect(b, r)) return true;

  // Liang-Barsky clipping
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, a.x - r.minX],
    [dx, r.maxX - a.x],
    [-dy, a.y - r.minY],
    [dy, r.maxY - a.y],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

export type ShapeHitKind = 'stroke' | 'fill' | null;

export function hitTestShape(
  shape: DesignShape,
  p: Point2D,
  tolCm: number,
  parentMatrix: Matrix2D = IDENTITY_MATRIX
): ShapeHitKind {
  if (!shape.visible) return null;
  const bounds = getShapeMathBounds(shape, parentMatrix);
  if (
    !bounds ||
    p.x < bounds.minX - tolCm ||
    p.x > bounds.maxX + tolCm ||
    p.y < bounds.minY - tolCm ||
    p.y > bounds.maxY + tolCm
  ) {
    return null;
  }

  const worldMatrix = multiplyMatrices(parentMatrix, shape.matrix);

  if (shape.kind === 'group' && shape.children) {
    let best: ShapeHitKind = null;
    for (let i = shape.children.length - 1; i >= 0; i--) {
      const childHit = hitTestShape(shape.children[i], p, tolCm, worldMatrix);
      if (childHit === 'stroke') return 'stroke';
      if (childHit === 'fill') best = 'fill';
    }
    return best;
  }

  if (shape.kind === 'dots' && shape.localDots) {
    const sx = Math.hypot(worldMatrix[0], worldMatrix[1]);
    const sy = Math.hypot(worldMatrix[2], worldMatrix[3]);
    const r = (shape.dotRadiusCm ?? 0.08) * ((sx + sy) / 2);
    for (const dot of shape.localDots) {
      const wd = applyMatrix(worldMatrix, dot);
      if (Math.hypot(p.x - wd.x, p.y - wd.y) <= r + tolCm) {
        return 'stroke';
      }
    }
    return null;
  }

  if (shape.kind === 'tessellation' && shape.tessellation) {
    let insideTile = false;
    for (const tile of shape.tessellation.tiles) {
      const wPts = tile.points.map((pt) => applyMatrix(worldMatrix, pt));
      for (let i = 0; i < wPts.length; i++) {
        if (
          distancePointToSegment(p, wPts[i], wPts[(i + 1) % wPts.length]) <=
          tolCm
        ) {
          return 'stroke';
        }
      }
      if (!insideTile && pointInPolygon(p, wPts)) {
        insideTile = true;
      }
    }
    if (shape.tessellation.includeBorder) {
      const hw = shape.tessellation.widthCm / 2;
      const hh = shape.tessellation.heightCm / 2;
      const bPts = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ].map((pt) => applyMatrix(worldMatrix, pt));
      for (let i = 0; i < 4; i++) {
        if (distancePointToSegment(p, bPts[i], bPts[(i + 1) % 4]) <= tolCm) {
          return 'stroke';
        }
      }
    }
    return insideTile ? 'fill' : null;
  }

  const localPaths = getShapeLocalPaths(shape);
  let insideClosed = false;
  for (const d of localPaths) {
    const { svgD } = transformMathPath(d, worldMatrix);
    if (!svgD) continue;
    const subpaths = parseMathPathSubpaths(svgD);
    for (const sp of subpaths) {
      const { pts, closed } = sampleSubpathPoints(sp);
      for (let i = 0; i < pts.length - 1; i++) {
        if (distancePointToSegment(p, pts[i], pts[i + 1]) <= tolCm) {
          return 'stroke';
        }
      }
      if (closed && pts.length >= 2) {
        if (distancePointToSegment(p, pts[pts.length - 1], pts[0]) <= tolCm) {
          return 'stroke';
        }
        if (!insideClosed && pointInPolygon(p, pts)) {
          insideClosed = true;
        }
      }
    }
  }

  return insideClosed ? 'fill' : null;
}

export function shapeIntersectsRect(
  shape: DesignShape,
  rect: MathRect,
  options?: { matchFilledInterior?: boolean },
  parentMatrix: Matrix2D = IDENTITY_MATRIX
): boolean {
  if (!shape.visible) return false;
  const bounds = getShapeMathBounds(shape, parentMatrix);
  if (
    !bounds ||
    bounds.maxX < rect.minX ||
    bounds.minX > rect.maxX ||
    bounds.maxY < rect.minY ||
    bounds.minY > rect.maxY
  ) {
    return false;
  }

  const worldMatrix = multiplyMatrices(parentMatrix, shape.matrix);

  if (shape.kind === 'group' && shape.children) {
    return shape.children.some(
      (c) => c.visible && shapeIntersectsRect(c, rect, options, worldMatrix)
    );
  }

  if (shape.kind === 'dots' && shape.localDots) {
    const sx = Math.hypot(worldMatrix[0], worldMatrix[1]);
    const sy = Math.hypot(worldMatrix[2], worldMatrix[3]);
    const r = (shape.dotRadiusCm ?? 0.08) * ((sx + sy) / 2);
    return shape.localDots.some((dot) =>
      pointInRect(applyMatrix(worldMatrix, dot), rect, r)
    );
  }

  if (shape.kind === 'tessellation' && shape.tessellation) {
    const rectCenter = {
      x: (rect.minX + rect.maxX) / 2,
      y: (rect.minY + rect.maxY) / 2,
    };
    for (const tile of shape.tessellation.tiles) {
      const wPts = tile.points.map((pt) => applyMatrix(worldMatrix, pt));
      for (let i = 0; i < wPts.length; i++) {
        if (segmentIntersectsRect(wPts[i], wPts[(i + 1) % wPts.length], rect)) {
          return true;
        }
      }
      if (options?.matchFilledInterior && pointInPolygon(rectCenter, wPts)) {
        return true;
      }
    }
    if (shape.tessellation.includeBorder) {
      const hw = shape.tessellation.widthCm / 2;
      const hh = shape.tessellation.heightCm / 2;
      const bPts = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ].map((pt) => applyMatrix(worldMatrix, pt));
      for (let i = 0; i < 4; i++) {
        if (segmentIntersectsRect(bPts[i], bPts[(i + 1) % 4], rect)) {
          return true;
        }
      }
    }
    return false;
  }

  const rectCenter = {
    x: (rect.minX + rect.maxX) / 2,
    y: (rect.minY + rect.maxY) / 2,
  };
  const localPaths = getShapeLocalPaths(shape);
  for (const d of localPaths) {
    const { svgD } = transformMathPath(d, worldMatrix);
    if (!svgD) continue;
    const subpaths = parseMathPathSubpaths(svgD);
    for (const sp of subpaths) {
      const { pts, closed } = sampleSubpathPoints(sp);
      for (let i = 0; i < pts.length - 1; i++) {
        if (segmentIntersectsRect(pts[i], pts[i + 1], rect)) {
          return true;
        }
      }
      if (closed && pts.length >= 2) {
        if (segmentIntersectsRect(pts[pts.length - 1], pts[0], rect)) {
          return true;
        }
        if (
          options?.matchFilledInterior &&
          isShapeFillable(shape) &&
          pointInPolygon(rectCenter, pts)
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Path Joining / Welding & Contour Closing
// ---------------------------------------------------------------------------

const PATH_JOINABLE_KINDS = new Set<ShapeKind>([
  'segment',
  'curve',
  'spline',
  'freehand',
  'circle',
  'ellipse',
  'polygon',
  'preset',
  'text',
  'path',
]);

function isPathJoinableKind(kind: ShapeKind): boolean {
  return PATH_JOINABLE_KINDS.has(kind);
}

export function isShapeJoinableInput(shape: DesignShape): boolean {
  if (!shape.visible) return false;
  if (isPathJoinableKind(shape.kind)) return true;
  if (shape.kind === 'group' && shape.children) {
    return shape.children.some((c) => isShapeJoinableInput(c));
  }
  return false;
}

interface LeafShapeEntry {
  shape: DesignShape;
  worldMatrix: Matrix2D;
}

function flattenLeavesInWorld(
  shapes: DesignShape[],
  parentMatrix: Matrix2D = IDENTITY_MATRIX,
  inheritedLayer?: LaserDepthId,
  insideGroup = false
): { joinable: LeafShapeEntry[]; nonJoinableFromGroups: DesignShape[] } {
  const joinable: LeafShapeEntry[] = [];
  const nonJoinableFromGroups: DesignShape[] = [];

  for (const s of shapes) {
    if (!s.visible) continue;
    const worldMatrix = multiplyMatrices(parentMatrix, s.matrix);
    const effectiveLayer = s.laserLayer ?? inheritedLayer;

    if (s.kind === 'group' && s.children) {
      const sub = flattenLeavesInWorld(s.children, worldMatrix, effectiveLayer, true);
      joinable.push(...sub.joinable);
      nonJoinableFromGroups.push(...sub.nonJoinableFromGroups);
    } else if (isPathJoinableKind(s.kind)) {
      joinable.push({
        shape: effectiveLayer && !s.laserLayer ? { ...s, laserLayer: effectiveLayer } : s,
        worldMatrix,
      });
    } else if (insideGroup) {
      const cloned = cloneDesignShape(s, {
        matrix: worldMatrix,
        derivedFrom: undefined,
      });
      if (effectiveLayer && !cloned.laserLayer) {
        cloned.laserLayer = effectiveLayer;
      }
      nonJoinableFromGroups.push(cloned);
    }
  }

  return { joinable, nonJoinableFromGroups };
}

export function canJoinShapes(shapes: DesignShape[]): boolean {
  const { joinable } = flattenLeavesInWorld(shapes);
  return joinable.length >= 2;
}

export function canToggleCloseShape(shape: DesignShape | null | undefined): boolean {
  if (!shape) return false;
  if (
    shape.kind !== 'freehand' &&
    shape.kind !== 'path' &&
    shape.kind !== 'curve' &&
    shape.kind !== 'spline'
  ) {
    return false;
  }
  const paths = getShapeLocalPaths(shape);
  if (paths.length === 0) return false;
  for (const d of paths) {
    const subpaths = parseMathPathSubpaths(d);
    for (const sp of subpaths) {
      if (sp.closed) return true;
      const hasCurved = sp.cmds.some((c) => c.kind !== 'L');
      if (sp.cmds.length >= 2 || hasCurved) return true;
    }
  }
  return false;
}

export function isShapeClosed(shape: DesignShape | null | undefined): boolean {
  if (!shape) return false;
  const paths = getShapeLocalPaths(shape);
  return (
    paths.length > 0 &&
    paths.every((d) => d.trim().toUpperCase().endsWith('Z'))
  );
}

export function toggleShapeClosed(
  shape: DesignShape,
  toleranceCm = 0.25
): DesignShape | null {
  if (!canToggleCloseShape(shape)) return null;
  const paths = getShapeLocalPaths(shape);
  const allClosed = isShapeClosed(shape);
  const nextPaths: string[] = [];

  for (const d of paths) {
    const subpaths = parseMathPathSubpaths(d);
    for (const sp of subpaths) {
      const hasCurved = sp.cmds.some((c) => c.kind !== 'L');
      if (allClosed) {
        nextPaths.push(serializeSubpath({ ...sp, closed: false }));
      } else if (sp.closed) {
        nextPaths.push(serializeSubpath(sp));
      } else if (sp.cmds.length >= 2 || hasCurved) {
        const endPt = subpathEndPoint(sp);
        if (Math.hypot(endPt.x - sp.start.x, endPt.y - sp.start.y) <= toleranceCm) {
          snapSubpathEndpoint(sp, 'end', sp.start);
        }
        nextPaths.push(serializeSubpath({ ...sp, closed: true }));
      } else {
        nextPaths.push(serializeSubpath(sp));
      }
    }
  }

  return {
    ...shape,
    localPaths: nextPaths,
    fillColor: allClosed ? 'none' : shape.fillColor,
  };
}

export interface JoinShapesResult {
  unifiedShape: DesignShape;
  untouchedShapes: DesignShape[];
  weldedConnections: number;
  closedCount: number;
  subpathCount: number;
}

export function joinShapesIntoUnifiedPath(
  shapes: DesignShape[],
  name: string,
  options?: { toleranceCm?: number; forceClose?: boolean }
): JoinShapesResult | null {
  const toleranceCm = options?.toleranceCm ?? 0.25;
  const forceClose = options?.forceClose ?? false;

  const { joinable, nonJoinableFromGroups } = flattenLeavesInWorld(shapes);
  if (joinable.length < 2) return null;

  const closedSubpaths: ParsedSubpath[] = [];
  const openChains: ParsedSubpath[] = [];

  for (const entry of joinable) {
    const paths = getShapeLocalPaths(entry.shape);
    for (const d of paths) {
      const { svgD } = transformMathPath(d, entry.worldMatrix);
      if (!svgD) continue;
      const parsed = parseMathPathSubpaths(svgD);
      for (const sp of parsed) {
        if (sp.cmds.length === 0) continue;
        if (sp.closed) {
          closedSubpaths.push(sp);
        } else {
          openChains.push(sp);
        }
      }
    }
  }

  if (closedSubpaths.length === 0 && openChains.length === 0) return null;

  let weldedConnections = 0;

  // Greedily merge closest open chain endpoints within toleranceCm
  while (openChains.length >= 2) {
    let bestDist = toleranceCm;
    let bestI = -1;
    let bestJ = -1;
    let bestEndI: 'start' | 'end' = 'end';
    let bestEndJ: 'start' | 'end' = 'start';

    for (let i = 0; i < openChains.length; i++) {
      const si = openChains[i].start;
      const ei = subpathEndPoint(openChains[i]);
      for (let j = i + 1; j < openChains.length; j++) {
        const sj = openChains[j].start;
        const ej = subpathEndPoint(openChains[j]);

        const candidates: ['start' | 'end', 'start' | 'end', number][] = [
          ['end', 'start', Math.hypot(ei.x - sj.x, ei.y - sj.y)],
          ['end', 'end', Math.hypot(ei.x - ej.x, ei.y - ej.y)],
          ['start', 'end', Math.hypot(si.x - ej.x, si.y - ej.y)],
          ['start', 'start', Math.hypot(si.x - sj.x, si.y - sj.y)],
        ];

        for (const [eI, eJ, dist] of candidates) {
          if (dist <= bestDist) {
            bestDist = dist;
            bestI = i;
            bestJ = j;
            bestEndI = eI;
            bestEndJ = eJ;
          }
        }
      }
    }

    if (bestI === -1 || bestJ === -1) break;

    const chainA = openChains[bestI];
    const chainB = openChains[bestJ];

    let first: ParsedSubpath;
    let second: ParsedSubpath;
    if (bestEndI === 'end' && bestEndJ === 'start') {
      first = chainA;
      second = chainB;
    } else if (bestEndI === 'end' && bestEndJ === 'end') {
      first = chainA;
      second = reverseSubpath(chainB);
    } else if (bestEndI === 'start' && bestEndJ === 'end') {
      first = chainB;
      second = chainA;
    } else {
      first = reverseSubpath(chainB);
      second = chainA;
    }

    const pFirst = subpathEndPoint(first);
    const pSecond = second.start;
    const stitchPt =
      bestDist < 1e-3
        ? pFirst
        : {
            x: roundCoord((pFirst.x + pSecond.x) / 2),
            y: roundCoord((pFirst.y + pSecond.y) / 2),
          };

    snapSubpathEndpoint(first, 'end', stitchPt);
    snapSubpathEndpoint(second, 'start', stitchPt);

    const merged: ParsedSubpath = {
      start: first.start,
      cmds: [...first.cmds, ...second.cmds],
      closed: false,
    };

    openChains.splice(bestJ, 1);
    openChains[bestI] = merged;
    weldedConnections += 1;
  }

  // Check each remaining open chain for loop closure
  for (const chain of openChains) {
    const startPt = chain.start;
    const endPt = subpathEndPoint(chain);
    const gap = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
    const hasCurved = chain.cmds.some((c) => c.kind !== 'L');
    const canCloseChain = hasCurved ? chain.cmds.length >= 1 : chain.cmds.length >= 3;

    if (gap <= toleranceCm && canCloseChain) {
      const { pts } = sampleSubpathPoints(chain, 6);
      if (polygonSignedArea(pts) > 1e-4) {
        const stitchPt =
          gap < 1e-3
            ? startPt
            : {
                x: roundCoord((startPt.x + endPt.x) / 2),
                y: roundCoord((startPt.y + endPt.y) / 2),
              };
        snapSubpathEndpoint(chain, 'start', stitchPt);
        snapSubpathEndpoint(chain, 'end', stitchPt);
        chain.closed = true;
      }
    } else if (forceClose && (chain.cmds.length >= 2 || hasCurved)) {
      chain.closed = true;
    }
  }

  const finalSubpaths = [...closedSubpaths, ...openChains];
  if (finalSubpaths.length === 0) return null;

  const allPts: Point2D[] = [];
  for (const sp of finalSubpaths) {
    allPts.push(...sampleSubpathPoints(sp, 8).pts);
  }
  const bounds = boundsFromPoints(allPts);
  const cx = bounds ? roundCoord(bounds.cx) : 0;
  const cy = bounds ? roundCoord(bounds.cy) : 0;

  const invTranslate = translationMatrix(-cx, -cy);
  const localPaths = finalSubpaths
    .map((sp) => {
      const worldD = serializeSubpath(sp);
      return transformMathPath(worldD, invTranslate).svgD;
    })
    .filter(Boolean);

  if (localPaths.length === 0) return null;

  const closedCount = finalSubpaths.filter((sp) => sp.closed).length;
  const firstFill = joinable.find(
    (e) => e.shape.fillColor && e.shape.fillColor !== 'none'
  )?.shape.fillColor;
  const layerSet = new Set(
    joinable.map((e) => e.shape.laserLayer ?? 'engrave-medium')
  );
  const commonLayer =
    layerSet.size === 1 ? joinable[0]?.shape.laserLayer : undefined;
  const avgStroke =
    joinable.reduce((sum, e) => sum + e.shape.strokeWidthMm, 0) /
    joinable.length;

  const unifiedShape: DesignShape = {
    id: uid('sh'),
    name,
    kind: 'path',
    localPaths,
    matrix: translationMatrix(cx, cy),
    fillColor: closedCount > 0 && firstFill ? firstFill : 'none',
    strokeWidthMm: roundCoord(avgStroke) || 0.35,
    laserLayer: commonLayer,
    visible: true,
  };

  return {
    unifiedShape,
    untouchedShapes: nonJoinableFromGroups,
    weldedConnections,
    closedCount,
    subpathCount: localPaths.length,
  };
}
