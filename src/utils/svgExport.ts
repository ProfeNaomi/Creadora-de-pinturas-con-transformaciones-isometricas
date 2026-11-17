import { BoardConfig, DesignShape, LaserDepthId, Matrix2D } from '../types/geometry';
import {
  applyMatrix,
  IDENTITY_MATRIX,
  mathToSvgMm,
  multiplyMatrices,
  roundCoord,
  transformMathPath,
} from './math2d';
import { getShapeLocalPaths, isShapeFillable } from './presets';
import {
  LASER_LAYERS,
  LASER_LAYER_MAP,
} from './laserLayers';
import { buildTessellationExportByLayer } from './tessellations';

export function buildBoardBorderSvgPaths(board: BoardConfig): string[] {
  const w = board.widthCm * 10;
  const h = board.heightCm * 10;
  const paths: string[] = [];

  if (board.borderShape === 'circle') {
    const r = Math.min(w, h) / 2;
    const cx = w / 2;
    const cy = h / 2;
    const k = 0.5522847498307936 * r;
    paths.push(
      `M ${roundCoord(cx + r)} ${roundCoord(cy)} ` +
        `C ${roundCoord(cx + r)} ${roundCoord(cy + k)} ${roundCoord(cx + k)} ${roundCoord(cy + r)} ${roundCoord(cx)} ${roundCoord(cy + r)} ` +
        `C ${roundCoord(cx - k)} ${roundCoord(cy + r)} ${roundCoord(cx - r)} ${roundCoord(cy + k)} ${roundCoord(cx - r)} ${roundCoord(cy)} ` +
        `C ${roundCoord(cx - r)} ${roundCoord(cy - k)} ${roundCoord(cx - k)} ${roundCoord(cy - r)} ${roundCoord(cx)} ${roundCoord(cy - r)} ` +
        `C ${roundCoord(cx + k)} ${roundCoord(cy - r)} ${roundCoord(cx + r)} ${roundCoord(cy - k)} ${roundCoord(cx + r)} ${roundCoord(cy)} Z`
    );
  } else if (board.borderShape === 'rounded') {
    const r = Math.min(board.cornerRadiusCm * 10, w / 2, h / 2);
    const k = r * (1 - 0.5522847498307936);
    paths.push(
      `M ${r} 0 L ${w - r} 0 ` +
        `C ${roundCoord(w - k)} 0 ${w} ${roundCoord(k)} ${w} ${r} ` +
        `L ${w} ${h - r} ` +
        `C ${w} ${roundCoord(h - k)} ${roundCoord(w - k)} ${h} ${w - r} ${h} ` +
        `L ${r} ${h} ` +
        `C ${roundCoord(k)} ${h} 0 ${roundCoord(h - k)} 0 ${h - r} ` +
        `L 0 ${r} ` +
        `C 0 ${roundCoord(k)} ${roundCoord(k)} 0 ${r} 0 Z`
    );
  } else {
    paths.push(`M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`);
  }

  if (board.hangingHole) {
    const holeR = Math.max(1, board.hangingHoleDiameterMm / 2);
    const cx = w / 2;
    const topY = board.borderShape === 'circle' ? h / 2 - Math.min(w, h) / 2 : 0;
    const cy = topY + holeR + 6;
    const k = 0.5522847498307936 * holeR;
    paths.push(
      `M ${roundCoord(cx + holeR)} ${roundCoord(cy)} ` +
        `C ${roundCoord(cx + holeR)} ${roundCoord(cy + k)} ${roundCoord(cx + k)} ${roundCoord(cy + holeR)} ${roundCoord(cx)} ${roundCoord(cy + holeR)} ` +
        `C ${roundCoord(cx - k)} ${roundCoord(cy + holeR)} ${roundCoord(cx - holeR)} ${roundCoord(cy + k)} ${roundCoord(cx - holeR)} ${roundCoord(cy)} ` +
        `C ${roundCoord(cx - holeR)} ${roundCoord(cy - k)} ${roundCoord(cx - k)} ${roundCoord(cy - holeR)} ${roundCoord(cx)} ${roundCoord(cy - holeR)} ` +
        `C ${roundCoord(cx + k)} ${roundCoord(cy - holeR)} ${roundCoord(cx + holeR)} ${roundCoord(cy - k)} ${roundCoord(cx + holeR)} ${roundCoord(cy)} Z`
    );
  }

  return paths;
}

/**
 * Generates an ordered, multi-layer SVG in millimeters compatible with
 * Creality Falcon Design Space, LightBurn, CorelDRAW, and LaserGRBL.
 * Each depth level has its own distinct color so Falcon auto-separates layers.
 */
export function buildLaserSvgString(board: BoardConfig, shapes: DesignShape[]): string {
  const wMm = roundCoord(board.widthCm * 10);
  const hMm = roundCoord(board.heightCm * 10);
  const borderPaths = buildBoardBorderSvgPaths(board);

  const buckets = new Map<LaserDepthId, string[]>();
  for (const layer of LASER_LAYERS) {
    buckets.set(layer.id, []);
  }

  const appendShapeToBuckets = (
    shape: DesignShape,
    parentMatrix: Matrix2D,
    inheritedLayer?: LaserDepthId
  ) => {
    if (!shape.visible) return;
    const worldMatrix = multiplyMatrices(parentMatrix, shape.matrix);
    const effectiveLayer = shape.laserLayer ?? inheritedLayer;

    if (shape.kind === 'group' && shape.children) {
      for (const child of shape.children) {
        appendShapeToBuckets(child, worldMatrix, effectiveLayer);
      }
      return;
    }

    const layerId = effectiveLayer ?? 'engrave-medium';
    const layerDef = LASER_LAYER_MAP[layerId];
    const bucket = buckets.get(layerId)!;

    if (shape.kind === 'dots' && shape.localDots) {
      const rMm = roundCoord((shape.dotRadiusCm ?? 0.08) * 10);
      const sx = Math.hypot(worldMatrix[0], worldMatrix[1]);
      const sy = Math.hypot(worldMatrix[2], worldMatrix[3]);
      const scaledRMm = roundCoord(Math.max(0.25, rMm * ((sx + sy) / 2)));
      for (const dot of shape.localDots) {
        const mp = applyMatrix(worldMatrix, dot);
        const sp = mathToSvgMm(mp, board.widthCm, board.heightCm);
        if (layerId === 'engrave-fill') {
          bucket.push(
            `    <circle cx="${sp.x}" cy="${sp.y}" r="${scaledRMm}" fill="${layerDef.color}" stroke="none" />`
          );
        } else {
          bucket.push(
            `    <circle cx="${sp.x}" cy="${sp.y}" r="${scaledRMm}" fill="none" stroke="${layerDef.color}" />`
          );
        }
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
      grouped.forEach((b, bLayerId) => {
        const targetBucket = buckets.get(bLayerId)!;
        const bDef = LASER_LAYER_MAP[bLayerId];
        if (b.lineSegments.length > 0) {
          const dStr = b.lineSegments
            .map(([p1, p2]) => {
              const s1 = mathToSvgMm(p1, board.widthCm, board.heightCm);
              const s2 = mathToSvgMm(p2, board.widthCm, board.heightCm);
              return `M ${s1.x} ${s1.y} L ${s2.x} ${s2.y}`;
            })
            .join(' ');
          targetBucket.push(`    <path d="${dStr}" fill="none" stroke="${bDef.color}" />`);
        }
        for (const poly of b.fillPolygons) {
          const dStr =
            poly
              .map((pt, idx) => {
                const sp = mathToSvgMm(pt, board.widthCm, board.heightCm);
                return `${idx === 0 ? 'M' : 'L'} ${sp.x} ${sp.y}`;
              })
              .join(' ') + ' Z';
          targetBucket.push(
            `    <path d="${dStr}" fill="${bDef.color}" stroke="${bDef.color}" stroke-width="0.1" />`
          );
        }
      });
      return;
    }

    const localPaths = getShapeLocalPaths(shape);
    for (const d of localPaths) {
      const { svgD } = transformMathPath(d, worldMatrix, board.widthCm, board.heightCm);
      if (!svgD) continue;
      if (layerId === 'engrave-fill') {
        const isClosed = d.trim().toUpperCase().endsWith('Z');
        if (isClosed) {
          bucket.push(
            `    <path d="${svgD}" fill="${layerDef.color}" fill-rule="evenodd" stroke="${layerDef.color}" stroke-width="0.1" />`
          );
        } else {
          bucket.push(`    <path d="${svgD}" fill="none" stroke="${layerDef.color}" />`);
        }
      } else {
        bucket.push(`    <path d="${svgD}" />`);
      }
    }
  };

  for (const shape of shapes) {
    appendShapeToBuckets(shape, IDENTITY_MATRIX);
  }

  // Board outer cut border (always last in CAPA_6_CORTE_BORDE)
  const borderBucket = buckets.get('cut-border')!;
  for (const d of borderPaths) {
    borderBucket.push(`    <path d="${d}" />`);
  }

  const groupBlocks: string[] = [];
  for (const layer of LASER_LAYERS) {
    const items = buckets.get(layer.id) ?? [];
    if (items.length === 0) continue;
    const isFill = layer.id === 'engrave-fill';
    const isCut = layer.id === 'cut-inner' || layer.id === 'cut-border';
    const sw = isCut ? '0.1' : layer.id === 'engrave-deep' ? '0.35' : '0.2';
    groupBlocks.push(
      `  <!-- ${layer.name} (${layer.color}) — Modo Falcon: ${layer.falconMode} -->`,
      `  <g id="${layer.svgGroupId}" fill="${isFill ? layer.color : 'none'}" stroke="${layer.color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">`,
      ...items,
      `  </g>`
    );
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}mm" height="${hMm}mm" viewBox="0 0 ${wMm} ${hMm}">`,
    `  <!-- Creado con Taller de Transformación Isométrica — Profesora Naomi Urrea -->`,
    `  <!-- Optimizado por capas de color para Creality CR-Laser Falcon 10W / Falcon Design Space -->`,
    ...groupBlocks,
    `</svg>`,
  ].join('\n');
}

export function buildPaintPreviewSvgString(board: BoardConfig, shapes: DesignShape[]): string {
  const wMm = roundCoord(board.widthCm * 10);
  const hMm = roundCoord(board.heightCm * 10);
  const borderPaths = buildBoardBorderSvgPaths(board);

  const elements: string[] = [];

  const appendPaintShape = (shape: DesignShape, parentMatrix: Matrix2D) => {
    if (!shape.visible) return;
    const worldMatrix = multiplyMatrices(parentMatrix, shape.matrix);

    if (shape.kind === 'group' && shape.children) {
      for (const child of shape.children) {
        appendPaintShape(child, worldMatrix);
      }
      return;
    }

    if (shape.kind === 'dots' && shape.localDots) {
      const rMm = roundCoord((shape.dotRadiusCm ?? 0.08) * 10);
      const sx = Math.hypot(worldMatrix[0], worldMatrix[1]);
      const sy = Math.hypot(worldMatrix[2], worldMatrix[3]);
      const scaledRMm = roundCoord(Math.max(0.25, rMm * ((sx + sy) / 2)));
      for (const dot of shape.localDots) {
        const mp = applyMatrix(worldMatrix, dot);
        const sp = mathToSvgMm(mp, board.widthCm, board.heightCm);
        elements.push(
          `    <circle cx="${sp.x}" cy="${sp.y}" r="${scaledRMm}" fill="#111827" stroke="none" />`
        );
      }
      return;
    }

    if (shape.kind === 'tessellation' && shape.tessellation) {
      for (const tile of shape.tessellation.tiles) {
        const d =
          tile.points
            .map((pt, idx) => {
              const sp = mathToSvgMm(
                applyMatrix(worldMatrix, pt),
                board.widthCm,
                board.heightCm
              );
              return `${idx === 0 ? 'M' : 'L'} ${sp.x} ${sp.y}`;
            })
            .join(' ') + ' Z';
        const fill = shape.tessellation.autoColor ? tile.fillColor : 'none';
        elements.push(
          `    <path d="${d}" fill="${fill}" fill-opacity="0.72" stroke="#111827" stroke-width="${shape.strokeWidthMm}" />`
        );
      }
      if (shape.tessellation.includeBorder) {
        const hw = shape.tessellation.widthCm / 2;
        const hh = shape.tessellation.heightCm / 2;
        const borderPts = [
          { x: -hw, y: -hh },
          { x: hw, y: -hh },
          { x: hw, y: hh },
          { x: -hw, y: hh },
        ];
        const bd =
          borderPts
            .map((pt, idx) => {
              const sp = mathToSvgMm(
                applyMatrix(worldMatrix, pt),
                board.widthCm,
                board.heightCm
              );
              return `${idx === 0 ? 'M' : 'L'} ${sp.x} ${sp.y}`;
            })
            .join(' ') + ' Z';
        elements.push(
          `    <path d="${bd}" fill="none" stroke="#111827" stroke-width="${shape.strokeWidthMm}" />`
        );
      }
      return;
    }

    const localPaths = getShapeLocalPaths(shape);
    const canFill = isShapeFillable(shape) && shape.fillColor && shape.fillColor !== 'none';
    localPaths.forEach((d, idx) => {
      const { svgD } = transformMathPath(d, worldMatrix, board.widthCm, board.heightCm);
      if (svgD) {
        const isClosed = d.trim().toUpperCase().endsWith('Z');
        const fillThisPath =
          canFill && (shape.kind === 'preset' ? idx === 0 : isClosed);
        const fill = fillThisPath ? shape.fillColor : 'none';
        elements.push(
          `    <path d="${svgD}" fill="${fill}" fill-rule="evenodd" fill-opacity="0.72" stroke="#111827" stroke-width="${shape.strokeWidthMm}" />`
        );
      }
    });
  };

  for (const shape of shapes) {
    appendPaintShape(shape, IDENTITY_MATRIX);
  }

  const cutElements = borderPaths.map((d) => `    <path d="${d}" />`);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}" height="${hMm}" viewBox="0 0 ${wMm} ${hMm}">`,
    `  <rect x="0" y="0" width="${wMm}" height="${hMm}" fill="#ffffff" />`,
    `  <g stroke-linecap="round" stroke-linejoin="round">`,
    ...elements,
    `  </g>`,
    `  <g fill="none" stroke="#ef4444" stroke-width="0.4">`,
    ...cutElements,
    `  </g>`,
    `</svg>`,
  ].join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportPaintPng(board: BoardConfig, shapes: DesignShape[]): Promise<void> {
  const svgStr = buildPaintPreviewSvgString(board, shapes);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
    img.src = url;
  });

  const maxSide = 1600;
  const aspect = board.widthCm / board.heightCm;
  const width = aspect >= 1 ? maxSide : Math.round(maxSide * aspect);
  const height = aspect >= 1 ? Math.round(maxSide / aspect) : maxSide;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob((pngBlob) => {
      if (pngBlob) {
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `pintura-isometrica-${board.widthCm}x${board.heightCm}cm.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
      }
    }, 'image/png');
  }
  URL.revokeObjectURL(url);
}
