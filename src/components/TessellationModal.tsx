import React, { useMemo, useState } from 'react';
import { Info, LayoutGrid, X } from 'lucide-react';
import { BoardConfig, TessellationId, TessellationSpec } from '../types/geometry';
import {
  generateTessellationSpec,
  TESSELLATION_CATALOG,
  TESSELLATION_MAP,
  TessellationCategory,
} from '../utils/tessellations';

interface TessellationModalProps {
  open: boolean;
  board: BoardConfig;
  onClose: () => void;
  onInsert: (
    spec: TessellationSpec,
    centerX: number,
    centerY: number,
    displayName: string
  ) => void;
}

const CATEGORY_TABS: { id: 'all' | TessellationCategory; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'regular', label: 'Regulares (1)' },
  { id: 'combo2', label: 'Combinadas (2)' },
  { id: 'combo3', label: 'Combinadas (3)' },
  { id: 'especial', label: 'Pentagonal / 3D' },
];

export const TessellationModal: React.FC<TessellationModalProps> = ({
  open,
  board,
  onClose,
  onInsert,
}) => {
  const [selectedId, setSelectedId] = useState<TessellationId>('octagons-squares');
  const [category, setCategory] = useState<'all' | TessellationCategory>('all');
  const [widthCm, setWidthCm] = useState<number>(
    Math.min(10, Math.max(4, board.widthCm / 2))
  );
  const [heightCm, setHeightCm] = useState<number>(
    Math.min(10, Math.max(4, board.heightCm / 2))
  );
  const [cellSizeCm, setCellSizeCm] = useState<number>(1.5);
  const [centerX, setCenterX] = useState<number>(0);
  const [centerY, setCenterY] = useState<number>(0);
  const [includeBorder, setIncludeBorder] = useState<boolean>(true);
  const [autoColor, setAutoColor] = useState<boolean>(true);

  const filteredCatalog = useMemo(
    () =>
      category === 'all'
        ? TESSELLATION_CATALOG
        : TESSELLATION_CATALOG.filter((t) => t.category === category),
    [category]
  );

  // Small thumbnail previews (fixed 6x6 cm sample)
  const thumbnails = useMemo(() => {
    const map: Record<string, TessellationSpec> = {};
    for (const item of TESSELLATION_CATALOG) {
      map[item.id] = generateTessellationSpec(item.id, 6, 6, 1.35, false, true);
    }
    return map;
  }, []);

  // Live clipped preview at the exact requested dimensions
  const liveSpec = useMemo(
    () =>
      generateTessellationSpec(
        selectedId,
        Math.max(2, Math.min(board.widthCm, widthCm)),
        Math.max(2, Math.min(board.heightCm, heightCm)),
        cellSizeCm,
        includeBorder,
        autoColor
      ),
    [
      selectedId,
      widthCm,
      heightCm,
      board.widthCm,
      board.heightCm,
      cellSizeCm,
      includeBorder,
      autoColor,
    ]
  );

  if (!open) return null;

  const selectedMeta = TESSELLATION_MAP[selectedId];

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Generador de Teselaciones Geométricas
              </h2>
              <p className="text-[11px] text-slate-500">
                Elige el área exacta (ej. 10 × 10 cm) y combina polígonos que sumen 360° en cada vértice
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 grid md:grid-cols-[1.35fr_1fr] gap-4">
          {/* Left: Catalog */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategory(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border ${
                    category === tab.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
              {filteredCatalog.map((item) => {
                const thumb = thumbnails[item.id];
                const isSelected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`p-2 rounded-xl border text-left transition flex flex-col gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-200'
                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-full aspect-square bg-white rounded-lg border border-slate-200 overflow-hidden">
                      <svg viewBox="-3 -3 6 6" className="w-full h-full">
                        <g transform="scale(1,-1)">
                          {thumb?.tiles.map((t, idx) => (
                            <polygon
                              key={idx}
                              points={t.points.map((p) => `${p.x},${p.y}`).join(' ')}
                              fill={t.fillColor}
                              fillOpacity={0.8}
                              stroke="#0f172a"
                              strokeWidth={0.07}
                              strokeLinejoin="round"
                            />
                          ))}
                        </g>
                      </svg>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-slate-900 leading-tight">
                        {item.name}
                      </div>
                      <div className="text-[10px] font-mono text-indigo-700 mt-0.5">
                        {item.angleFormula}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Educational Note on Irregular / Non-tiling Polygons */}
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-[11px] text-amber-900">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>¿Por qué combinamos figuras?</strong> Para que una teselación sea perfecta sin huecos, los ángulos alrededor de cada vértice deben sumar <strong>360°</strong>. Polígonos como el pentágono regular (108°) o el heptágono (~128.6°) no dividen 360° por sí solos, por eso usamos <strong>combinaciones de 2 o 3 figuras</strong> (o el pentágono de El Cairo).
              </div>
            </div>
          </div>

          {/* Right: Dimensions & Live Preview */}
          <div className="space-y-3 flex flex-col">
            {/* Live Preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center gap-2">
              <div className="w-full flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-800">
                  {selectedMeta.name} {selectedMeta.notation}
                </span>
                <span className="text-slate-500 font-mono">
                  {liveSpec.tiles.length} piezas
                </span>
              </div>

              <div className="w-48 h-48 bg-white border border-slate-300 rounded-lg shadow-inner flex items-center justify-center p-1.5">
                <svg
                  viewBox={`${-liveSpec.widthCm / 2 - 0.3} ${-liveSpec.heightCm / 2 - 0.3} ${liveSpec.widthCm + 0.6} ${liveSpec.heightCm + 0.6}`}
                  className="w-full h-full"
                >
                  <g transform="scale(1,-1)">
                    {liveSpec.tiles.map((t, idx) => (
                      <polygon
                        key={idx}
                        points={t.points.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill={liveSpec.autoColor ? t.fillColor : 'none'}
                        fillOpacity={0.75}
                        stroke="#0f172a"
                        strokeWidth={Math.max(0.04, liveSpec.widthCm * 0.006)}
                        strokeLinejoin="round"
                      />
                    ))}
                    {liveSpec.includeBorder && (
                      <rect
                        x={-liveSpec.widthCm / 2}
                        y={-liveSpec.heightCm / 2}
                        width={liveSpec.widthCm}
                        height={liveSpec.heightCm}
                        fill="none"
                        stroke="#0f172a"
                        strokeWidth={Math.max(0.06, liveSpec.widthCm * 0.008)}
                      />
                    )}
                  </g>
                </svg>
              </div>

              <p className="text-[11px] text-slate-600 text-center leading-snug">
                {selectedMeta.description}
              </p>
            </div>

            {/* Dimension Config */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 text-xs">
              <div className="font-bold text-slate-800">
                Margen y tamaño de la teselación
              </div>

              <div className="flex flex-wrap gap-1">
                {[
                  { label: '8×8', w: 8, h: 8 },
                  { label: '10×10', w: 10, h: 10 },
                  { label: '15×15', w: 15, h: 15 },
                  {
                    label: `Tablero (${board.widthCm}×${board.heightCm})`,
                    w: board.widthCm,
                    h: board.heightCm,
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setWidthCm(preset.w);
                      setHeightCm(preset.h);
                    }}
                    className={`px-2 py-0.5 rounded border text-[11px] font-medium cursor-pointer ${
                      widthCm === preset.w && heightCm === preset.h
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                  Ancho área (cm)
                  <input
                    type="number"
                    min={2}
                    max={board.widthCm}
                    step={0.5}
                    value={widthCm}
                    onChange={(e) =>
                      setWidthCm(Math.max(2, Number(e.target.value) || 10))
                    }
                    className="border border-slate-300 rounded-md px-2 py-1 text-slate-800 font-semibold"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                  Alto área (cm)
                  <input
                    type="number"
                    min={2}
                    max={board.heightCm}
                    step={0.5}
                    value={heightCm}
                    onChange={(e) =>
                      setHeightCm(Math.max(2, Number(e.target.value) || 10))
                    }
                    className="border border-slate-300 rounded-md px-2 py-1 text-slate-800 font-semibold"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                  Centro X (cm)
                  <input
                    type="number"
                    step={0.5}
                    value={centerX}
                    onChange={(e) => setCenterX(Number(e.target.value) || 0)}
                    className="border border-slate-300 rounded-md px-2 py-1 text-slate-800 font-semibold"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                  Centro Y (cm)
                  <input
                    type="number"
                    step={0.5}
                    value={centerY}
                    onChange={(e) => setCenterY(Number(e.target.value) || 0)}
                    className="border border-slate-300 rounded-md px-2 py-1 text-slate-800 font-semibold"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                <div className="flex justify-between">
                  <span>Tamaño de cada polígono (lado):</span>
                  <strong className="text-indigo-700">{cellSizeCm} cm</strong>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={3.5}
                  step={0.1}
                  value={cellSizeCm}
                  onChange={(e) => setCellSizeCm(Number(e.target.value))}
                  className="accent-indigo-600"
                />
              </label>

              <div className="flex flex-col gap-1.5 pt-1">
                <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeBorder}
                    onChange={(e) => setIncludeBorder(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  Incluir marco rectangular de {widthCm} × {heightCm} cm (grabado)
                </label>
                <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoColor}
                    onChange={(e) => setAutoColor(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  Colorear polígonos en Vista Pintura
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Al exportar SVG Láser, las líneas compartidas se optimizan para no grabarse doble.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onInsert(
                  liveSpec,
                  centerX,
                  centerY,
                  `Teselación ${selectedMeta.name} (${liveSpec.widthCm}×${liveSpec.heightCm})`
                );
                onClose();
              }}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
            >
              Insertar Teselación
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
