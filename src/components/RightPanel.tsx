import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Combine,
  Compass,
  Copy,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Grid,
  Group,
  Layers,
  Link2Off,
  Move,
  Pentagon,
  RefreshCw,
  RotateCw,
  Split,
  Trash2,
  Type,
  Ungroup,
} from 'lucide-react';
import {
  DesignShape,
  FontId,
  GridConfig,
  GridStep,
  RefObject,
  RefPoint,
  TextSpec,
  TransformRecord,
  ViewMode,
} from '../types/geometry';
import {
  canGroupShapes,
  canJoinShapes,
  canToggleCloseShape,
  canUngroupShapes,
  getGroupLeafStats,
  isShapeClosed,
} from '../utils/blocks';
import { canSplitShapes } from '../utils/pathSplit';
import { formatNum } from '../utils/math2d';
import { getShapeMathBounds, isShapeFillable } from '../utils/presets';
import { FONT_DEFINITIONS } from '../utils/textFonts';

interface RightPanelProps {
  grid: GridConfig;
  onChangeGrid: (next: GridConfig) => void;
  mirrorSymmetry: number;
  onChangeMirrorSymmetry: (axes: number) => void;
  viewMode: ViewMode;
  shapes: DesignShape[];
  refs: RefObject[];
  transforms: TransformRecord[];
  selectedShapeIds: string[];
  selectedRefId: string | null;
  onSelectShape: (id: string, additive?: boolean) => void;
  onSelectAllShapes: () => void;
  onSelectRef: (id: string | null) => void;
  onUpdateRefPoint: (id: string, x: number, y: number) => void;
  onToggleRefVisible: (id: string) => void;
  onDeleteRef: (id: string) => void;
  onToggleShapeVisible: (id: string) => void;
  onDuplicateShapes: (ids: string[]) => void;
  onDeleteShapes: (ids: string[]) => void;
  onUnlinkShape: (id: string) => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onJoinSelected: () => void;
  onSplitSelected: () => void;
  onToggleCloseShape: (id: string) => void;
  onUpdateTextShape: (id: string, nextSpec: TextSpec) => void;
  onChangeShapeFill: (ids: string[], color: string) => void;
  onTranslateSelected: (dx: number, dy: number) => void;
  onToggleTransformVisible: (id: string) => void;
  onDeleteTransform: (id: string) => void;
  onUpdateTransformParam: (
    id: string,
    patch: { angleDeg?: number; copies?: number; repeatCount?: number; keepOriginal?: boolean }
  ) => void;
}

const GRID_STEPS: { value: GridStep; label: string; hint: string }[] = [
  { value: 1, label: '1 cm', hint: 'Enteros (0, 1, 2...)' },
  { value: 0.5, label: '0.5', hint: 'Medios centímetros' },
  { value: 0.25, label: '0.25', hint: 'Cuartos de cm' },
  { value: 0.1, label: '0.1', hint: 'Milímetros (décimas)' },
  { value: 0, label: 'Libre', hint: 'Sin imán a cuadrícula' },
];

const PAINT_PALETTE = [
  { color: 'none', label: 'Sin relleno' },
  { color: '#fecdd3', label: 'Rosa pastel' },
  { color: '#fed7aa', label: 'Durazno' },
  { color: '#fef08a', label: 'Amarillo' },
  { color: '#bbf7d0', label: 'Menta' },
  { color: '#bae6fd', label: 'Celeste' },
  { color: '#ddd6fe', label: 'Lavanda' },
  { color: '#f43f5e', label: 'Coral' },
  { color: '#fb923c', label: 'Naranja' },
  { color: '#22c55e', label: 'Verde' },
  { color: '#3b82f6', label: 'Azul' },
  { color: '#a855f7', label: 'Violeta' },
];

function TransformIcon({ type }: { type: TransformRecord['params']['type'] }) {
  switch (type) {
    case 'axial':
      return <FlipHorizontal2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
    case 'central':
      return <Compass className="w-3.5 h-3.5 text-teal-600 shrink-0" />;
    case 'rotation':
      return <RotateCw className="w-3.5 h-3.5 text-indigo-600 shrink-0" />;
    case 'rosette':
      return <RefreshCw className="w-3.5 h-3.5 text-violet-600 shrink-0" />;
    case 'translation':
      return <Move className="w-3.5 h-3.5 text-sky-600 shrink-0" />;
  }
}

export const RightPanel: React.FC<RightPanelProps> = ({
  grid,
  onChangeGrid,
  mirrorSymmetry,
  onChangeMirrorSymmetry,
  viewMode,
  shapes,
  refs,
  transforms,
  selectedShapeIds,
  selectedRefId,
  onSelectShape,
  onSelectAllShapes,
  onSelectRef,
  onUpdateRefPoint,
  onToggleRefVisible,
  onDeleteRef,
  onToggleShapeVisible,
  onDuplicateShapes,
  onDeleteShapes,
  onUnlinkShape,
  onGroupSelected,
  onUngroupSelected,
  onJoinSelected,
  onSplitSelected,
  onToggleCloseShape,
  onUpdateTextShape,
  onChangeShapeFill,
  onTranslateSelected,
  onToggleTransformVisible,
  onDeleteTransform,
  onUpdateTransformParam,
}) => {
  const [openTransforms, setOpenTransforms] = useState(true);
  const [openRefs, setOpenRefs] = useState(true);
  const [openShapes, setOpenShapes] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const selectedShapes = shapes.filter((s) => selectedShapeIds.includes(s.id));
  const primaryShape = selectedShapes[0] ?? null;
  const selectedRef = refs.find((r) => r.id === selectedRefId) ?? null;

  const baseShapes = shapes.filter((s) => !s.derivedFrom);
  const primaryBounds = primaryShape ? getShapeMathBounds(primaryShape) : null;
  const canGroup = canGroupShapes(selectedShapes);
  const canUngroup = canUngroupShapes(selectedShapes);
  const canJoin = canJoinShapes(selectedShapes);
  const canSplit = canSplitShapes(selectedShapes, shapes);
  const canToggleClose =
    selectedShapes.length === 1 && canToggleCloseShape(primaryShape);
  const primaryIsClosed =
    selectedShapes.length === 1 && isShapeClosed(primaryShape);

  return (
    <aside className="w-[310px] bg-white border-l border-slate-200 flex flex-col shrink-0 z-10 overflow-hidden">
      {/* Precision & Grid Controls */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/70 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Grid className="w-3.5 h-3.5 text-indigo-600" />
            <span>Cuadrícula e Imán</span>
          </div>
          <span className="text-[10px] text-slate-500">
            {grid.step === 0 ? 'Movimiento libre' : `Imán cada ${grid.step} cm`}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1">
          {GRID_STEPS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => onChangeGrid({ ...grid, step: g.value })}
              title={g.hint}
              className={`py-1 rounded-md text-[11px] font-semibold transition cursor-pointer border ${
                grid.step === g.value
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-700">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={grid.showGrid}
              onChange={(e) => onChangeGrid({ ...grid, showGrid: e.target.checked })}
              className="rounded border-slate-300 text-indigo-600"
            />
            Cuadrícula
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={grid.showAxes}
              onChange={(e) => onChangeGrid({ ...grid, showAxes: e.target.checked })}
              className="rounded border-slate-300 text-indigo-600"
            />
            Ejes
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={grid.showNumbers}
              onChange={(e) => onChangeGrid({ ...grid, showNumbers: e.target.checked })}
              className="rounded border-slate-300 text-indigo-600"
            />
            Números
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={grid.showReferences}
              onChange={(e) =>
                onChangeGrid({ ...grid, showReferences: e.target.checked })
              }
              className="rounded border-slate-300 text-indigo-600"
            />
            Guías
          </label>
        </div>

        {/* Live Radial Mirror */}
        <div className="pt-1 border-t border-slate-200/80 flex items-center justify-between gap-2">
          <span
            className="text-[11px] font-medium text-slate-700"
            title="Al dibujar con Lápiz, Puntos o Trazo, repite automáticamente en simetría radial desde (0,0)"
          >
            Espejo al dibujar:
          </span>
          <div className="flex items-center gap-1">
            {[1, 2, 4, 6, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChangeMirrorSymmetry(n)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer border transition ${
                  mirrorSymmetry === n
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {n === 1 ? 'No' : `${n}×`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Object Inspector */}
      {(primaryShape || selectedRef) && (
        <div className="p-3 border-b border-slate-200 bg-indigo-50/40 space-y-2.5">
          {selectedRef && selectedRef.kind === 'point' && (
            <RefPointEditor
              point={selectedRef}
              onChange={(x, y) => onUpdateRefPoint(selectedRef.id, x, y)}
              onDelete={() => onDeleteRef(selectedRef.id)}
            />
          )}

          {primaryShape && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {selectedShapes.length > 1
                      ? `${selectedShapes.length} figuras seleccionadas`
                      : primaryShape.name}
                  </div>
                  {selectedShapes.length === 1 && primaryShape.kind === 'group' && (
                    <div className="text-[10px] font-medium text-indigo-700">
                      Bloque de {getGroupLeafStats(primaryShape).leafCount} elementos
                    </div>
                  )}
                  {primaryBounds && (
                    <div className="text-[10px] text-slate-500">
                      Centro: ({formatNum(primaryBounds.cx)}, {formatNum(primaryBounds.cy)}) cm •{' '}
                      {formatNum(primaryBounds.width)} × {formatNum(primaryBounds.height)} cm
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {primaryShape.derivedFrom && (
                    <button
                      type="button"
                      onClick={() => onUnlinkShape(primaryShape.id)}
                      className="p-1 rounded bg-white border border-slate-200 text-amber-600 hover:bg-amber-50 cursor-pointer"
                      title="Desvincular de la transformación para moverla libremente"
                    >
                      <Link2Off className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onDuplicateShapes(selectedShapes.map((s) => s.id))
                    }
                    className="p-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                    title="Duplicar selección (Ctrl+D)"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onDeleteShapes(selectedShapes.map((s) => s.id))
                    }
                    className="p-1 rounded bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="Eliminar selección (Supr)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {(canGroup || canJoin || canSplit || canUngroup || canToggleClose) && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {canGroup && (
                    <button
                      type="button"
                      onClick={onGroupSelected}
                      title="Agrupar las líneas/figuras seleccionadas en un bloque conjunto (Ctrl+G)"
                      className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Group className="w-3 h-3" />
                      <span>Agrupar en bloque</span>
                    </button>
                  )}
                  {canJoin && (
                    <button
                      type="button"
                      onClick={onJoinSelected}
                      title="Soldar extremos conectados en una figura continua/cerrada (Ctrl+J)"
                      className="px-2 py-1 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Combine className="w-3 h-3" />
                      <span>Unir trazos</span>
                    </button>
                  )}
                  {canSplit && (
                    <button
                      type="button"
                      onClick={onSplitSelected}
                      title="Dividir en trazos individuales o por sus intersecciones para borrar partes por separado (Ctrl+Shift+J)"
                      className="px-2 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Split className="w-3 h-3" />
                      <span>Dividir trazos</span>
                    </button>
                  )}
                  {canUngroup && (
                    <button
                      type="button"
                      onClick={onUngroupSelected}
                      title="Desagrupar bloque en sus elementos individuales (Ctrl+Shift+G)"
                      className="px-2 py-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Ungroup className="w-3 h-3" />
                      <span>Desagrupar</span>
                    </button>
                  )}
                  {canToggleClose && (
                    <button
                      type="button"
                      onClick={() => onToggleCloseShape(primaryShape.id)}
                      title="Conectar inicio y fin del trazo para poder rellenarlo con color"
                      className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Pentagon className="w-3 h-3" />
                      <span>{primaryIsClosed ? 'Abrir contorno' : 'Cerrar contorno'}</span>
                    </button>
                  )}
                </div>
              )}

              {selectedShapes.length === 1 &&
                primaryShape.kind === 'text' &&
                primaryShape.textSpec &&
                !primaryShape.derivedFrom && (
                  <TextInspectorEditor
                    shapeId={primaryShape.id}
                    spec={primaryShape.textSpec}
                    onChange={(nextSpec) => onUpdateTextShape(primaryShape.id, nextSpec)}
                  />
                )}

              {primaryShape.derivedFrom && (
                <div className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-2 py-1">
                  Copia vinculada (estilo GeoGebra). Mueve la figura original o su guía, o pulsa{' '}
                  <button
                    type="button"
                    onClick={() => onUnlinkShape(primaryShape.id)}
                    className="underline font-semibold cursor-pointer"
                  >
                    Desvincular
                  </button>{' '}
                  para editarla aparte.
                </div>
              )}

              {/* Quick Nudge */}
              {!primaryShape.derivedFrom && (
                <div className="flex items-center justify-between text-[10px] text-slate-600">
                  <span>Mover preciso ({grid.step || 0.5} cm):</span>
                  <div className="flex items-center gap-0.5">
                    {(() => {
                      const d = grid.step || 0.5;
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => onTranslateSelected(-d, 0)}
                            className="px-1.5 py-0.5 bg-white border border-slate-200 rounded hover:bg-slate-100 cursor-pointer"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => onTranslateSelected(0, d)}
                            className="px-1.5 py-0.5 bg-white border border-slate-200 rounded hover:bg-slate-100 cursor-pointer"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => onTranslateSelected(0, -d)}
                            className="px-1.5 py-0.5 bg-white border border-slate-200 rounded hover:bg-slate-100 cursor-pointer"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => onTranslateSelected(d, 0)}
                            className="px-1.5 py-0.5 bg-white border border-slate-200 rounded hover:bg-slate-100 cursor-pointer"
                          >
                            →
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Paint Fill Color Palette */}
              {selectedShapes.some((s) => isShapeFillable(s)) && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-slate-600">
                      Color de pintura (vista previa)
                    </span>
                    {viewMode === 'laser' && (
                      <span className="text-[9px] text-rose-600 font-medium">
                        Oculto en Vista Láser
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PAINT_PALETTE.map((swatch) => {
                      const isActive = primaryShape.fillColor === swatch.color;
                      return (
                        <button
                          key={swatch.color}
                          type="button"
                          onClick={() =>
                            onChangeShapeFill(
                              selectedShapes.map((s) => s.id),
                              swatch.color
                            )
                          }
                          title={swatch.label}
                          className={`w-5 h-5 rounded-full border transition cursor-pointer ${
                            isActive
                              ? 'ring-2 ring-indigo-600 ring-offset-1 border-slate-400'
                              : 'border-slate-300 hover:scale-110'
                          }`}
                          style={{
                            background:
                              swatch.color === 'none'
                                ? 'linear-gradient(135deg, #fff 45%, #ef4444 45%, #ef4444 55%, #fff 55%)'
                                : swatch.color,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* GeoGebra-style Algebra & Transformations Panel */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-200">
        {/* Section 1: Isometric Transformations */}
        <div>
          <button
            type="button"
            onClick={() => setOpenTransforms((v) => !v)}
            className="w-full px-3 py-2 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 text-xs font-bold text-slate-800 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              {openTransforms ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
              Transformaciones (GeoGebra)
            </span>
            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">
              {transforms.length}
            </span>
          </button>

          {openTransforms && (
            <div className="p-2 space-y-1.5">
              {transforms.length === 0 ? (
                <p className="text-[11px] text-slate-400 px-1 py-2 text-center">
                  Aún no aplicas transformaciones isométricas. Usa Simetría, Rotación, Rosetón o Traslación.
                </p>
              ) : (
                transforms.map((tr) => (
                  <div
                    key={tr.id}
                    className="p-2 rounded-lg border border-slate-200 bg-white hover:border-emerald-300 transition space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-start gap-1.5 min-w-0">
                        <div className="mt-0.5">
                          <TransformIcon type={tr.params.type} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-slate-800 truncate">
                            {tr.name}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono break-words">
                            {tr.summary}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleTransformVisible(tr.id)}
                          className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
                          title={tr.visible ? 'Ocultar resultado' : 'Mostrar resultado'}
                        >
                          {tr.visible ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTransform(tr.id)}
                          className="p-1 rounded hover:bg-rose-50 text-rose-500 cursor-pointer"
                          title="Borrar esta transformación y sus copias"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Quick parameter editor */}
                    {tr.params.type === 'rotation' && (
                      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 text-[10px]">
                        <span className="text-slate-500">Ángulo:</span>
                        <input
                          type="number"
                          step={15}
                          value={tr.params.angleDeg ?? 90}
                          onChange={(e) =>
                            onUpdateTransformParam(tr.id, {
                              angleDeg: Number(e.target.value),
                            })
                          }
                          className="w-14 px-1 py-0.5 border border-slate-200 rounded text-center font-medium"
                        />
                        <span className="text-slate-500">°</span>
                      </div>
                    )}
                    {tr.params.type === 'rosette' && (
                      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 text-[10px]">
                        <span className="text-slate-500">Copias totales:</span>
                        <input
                          type="number"
                          min={2}
                          max={24}
                          value={tr.params.copies ?? 6}
                          onChange={(e) =>
                            onUpdateTransformParam(tr.id, {
                              copies: Math.max(2, Math.min(24, Number(e.target.value) || 6)),
                            })
                          }
                          className="w-14 px-1 py-0.5 border border-slate-200 rounded text-center font-medium"
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Section 2: Geometric References */}
        <div>
          <button
            type="button"
            onClick={() => setOpenRefs((v) => !v)}
            className="w-full px-3 py-2 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 text-xs font-bold text-slate-800 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              {openRefs ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
              Guías y Referencias (No láser)
            </span>
            <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
              {refs.length}
            </span>
          </button>

          {openRefs && (
            <div className="p-2 space-y-1">
              {refs.length === 0 ? (
                <p className="text-[11px] text-slate-400 px-1 py-2 text-center">
                  Sin puntos, rectas ni vectores guía.
                </p>
              ) : (
                refs.map((ref) => {
                  const isSel = selectedRefId === ref.id;
                  let desc = '';
                  if (ref.kind === 'point') {
                    desc = `(${formatNum(ref.x)}, ${formatNum(ref.y)})`;
                  } else if (ref.kind === 'line') {
                    desc = `(${formatNum(ref.p1.x)},${formatNum(ref.p1.y)})–(${formatNum(ref.p2.x)},${formatNum(ref.p2.y)})`;
                  } else {
                    desc = `Δ(${formatNum(ref.to.x - ref.from.x)}, ${formatNum(ref.to.y - ref.from.y)})`;
                  }

                  return (
                    <div
                      key={ref.id}
                      onClick={() => onSelectRef(ref.id)}
                      className={`px-2 py-1.5 rounded-lg border flex items-center justify-between gap-1.5 cursor-pointer transition ${
                        isSel
                          ? 'border-amber-400 bg-amber-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: ref.color }}
                        />
                        <span className="text-[11px] font-bold text-slate-800 shrink-0">
                          {ref.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono truncate">
                          = {desc}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleRefVisible(ref.id);
                          }}
                          className="p-1 rounded hover:bg-slate-200/70 text-slate-500 cursor-pointer"
                        >
                          {ref.visible ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteRef(ref.id);
                          }}
                          className="p-1 rounded hover:bg-rose-50 text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Section 3: Base Shapes */}
        <div>
          <button
            type="button"
            onClick={() => setOpenShapes((v) => !v)}
            className="w-full px-3 py-2 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 text-xs font-bold text-slate-800 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              {openShapes ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
              Figuras de Grabado
            </span>
            <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded-full">
              {baseShapes.length}
            </span>
          </button>

          {openShapes && (
            <div className="p-2 space-y-1">
              {baseShapes.length >= 2 && (
                <div className="flex items-center justify-between px-1 pb-1 text-[10px] text-slate-500">
                  <span>Arrastra en lienzo o Shift+clic</span>
                  <button
                    type="button"
                    onClick={onSelectAllShapes}
                    className="font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    Selec. todas
                  </button>
                </div>
              )}
              {baseShapes.length === 0 ? (
                <p className="text-[11px] text-slate-400 px-1 py-2 text-center">
                  Dibuja o inserta una forma desde la barra izquierda.
                </p>
              ) : (
                baseShapes.map((shape) => {
                  const isSel = selectedShapeIds.includes(shape.id);
                  const isGroup = shape.kind === 'group' && (shape.children?.length ?? 0) > 0;
                  const isExpanded = Boolean(expandedGroups[shape.id]);
                  return (
                    <div key={shape.id} className="space-y-1">
                      <div
                        onClick={(e) => onSelectShape(shape.id, e.shiftKey)}
                        className={`px-2 py-1.5 rounded-lg border flex items-center justify-between gap-1.5 cursor-pointer transition ${
                          isSel
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isGroup ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedGroups((prev) => ({
                                  ...prev,
                                  [shape.id]: !prev[shape.id],
                                }));
                              }}
                              className="p-0.5 rounded hover:bg-slate-200/70 text-indigo-600 cursor-pointer shrink-0"
                              title={isExpanded ? 'Contraer bloque' : 'Ver elementos del bloque'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                            </button>
                          ) : null}
                          {isGroup ? (
                            <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          ) : (
                            <span
                              className="w-2.5 h-2.5 rounded-xs border border-slate-400 shrink-0"
                              style={{
                                backgroundColor:
                                  shape.fillColor && shape.fillColor !== 'none'
                                    ? shape.fillColor
                                    : '#ffffff',
                              }}
                            />
                          )}
                          <span className="text-[11px] font-medium text-slate-800 truncate">
                            {shape.name}
                          </span>
                          {isGroup && (
                            <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded-full shrink-0">
                              {shape.children?.length}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleShapeVisible(shape.id);
                            }}
                            className="p-1 rounded hover:bg-slate-200/70 text-slate-500 cursor-pointer"
                          >
                            {shape.visible ? (
                              <Eye className="w-3.5 h-3.5" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteShapes([shape.id]);
                            }}
                            className="p-1 rounded hover:bg-rose-50 text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {isGroup && isExpanded && shape.children && (
                        <div className="ml-4 pl-2 border-l-2 border-indigo-100 space-y-0.5">
                          {shape.children.map((ch) => (
                            <div
                              key={ch.id}
                              className="px-2 py-0.5 rounded bg-slate-50 text-[10px] text-slate-600 flex items-center justify-between"
                            >
                              <span className="truncate">{ch.name}</span>
                              {ch.kind === 'group' && ch.children && (
                                <span className="text-[9px] text-slate-400">
                                  ({ch.children.length})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

const RefPointEditor: React.FC<{
  point: RefPoint;
  onChange: (x: number, y: number) => void;
  onDelete: () => void;
}> = ({ point, onChange, onDelete }) => {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-amber-900">
          Punto guía {point.name}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
          title="Eliminar punto"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-1 text-xs">
          <span className="font-semibold text-slate-500">X:</span>
          <input
            type="number"
            step={0.5}
            value={point.x}
            onChange={(e) => onChange(Number(e.target.value) || 0, point.y)}
            className="w-full text-slate-800 font-mono focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-1 text-xs">
          <span className="font-semibold text-slate-500">Y:</span>
          <input
            type="number"
            step={0.5}
            value={point.y}
            onChange={(e) => onChange(point.x, Number(e.target.value) || 0)}
            className="w-full text-slate-800 font-mono focus:outline-none"
          />
        </label>
      </div>
    </div>
  );
};

const TextInspectorEditor: React.FC<{
  shapeId: string;
  spec: TextSpec;
  onChange: (next: TextSpec) => void;
}> = ({ shapeId, spec, onChange }) => {
  const [draftText, setDraftText] = useState(spec.text);

  useEffect(() => {
    setDraftText(spec.text);
  }, [shapeId, spec.text]);

  const commitText = () => {
    if (draftText.trim() && draftText !== spec.text) {
      onChange({ ...spec, text: draftText });
    }
  };

  return (
    <div className="p-2 rounded-lg bg-white border border-indigo-200 space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-800">
        <Type className="w-3 h-3" />
        <span>Texto y Fuente</span>
      </div>
      <div className="flex gap-1">
        <input
          type="text"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitText();
            }
          }}
          className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={commitText}
          className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-semibold cursor-pointer shrink-0"
        >
          Aplicar
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <select
          value={spec.fontId}
          onChange={(e) =>
            onChange({ ...spec, text: draftText || spec.text, fontId: e.target.value as FontId })
          }
          className="col-span-2 px-1.5 py-1 text-[11px] bg-white border border-slate-200 rounded-md text-slate-800"
        >
          {FONT_DEFINITIONS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 px-1.5 py-1 bg-white border border-slate-200 rounded-md text-[11px]">
          <input
            type="number"
            min={0.5}
            max={12}
            step={0.25}
            value={spec.fontSizeCm}
            onChange={(e) =>
              onChange({
                ...spec,
                text: draftText || spec.text,
                fontSizeCm: Math.max(0.5, Math.min(12, Number(e.target.value) || 2)),
              })
            }
            className="w-full text-center font-mono text-slate-800 focus:outline-none"
            title="Altura de letra (cm)"
          />
          <span className="text-[10px] text-slate-400">cm</span>
        </label>
      </div>
    </div>
  );
};
