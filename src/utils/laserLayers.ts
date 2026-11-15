import { LaserDepthId, MaterialPresetId } from '../types/geometry';

export interface LaserLayerDefinition {
  id: LaserDepthId;
  order: number;
  svgGroupId: string;
  dxfLayerName: string;
  /** AutoCAD Color Index for DXF compatibility */
  dxfAciColor: number;
  name: string;
  shortName: string;
  falconMode: 'Fill' | 'Line (Marcado)' | 'Cut (Corte)';
  color: string;
  woodPreviewColor: string;
  woodStrokeWidthFactor: number;
  description: string;
  isSelectableForShapes: boolean;
}

/**
 * Ordered execution sequence for Creality Falcon Design Space:
 * 1. Fill engravings -> 2. Light score -> 3. Medium engrave -> 4. Deep engrave -> 5. Inner cuts -> 6. Outer border cut
 */
export const LASER_LAYERS: LaserLayerDefinition[] = [
  {
    id: 'engrave-fill',
    order: 1,
    svgGroupId: 'CAPA_1_RELLENO_SOLIDO',
    dxfLayerName: '1_RELLENO_SOLIDO',
    dxfAciColor: 6, // Magenta
    name: 'Grabado Relleno (Fill)',
    shortName: 'Relleno',
    falconMode: 'Fill',
    color: '#7c3aed',
    woodPreviewColor: '#8a5a32',
    woodStrokeWidthFactor: 1.0,
    description: 'Quema todo el interior de figuras cerradas para dar contraste y sombra.',
    isSelectableForShapes: true,
  },
  {
    id: 'score-light',
    order: 2,
    svgGroupId: 'CAPA_2_MARCADO_SUAVE',
    dxfLayerName: '2_MARCADO_SUAVE',
    dxfAciColor: 5, // Blue
    name: 'Marcado Suave (Score)',
    shortName: 'Suave',
    falconMode: 'Line (Marcado)',
    color: '#0066ff',
    woodPreviewColor: '#b38354',
    woodStrokeWidthFactor: 0.75,
    description: 'Línea superficial delicada para texturas, teselaciones de fondo o detalles finos.',
    isSelectableForShapes: true,
  },
  {
    id: 'engrave-medium',
    order: 3,
    svgGroupId: 'CAPA_3_GRABADO_MEDIO',
    dxfLayerName: '3_GRABADO_MEDIO',
    dxfAciColor: 7, // Black/White
    name: 'Grabado Medio (Línea)',
    shortName: 'Medio',
    falconMode: 'Line (Marcado)',
    color: '#000000',
    woodPreviewColor: '#69401d',
    woodStrokeWidthFactor: 1.15,
    description: 'Trazo estándar bien definido, ideal como guía para pintar encima.',
    isSelectableForShapes: true,
  },
  {
    id: 'engrave-deep',
    order: 4,
    svgGroupId: 'CAPA_4_GRABADO_PROFUNDO',
    dxfLayerName: '4_GRABADO_PROFUNDO',
    dxfAciColor: 3, // Green
    name: 'Grabado Profundo (Relieve)',
    shortName: 'Profundo',
    falconMode: 'Line (Marcado)',
    color: '#009944',
    woodPreviewColor: '#3b200a',
    woodStrokeWidthFactor: 1.75,
    description: 'Surco más hondo y oscuro para contornos protagonistas o efecto relieve.',
    isSelectableForShapes: true,
  },
  {
    id: 'cut-inner',
    order: 5,
    svgGroupId: 'CAPA_5_CORTE_INTERNO',
    dxfLayerName: '5_CORTE_INTERNO',
    dxfAciColor: 30, // Orange
    name: 'Corte Pasante Interno',
    shortName: 'Corte Int.',
    falconMode: 'Cut (Corte)',
    color: '#ff6600',
    woodPreviewColor: '#1f1209',
    woodStrokeWidthFactor: 1.85,
    description: 'Corta completamente por dentro (ventanas o calados) antes del borde exterior.',
    isSelectableForShapes: true,
  },
  {
    id: 'cut-border',
    order: 6,
    svgGroupId: 'CAPA_6_CORTE_BORDE',
    dxfLayerName: '6_CORTE_BORDE',
    dxfAciColor: 1, // Red
    name: 'Corte Borde Exterior',
    shortName: 'Corte Borde',
    falconMode: 'Cut (Corte)',
    color: '#ff0000',
    woodPreviewColor: '#1f1209',
    woodStrokeWidthFactor: 2.0,
    description: 'Contorno exterior del tablero y perforación para colgar. Se corta al final.',
    isSelectableForShapes: false,
  },
];

export const LASER_LAYER_MAP: Record<LaserDepthId, LaserLayerDefinition> =
  LASER_LAYERS.reduce(
    (acc, layer) => {
      acc[layer.id] = layer;
      return acc;
    },
    {} as Record<LaserDepthId, LaserLayerDefinition>
  );

export interface FalconLayerParam {
  powerPct: number;
  speedMmMin: number;
  passes: number;
}

export interface MaterialPreset {
  id: MaterialPresetId;
  name: string;
  notes: string;
  params: Record<LaserDepthId, FalconLayerParam>;
}

export const FALCON_10W_MATERIALS: MaterialPreset[] = [
  {
    id: 'plywood-3mm',
    name: 'Terciado / Contrachapado 3 mm',
    notes: 'Ideal para cuadros pintados a mano. Hacer prueba de corte previa en esquina.',
    params: {
      'engrave-fill': { powerPct: 35, speedMmMin: 3500, passes: 1 },
      'score-light': { powerPct: 25, speedMmMin: 3000, passes: 1 },
      'engrave-medium': { powerPct: 45, speedMmMin: 2000, passes: 1 },
      'engrave-deep': { powerPct: 65, speedMmMin: 1200, passes: 2 },
      'cut-inner': { powerPct: 100, speedMmMin: 350, passes: 1 },
      'cut-border': { powerPct: 100, speedMmMin: 350, passes: 1 },
    },
  },
  {
    id: 'mdf-3mm',
    name: 'MDF / Trupan 3 mm',
    notes: 'El MDF es más denso que el terciado; suele requerir menor velocidad o 2 pasadas al cortar.',
    params: {
      'engrave-fill': { powerPct: 40, speedMmMin: 3000, passes: 1 },
      'score-light': { powerPct: 30, speedMmMin: 2800, passes: 1 },
      'engrave-medium': { powerPct: 50, speedMmMin: 1800, passes: 1 },
      'engrave-deep': { powerPct: 70, speedMmMin: 1100, passes: 2 },
      'cut-inner': { powerPct: 100, speedMmMin: 280, passes: 2 },
      'cut-border': { powerPct: 100, speedMmMin: 280, passes: 2 },
    },
  },
  {
    id: 'softwood-3mm',
    name: 'Madera Balsa / Pino Suave 3 mm',
    notes: 'Material blando: requiere menos potencia para no quemar demasiado los bordes.',
    params: {
      'engrave-fill': { powerPct: 25, speedMmMin: 4000, passes: 1 },
      'score-light': { powerPct: 18, speedMmMin: 3500, passes: 1 },
      'engrave-medium': { powerPct: 35, speedMmMin: 2400, passes: 1 },
      'engrave-deep': { powerPct: 50, speedMmMin: 1500, passes: 1 },
      'cut-inner': { powerPct: 90, speedMmMin: 500, passes: 1 },
      'cut-border': { powerPct: 90, speedMmMin: 500, passes: 1 },
    },
  },
  {
    id: 'cardboard',
    name: 'Cartón Piedra / Kraft 2 mm',
    notes: 'Corte rápido; vigilar siempre por seguridad para evitar exceso de calor.',
    params: {
      'engrave-fill': { powerPct: 20, speedMmMin: 4500, passes: 1 },
      'score-light': { powerPct: 15, speedMmMin: 4000, passes: 1 },
      'engrave-medium': { powerPct: 28, speedMmMin: 2800, passes: 1 },
      'engrave-deep': { powerPct: 40, speedMmMin: 2000, passes: 1 },
      'cut-inner': { powerPct: 80, speedMmMin: 800, passes: 1 },
      'cut-border': { powerPct: 80, speedMmMin: 800, passes: 1 },
    },
  },
];

export function getShapeLaserLayer(shape: { laserLayer?: LaserDepthId }): LaserDepthId {
  return shape.laserLayer ?? 'engrave-medium';
}
