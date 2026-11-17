import {
  BoardConfig,
  DesignShape,
  LaserDepthId,
  Matrix2D,
  Point2D,
} from '../types/geometry';
import {
  applyMatrix,
  IDENTITY_MATRIX,
  multiplyMatrices,
  roundCoord,
  transformMathPath,
} from './math2d';
import { getShapeLocalPaths } from './presets';
import {
  LASER_LAYERS,
  LASER_LAYER_MAP,
} from './laserLayers';
import { buildTessellationExportByLayer } from './tessellations';

interface DxfPolylineEntity {
  layer: string;
  color: number;
  points: Point2D[];
  closed: boolean;
}

interface DxfCircleEntity {
  layer: string;
  color: number;
  cx: number;
  cy: number;
  r: number;
}

const TOKEN_RE = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;

function mathToDxfMm(p: Point2D, boardWidthCm: number, boardHeightCm: number): Point2D {
  return {
    x: roundCoord((boardWidthCm / 2 + p.x) * 10),
    y: roundCoord((boardHeightCm / 2 + p.y) * 10),
  };
}

/**
 * Flattens an SVG path string (already transformed in math cm) into polylines in DXF mm coords.
 */
function flattenMathPathToDxfPolylines(
  d: string,
  matrix: Matrix2D,
  boardWidthCm: number,
  boardHeightCm: number,
  layer: string,
  color: number
): DxfPolylineEntity[] {
  const { svgD: mathTransformedD } = transformMathPath(d, matrix);
  const tokens = mathTransformedD.match(TOKEN_RE);
  if (!tokens) return [];

  const polylines: DxfPolylineEntity[] = [];
  let currentPts: Point2D[] = [];
  let curr: Point2D = { x: 0, y: 0 };
  let startPt: Point2D = { x: 0, y: 0 };

  const pushPt = (mathPt: Point2D) => {
    const mm = mathToDxfMm(mathPt, boardWidthCm, boardHeightCm);
    const last = currentPts[currentPts.length - 1];
    if (!last || Math.hypot(mm.x - last.x, mm.y - last.y) > 0.01) {
      currentPts.push(mm);
    }
  };

  const flush = (closed: boolean) => {
    if (currentPts.length >= 2) {
      polylines.push({
        layer,
        color,
        points: currentPts,
        closed,
      });
    }
    currentPts = [];
  };

  let i = 0;
  let cmd = '';
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[a-zA-Z]$/.test(tok)) {
      cmd = tok.toUpperCase();
      i++;
      if (cmd === 'Z') {
        flush(true);
        curr = startPt;
        continue;
      }
    }

    if (cmd === 'M') {
      flush(false);
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        curr = { x, y };
        startPt = curr;
        pushPt(curr);
        cmd = 'L';
      }
    } else if (cmd === 'L') {
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        curr = { x, y };
        pushPt(curr);
      }
    } else if (cmd === 'C') {
      const x1 = parseFloat(tokens[i++]);
      const y1 = parseFloat(tokens[i++]);
      const x2 = parseFloat(tokens[i++]);
      const y2 = parseFloat(tokens[i++]);
      const x3 = parseFloat(tokens[i++]);
      const y3 = parseFloat(tokens[i++]);
      if (![x1, y1, x2, y2, x3, y3].some(Number.isNaN)) {
        const steps = 20;
        const p0 = curr;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const x =
            mt * mt * mt * p0.x +
            3 * mt * mt * t * x1 +
            3 * mt * t * t * x2 +
            t * t * t * x3;
          const y =
            mt * mt * mt * p0.y +
            3 * mt * mt * t * y1 +
            3 * mt * t * t * y2 +
            t * t * t * y3;
          pushPt({ x, y });
        }
        curr = { x: x3, y: y3 };
      }
    } else if (cmd === 'Q') {
      const x1 = parseFloat(tokens[i++]);
      const y1 = parseFloat(tokens[i++]);
      const x2 = parseFloat(tokens[i++]);
      const y2 = parseFloat(tokens[i++]);
      if (![x1, y1, x2, y2].some(Number.isNaN)) {
        const steps = 16;
        const p0 = curr;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const x = mt * mt * p0.x + 2 * mt * t * x1 + t * t * x2;
          const y = mt * mt * p0.y + 2 * mt * t * y1 + t * t * y2;
          pushPt({ x, y });
        }
        curr = { x: x2, y: y2 };
      }
    } else {
      i++;
    }
  }
  flush(false);
  return polylines;
}

/**
 * Generates a standard ASCII DXF (AC1009 / R12) file in millimeters,
 * compatible with CorelDRAW (standard), Creality Falcon Design Space, and LightBurn.
 */
export function buildLaserDxfString(board: BoardConfig, shapes: DesignShape[]): string {
  const polylines: DxfPolylineEntity[] = [];
  const circles: DxfCircleEntity[] = [];
  const usedLayers = new Set<LaserDepthId>();

  const appendShapeToDxf = (
    shape: DesignShape,
    parentMatrix: Matrix2D,
    inheritedLayer?: LaserDepthId
  ) => {
    if (!shape.visible) return;
    const worldMatrix = multiplyMatrices(parentMatrix, shape.matrix);
    const effectiveLayer = shape.laserLayer ?? inheritedLayer;

    if (shape.kind === 'group' && shape.children) {
      for (const child of shape.children) {
        appendShapeToDxf(child, worldMatrix, effectiveLayer);
      }
      return;
    }

    const layerId = effectiveLayer ?? 'engrave-medium';
    const layerDef = LASER_LAYER_MAP[layerId];

    if (shape.kind === 'dots' && shape.localDots) {
      usedLayers.add(layerId);
      const rMm = roundCoord((shape.dotRadiusCm ?? 0.08) * 10);
      const sx = Math.hypot(worldMatrix[0], worldMatrix[1]);
      const sy = Math.hypot(worldMatrix[2], worldMatrix[3]);
      const scaledR = roundCoord(Math.max(0.25, rMm * ((sx + sy) / 2)));
      for (const dot of shape.localDots) {
        const mp = applyMatrix(worldMatrix, dot);
        const dp = mathToDxfMm(mp, board.widthCm, board.heightCm);
        circles.push({
          layer: layerDef.dxfLayerName,
          color: layerDef.dxfAciColor,
          cx: dp.x,
          cy: dp.y,
          r: scaledR,
        });
      }
      return;
    }

    if (shape.kind === 'tessellation' && shape.tessellation) {
      const grouped = buildTessellationExportByLayer(
        shape.tessellation,
        worldMatrix,
        board.widthCm,
        board.heightCm,
        layerId
      );
      grouped.forEach((bucket, bucketLayerId) => {
        const bDef = LASER_LAYER_MAP[bucketLayerId];
        usedLayers.add(bucketLayerId);
        for (const [p1, p2] of bucket.lineSegments) {
          polylines.push({
            layer: bDef.dxfLayerName,
            color: bDef.dxfAciColor,
            points: [
              mathToDxfMm(p1, board.widthCm, board.heightCm),
              mathToDxfMm(p2, board.widthCm, board.heightCm),
            ],
            closed: false,
          });
        }
        for (const poly of bucket.fillPolygons) {
          polylines.push({
            layer: bDef.dxfLayerName,
            color: bDef.dxfAciColor,
            points: poly.map((p) => mathToDxfMm(p, board.widthCm, board.heightCm)),
            closed: true,
          });
        }
      });
      return;
    }

    usedLayers.add(layerId);
    const localPaths = getShapeLocalPaths(shape);
    for (const d of localPaths) {
      polylines.push(
        ...flattenMathPathToDxfPolylines(
          d,
          worldMatrix,
          board.widthCm,
          board.heightCm,
          layerDef.dxfLayerName,
          layerDef.dxfAciColor
        )
      );
    }
  };

  for (const shape of shapes) {
    appendShapeToDxf(shape, IDENTITY_MATRIX);
  }

  // Board outer cut border (always on layer 6_CORTE_BORDE, red)
  const borderDef = LASER_LAYER_MAP['cut-border'];
  usedLayers.add('cut-border');
  const wMm = roundCoord(board.widthCm * 10);
  const hMm = roundCoord(board.heightCm * 10);

  if (board.borderShape === 'circle') {
    circles.push({
      layer: borderDef.dxfLayerName,
      color: borderDef.dxfAciColor,
      cx: roundCoord(wMm / 2),
      cy: roundCoord(hMm / 2),
      r: roundCoord(Math.min(wMm, hMm) / 2),
    });
  } else if (board.borderShape === 'rounded') {
    const r = Math.min(board.cornerRadiusCm * 10, wMm / 2, hMm / 2);
    const pts: Point2D[] = [];
    const arcPts = (cx: number, cy: number, startDeg: number, endDeg: number) => {
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const a = ((startDeg + ((endDeg - startDeg) * i) / steps) * Math.PI) / 180;
        pts.push({
          x: roundCoord(cx + r * Math.cos(a)),
          y: roundCoord(cy + r * Math.sin(a)),
        });
      }
    };
    arcPts(wMm - r, hMm - r, 0, 90);
    arcPts(r, hMm - r, 90, 180);
    arcPts(r, r, 180, 270);
    arcPts(wMm - r, r, 270, 360);
    polylines.push({
      layer: borderDef.dxfLayerName,
      color: borderDef.dxfAciColor,
      points: pts,
      closed: true,
    });
  } else {
    polylines.push({
      layer: borderDef.dxfLayerName,
      color: borderDef.dxfAciColor,
      points: [
        { x: 0, y: 0 },
        { x: wMm, y: 0 },
        { x: wMm, y: hMm },
        { x: 0, y: hMm },
      ],
      closed: true,
    });
  }

  if (board.hangingHole) {
    const holeR = Math.max(1, board.hangingHoleDiameterMm / 2);
    const topY = board.borderShape === 'circle' ? hMm / 2 + Math.min(wMm, hMm) / 2 : hMm;
    circles.push({
      layer: borderDef.dxfLayerName,
      color: borderDef.dxfAciColor,
      cx: roundCoord(wMm / 2),
      cy: roundCoord(topY - holeR - 6),
      r: roundCoord(holeR),
    });
  }

  const lines: string[] = [];
  const push = (...vals: (string | number)[]) => {
    for (const v of vals) lines.push(String(v));
  };

  // HEADER
  push(0, 'SECTION', 2, 'HEADER');
  push(9, '$ACADVER', 1, 'AC1009');
  push(9, '$INSUNITS', 70, 4); // 4 = Millimeters
  push(9, '$MEASUREMENT', 70, 1); // 1 = Metric
  push(0, 'ENDSEC');

  // TABLES -> LAYER
  const activeLayers = LASER_LAYERS.filter((l) => usedLayers.has(l.id));
  push(0, 'SECTION', 2, 'TABLES');
  push(0, 'TABLE', 2, 'LAYER', 70, activeLayers.length);
  for (const l of activeLayers) {
    push(0, 'LAYER', 2, l.dxfLayerName, 70, 0, 62, l.dxfAciColor, 6, 'CONTINUOUS');
  }
  push(0, 'ENDTAB', 0, 'ENDSEC');

  // ENTITIES (in ordered layer sequence)
  push(0, 'SECTION', 2, 'ENTITIES');

  const orderedPolys = [...polylines].sort((a, b) => a.layer.localeCompare(b.layer));
  const orderedCircles = [...circles].sort((a, b) => a.layer.localeCompare(b.layer));

  for (const poly of orderedPolys) {
    push(
      0,
      'POLYLINE',
      8,
      poly.layer,
      62,
      poly.color,
      66,
      1,
      70,
      poly.closed ? 1 : 0,
      10,
      0.0,
      20,
      0.0,
      30,
      0.0
    );
    for (const pt of poly.points) {
      push(0, 'VERTEX', 8, poly.layer, 10, pt.x, 20, pt.y, 30, 0.0);
    }
    push(0, 'SEQEND', 8, poly.layer);
  }

  for (const c of orderedCircles) {
    push(0, 'CIRCLE', 8, c.layer, 62, c.color, 10, c.cx, 20, c.cy, 30, 0.0, 40, c.r);
  }

  push(0, 'ENDSEC', 0, 'EOF');
  return lines.join('\r\n');
}
