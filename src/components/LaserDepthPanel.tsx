import React, { useMemo } from 'react';
import {
  CheckSquare,
  Download,
  FileCode2,
  Flame,
  Layers,
  Sparkles,
  Trees,
} from 'lucide-react';
import {
  DesignShape,
  LaserDepthId,
  MaterialPresetId,
  TransformRecord,
} from '../types/geometry';
import { getGroupLeafStats } from '../utils/blocks';
import {
  FALCON_10W_MATERIALS,
  getShapeLaserLayer,
  LASER_LAYERS,
  LASER_LAYER_MAP,
} from '../utils/laserLayers';

export type LaserPreviewStyle = 'layers' | 'wood';

interface LaserDepthPanelProps {
  shapes: DesignShape[];
  transforms: TransformRecord[];
  selectedShapeIds: string[];
  laserPreviewStyle: LaserPreviewStyle;
  onChangePreviewStyle: (style: LaserPreviewStyle) => void;
  materialId: MaterialPresetId;
  onChangeMaterial: (id: MaterialPresetId) => void;
  onSelectShapes: (ids: string[]) => void;
  onAssignLayerToShapes: (ids: string[], layer: LaserDepthId) => void;
  onAlternateTransformLayers: (transformId: string, layerA: LaserDepthId, layerB: LaserDepthId) => void;
  onUpdateTessellationRoles: (
    shapeId: string,
    roleLayers: Record<string, LaserDepthId>,
    borderLayer?: LaserDepthId
  ) => void;
  onExportLaserSvg: () => void;
  onExportLaserDxf: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  sq: 'Cuadrados A',
  sqAlt: 'Cuadrados B',
  triUp: 'Triángulos ↑',
  triDown: 'Triángulos ↓',
  tri: 'Triángulos',
  hex: 'Hexágonos A',
  hexAlt: 'Hexágonos B',
  oct: 'Octágonos',
  dod: 'Dodecágonos',
  pA: 'Pentágonos A',
  pB: 'Pentágonos B',
  r1: 'Rombos Cara 1',
  r2: 'Rombos Cara 2',
  r3: 'Rombos Cara 3',
};

export const LaserDepthPanel: React.FC<LaserDepthPanelProps> = ({
  shapes,
  transforms,
  selectedShapeIds,
  laserPreviewStyle,
  onChangePreviewStyle,
  materialId,
  onChangeMaterial,
  onSelectShapes,
  onAssignLayerToShapes,
  onAlternateTransformLayers,
  onUpdateTessellationRoles,
  onExportLaserSvg,
  onExportLaserDxf,
}) => {
  const visibleShapes = useMemo(() => shapes.filter((s) => s.visible), [shapes]);
  const selectedShapes = useMemo(
    () => visibleShapes.filter((s) => selectedShapeIds.includes(s.id)),
    [visibleShapes, selectedShapeIds]
  );
  const primaryShape = selectedShapes[0] ?? null;

  const material =
    FALCON_10W_MATERIALS.find((m) => m.id === materialId) ??
    FALCON_10W_MATERIALS[0];

  const layerCounts = useMemo(() => {
    const counts: Record<LaserDepthId, number> = {
      'engrave-fill': 0,
      'score-light': 0,
      'engrave-medium': 0,
      'engrave-deep': 0,
      'cut-inner': 0,
      'cut-border': 1, // Always includes board outer border
    };
    const countRecursive = (s: DesignShape, inheritedLayer?: LaserDepthId) => {
      if (!s.visible) return;
      const effectiveLayer = s.laserLayer ?? inheritedLayer;
      if (s.kind === 'group' && s.children) {
        s.children.forEach((c) => countRecursive(c, effectiveLayer));
        return;
      }
      if (s.kind === 'tessellation' && s.tessellation) {
        const roles = new Set(s.tessellation.tiles.map((t) => t.role));
        roles.forEach((role) => {
          const l =
            s.tessellation?.roleLaserLayers?.[role] ??
            effectiveLayer ??
            'engrave-medium';
          counts[l] += 1;
        });
      } else {
        counts[effectiveLayer ?? 'engrave-medium'] += 1;
      }
    };
    for (const s of visibleShapes) {
      countRecursive(s);
    }
    return counts;
  }, [visibleShapes]);

  // Check if primaryShape belongs to a transform group
  const relatedTransform = useMemo(() => {
    if (!primaryShape) return null;
    if (primaryShape.derivedFrom) {
      return (
        transforms.find((t) => t.id === primaryShape.derivedFrom?.transformId) ??
        null
      );
    }
    return (
      transforms.find((t) => t.sourceIds.includes(primaryShape.id)) ?? null
    );
  }, [primaryShape, transforms]);

  const tessRoles = useMemo(() => {
    if (!primaryShape || primaryShape.kind !== 'tessellation' || !primaryShape.tessellation) {
      return [];
    }
    return Array.from(new Set(primaryShape.tessellation.tiles.map((t) => t.role)));
  }, [primaryShape]);

  const selectableLayers = LASER_LAYERS.filter((l) => l.isSelectableForShapes);

  return (
    <aside className="w-[340px] bg-white border-l border-slate-200 flex flex-col shrink-0 z-10 overflow-hidden">
      {/* Header & Preview Switch */}
      <div className="p-3 border-b border-slate-200 bg-slate-50 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
            <Flame className="w-4 h-4 text-orange-600" />
            <span>CR-Laser Falcon 10W (CV-30)</span>
          </div>
          <button
            type="button"
            onClick={() => onSelectShapes(visibleShapes.map((s) => s.id))}
            className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            title="Seleccionar todas las figuras visibles para cambiarles la profundidad juntas"
          >
            <CheckSquare className="w-3 h-3" />
            Todas ({visibleShapes.length})
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-slate-200/70 p-0.5 rounded-lg">
          <button
            type="button"
            onClick={() => onChangePreviewStyle('layers')}
            className={`py-1 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition ${
              laserPreviewStyle === 'layers'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            Capas Falcon
          </button>
          <button
            type="button"
            onClick={() => onChangePreviewStyle('wood')}
            className={`py-1 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition ${
              laserPreviewStyle === 'wood'
                ? 'bg-white text-amber-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Trees className="w-3.5 h-3.5 text-amber-700" />
            Vista en Madera
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-200">
        {/* Selection Depth Assignment */}
        <div className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              {selectedShapes.length === 0
                ? 'Selecciona figuras o usa el Pincel Láser'
                : selectedShapes.length === 1
                  ? `Figura: ${primaryShape?.name}`
                  : `${selectedShapes.length} figuras seleccionadas`}
            </span>
            {primaryShape && (() => {
              const stats = getGroupLeafStats(primaryShape);
              if (primaryShape.kind === 'group' && stats.layers.size > 1) {
                return (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    Mixto
                  </span>
                );
              }
              const singleLayer =
                stats.layers.size === 1
                  ? Array.from(stats.layers)[0]
                  : getShapeLaserLayer(primaryShape);
              return (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{
                    backgroundColor: LASER_LAYER_MAP[singleLayer].color,
                  }}
                >
                  {LASER_LAYER_MAP[singleLayer].shortName}
                </span>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {selectableLayers.map((layer) => {
              const isCurrent =
                selectedShapes.length > 0 &&
                selectedShapes.every((s) => {
                  if (s.kind === 'group') {
                    const stats = getGroupLeafStats(s);
                    return stats.layers.size === 1 && stats.layers.has(layer.id);
                  }
                  return getShapeLaserLayer(s) === layer.id;
                });
              return (
                <button
                  key={layer.id}
                  type="button"
                  disabled={selectedShapes.length === 0}
                  onClick={() =>
                    onAssignLayerToShapes(
                      selectedShapes.map((s) => s.id),
                      layer.id
                    )
                  }
                  className={`p-2 rounded-lg border text-left transition flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isCurrent
                      ? 'border-slate-900 bg-slate-900/5 ring-1 ring-slate-900'
                      : 'border-slate-200 bg-white hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                      style={{ backgroundColor: layer.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-slate-900 truncate">
                        {layer.name}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {layer.description}
                      </div>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded shrink-0">
                    {layer.falconMode}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Transform group smart alternation */}
          {relatedTransform && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-900">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Grupo: {relatedTransform.name}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const allIds = Array.from(
                      new Set([
                        ...relatedTransform.sourceIds,
                        ...relatedTransform.createdShapeIds,
                      ])
                    );
                    onSelectShapes(allIds);
                  }}
                  className="px-2 py-1 rounded bg-white border border-emerald-300 text-emerald-800 text-[10px] font-semibold hover:bg-emerald-100 cursor-pointer"
                >
                  Seleccionar grupo completo
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onAlternateTransformLayers(
                      relatedTransform.id,
                      'engrave-medium',
                      'engrave-fill'
                    )
                  }
                  className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-semibold hover:bg-emerald-700 cursor-pointer"
                >
                  Alternar Medio / Relleno
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onAlternateTransformLayers(
                      relatedTransform.id,
                      'score-light',
                      'engrave-deep'
                    )
                  }
                  className="px-2 py-1 rounded bg-white border border-emerald-300 text-emerald-800 text-[10px] font-semibold hover:bg-emerald-100 cursor-pointer"
                >
                  Alternar Suave / Profundo
                </button>
              </div>
            </div>
          )}

          {/* Tessellation per-polygon-role depth controls */}
          {primaryShape?.kind === 'tessellation' && primaryShape.tessellation && (
            <div className="p-2.5 rounded-xl bg-violet-50 border border-violet-200 space-y-2">
              <div className="text-[11px] font-bold text-violet-900">
                Profundidad por polígono en Teselación
              </div>
              <div className="space-y-1.5">
                {tessRoles.map((role) => {
                  const currentRoleLayer =
                    primaryShape.tessellation?.roleLaserLayers?.[role] ??
                    getShapeLaserLayer(primaryShape);
                  return (
                    <div
                      key={role}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="font-medium text-slate-700">
                        {ROLE_LABELS[role] ?? role}:
                      </span>
                      <select
                        value={currentRoleLayer}
                        onChange={(e) => {
                          const nextRoles = {
                            ...(primaryShape.tessellation?.roleLaserLayers ?? {}),
                            [role]: e.target.value as LaserDepthId,
                          };
                          onUpdateTessellationRoles(
                            primaryShape.id,
                            nextRoles,
                            primaryShape.tessellation?.borderLaserLayer
                          );
                        }}
                        className="bg-white border border-violet-300 rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-800"
                      >
                        {selectableLayers.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.shortName}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                {primaryShape.tessellation.includeBorder && (
                  <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-violet-200">
                    <span className="font-medium text-slate-700">
                      Marco del área:
                    </span>
                    <select
                      value={
                        primaryShape.tessellation.borderLaserLayer ??
                        getShapeLaserLayer(primaryShape)
                      }
                      onChange={(e) =>
                        onUpdateTessellationRoles(
                          primaryShape.id,
                          primaryShape.tessellation?.roleLaserLayers ?? {},
                          e.target.value as LaserDepthId
                        )
                      }
                      className="bg-white border border-violet-300 rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-800"
                    >
                      {selectableLayers.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.shortName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Falcon Design Space Reference Table */}
        <div className="p-3 space-y-2.5 bg-slate-50/60">
          <div>
            <div className="text-xs font-bold text-slate-900">
              Guía de parámetros para Falcon Design Space
            </div>
            <p className="text-[10px] text-slate-500">
              Al importar el SVG o DXF en Falcon, verás estas capas ordenadas por color:
            </p>
          </div>

          <select
            value={materialId}
            onChange={(e) => onChangeMaterial(e.target.value as MaterialPresetId)}
            className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-slate-800"
          >
            {FALCON_10W_MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                Material: {m.name}
              </option>
            ))}
          </select>

          <div className="space-y-1">
            {LASER_LAYERS.map((layer) => {
              const count = layerCounts[layer.id];
              const p = material.params[layer.id];
              return (
                <div
                  key={layer.id}
                  className={`px-2 py-1.5 rounded-lg border text-[10px] flex items-center justify-between gap-2 ${
                    count > 0
                      ? 'bg-white border-slate-200'
                      : 'bg-slate-100/50 border-slate-200/50 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-bold text-slate-400 w-3">
                      {layer.order}°
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: layer.color }}
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 truncate">
                        {layer.shortName}{' '}
                        <span className="font-normal text-slate-500">
                          ({count})
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-500">
                        Modo Falcon: <strong>{layer.falconMode}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono text-[9.5px] text-slate-700 shrink-0">
                    <div>
                      <strong>{p.powerPct}%</strong> · {p.speedMmMin} mm/m
                    </div>
                    <div className="text-slate-500">
                      {p.passes} {p.passes === 1 ? 'pasada' : 'pasadas'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
            <strong>Nota CR-Laser Falcon 10W:</strong> {material.notes}
          </div>
        </div>
      </div>

      {/* Export Footer */}
      <div className="p-3 border-t border-slate-200 bg-white space-y-1.5">
        <button
          type="button"
          onClick={onExportLaserSvg}
          className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition"
        >
          <Download className="w-4 h-4" />
          Descargar SVG Multi-capa (Falcon)
        </button>
        <button
          type="button"
          onClick={onExportLaserDxf}
          className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition"
        >
          <FileCode2 className="w-4 h-4" />
          Descargar DXF Estándar (Corel / Falcon)
        </button>
      </div>
    </aside>
  );
};
