import React, { useEffect, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Type, X } from 'lucide-react';
import { FontId, TextSpec } from '../types/geometry';
import { formatNum } from '../utils/math2d';
import {
  FONT_DEFINITIONS,
  generateTextLocalPathsAsync,
  preloadAllFonts,
} from '../utils/textFonts';

interface TextModalProps {
  open: boolean;
  initialCenter: { x: number; y: number };
  onClose: () => void;
  onInsert: (
    spec: TextSpec,
    localPaths: string[],
    centerX: number,
    centerY: number
  ) => void;
}

export const TextModal: React.FC<TextModalProps> = ({
  open,
  initialCenter,
  onClose,
  onInsert,
}) => {
  const [text, setText] = useState('Taller Isométrico');
  const [fontId, setFontId] = useState<FontId>('montserrat');
  const [fontSizeCm, setFontSizeCm] = useState<number>(2);
  const [letterSpacingCm, setLetterSpacingCm] = useState<number>(0);
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('center');
  const [centerX, setCenterX] = useState<number>(initialCenter.x);
  const [centerY, setCenterY] = useState<number>(initialCenter.y);

  const [previewData, setPreviewData] = useState<{
    localPaths: string[];
    widthCm: number;
    heightCm: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      preloadAllFonts();
      setCenterX(initialCenter.x);
      setCenterY(initialCenter.y);
    }
  }, [open, initialCenter.x, initialCenter.y]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (!text.trim()) {
      setPreviewData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    generateTextLocalPathsAsync({
      text,
      fontId,
      fontSizeCm,
      letterSpacingCm,
      align,
    })
      .then((res) => {
        if (cancelled) return;
        setPreviewData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'No se pudo generar el texto.'
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, text, fontId, fontSizeCm, letterSpacingCm, align]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (!text.trim()) return;
    const spec: TextSpec = {
      text,
      fontId,
      fontSizeCm,
      letterSpacingCm,
      align,
    };
    const res = previewData ?? (await generateTextLocalPathsAsync(spec));
    if (!res) return;
    onInsert(spec, res.localPaths, centerX, centerY);
    onClose();
  };

  const pvW = Math.max(4, (previewData?.widthCm ?? 4) + 1);
  const pvH = Math.max(2.5, (previewData?.heightCm ?? 2) + 1);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Insertar Texto Vectorial (Para Pintura y Láser)
              </h2>
              <p className="text-[11px] text-slate-500">
                Se convierte en contornos reales para grabar, rellenar, cortar o transformar isométricamente
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
        <div className="p-5 overflow-y-auto custom-scrollbar space-y-4 text-xs">
          {/* Text Input */}
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              Texto (puedes usar varias líneas con Enter)
            </label>
            <textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribe una palabra, nombre o frase..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Font Selector */}
          <div>
            <label className="block font-bold text-slate-800 mb-1.5">
              Elige una fuente tipográfica ({FONT_DEFINITIONS.length} estilos)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {FONT_DEFINITIONS.map((f) => {
                const isActive = fontId === f.id;
                const sampleText = text.trim().split(/\r?\n/)[0]?.slice(0, 16) || 'Diseño';
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFontId(f.id)}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                      isActive
                        ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className="text-base text-slate-900 truncate leading-snug"
                      style={{ fontFamily: `"${f.cssFamily}", sans-serif` }}
                    >
                      {sampleText}
                    </div>
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="font-semibold text-slate-700 truncate">
                        {f.label}
                      </span>
                      <span className="text-slate-400 shrink-0">{f.styleTag}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sizing, Spacing, Align & Position */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Altura (cm)</span>
              <input
                type="number"
                min={0.5}
                max={12}
                step={0.25}
                value={fontSizeCm}
                onChange={(e) =>
                  setFontSizeCm(
                    Math.max(0.5, Math.min(12, Number(e.target.value) || 2))
                  )
                }
                className="px-2 py-1 bg-white border border-slate-300 rounded-lg font-mono text-slate-800"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Espaciado (cm)</span>
              <input
                type="number"
                min={-0.1}
                max={1}
                step={0.05}
                value={letterSpacingCm}
                onChange={(e) =>
                  setLetterSpacingCm(
                    Math.max(-0.1, Math.min(1, Number(e.target.value) || 0))
                  )
                }
                className="px-2 py-1 bg-white border border-slate-300 rounded-lg font-mono text-slate-800"
              />
            </label>

            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Alineación</span>
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5">
                {(
                  [
                    { id: 'left', icon: <AlignLeft className="w-3.5 h-3.5" /> },
                    { id: 'center', icon: <AlignCenter className="w-3.5 h-3.5" /> },
                    { id: 'right', icon: <AlignRight className="w-3.5 h-3.5" /> },
                  ] as const
                ).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAlign(a.id)}
                    className={`flex-1 py-1 rounded flex items-center justify-center cursor-pointer ${
                      align === a.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {a.icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Centro (cm)</span>
              <div className="grid grid-cols-2 gap-1">
                <input
                  type="number"
                  step={0.5}
                  value={centerX}
                  onChange={(e) => setCenterX(Number(e.target.value) || 0)}
                  className="px-1.5 py-1 bg-white border border-slate-300 rounded-lg font-mono text-center text-slate-800"
                  title="Posición X (cm)"
                />
                <input
                  type="number"
                  step={0.5}
                  value={centerY}
                  onChange={(e) => setCenterY(Number(e.target.value) || 0)}
                  className="px-1.5 py-1 bg-white border border-slate-300 rounded-lg font-mono text-center text-slate-800"
                  title="Posición Y (cm)"
                />
              </div>
            </div>
          </div>

          {/* Live Vector Preview */}
          <div className="border border-slate-200 rounded-xl bg-slate-50/80 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
              <span className="font-semibold text-slate-700">
                Vista previa de contorno vectorial
              </span>
              {previewData && (
                <span>
                  Tamaño real: {formatNum(previewData.widthCm)} ×{' '}
                  {formatNum(previewData.heightCm)} cm
                </span>
              )}
            </div>
            <div className="h-28 w-full bg-white border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
              {loading ? (
                <span className="text-slate-400">Generando trazos vectoriales...</span>
              ) : error ? (
                <span className="text-rose-600">{error}</span>
              ) : previewData ? (
                <svg
                  viewBox={`${-pvW / 2} ${-pvH / 2} ${pvW} ${pvH}`}
                  className="w-full h-full"
                >
                  <g transform="scale(1,-1)">
                    {previewData.localPaths.map((d, i) => (
                      <path
                        key={i}
                        d={d}
                        fill="rgba(79, 70, 229, 0.12)"
                        fillRule="evenodd"
                        stroke="#0f172a"
                        strokeWidth={0.04}
                        strokeLinejoin="round"
                      />
                    ))}
                  </g>
                </svg>
              ) : (
                <span className="text-slate-400">Escribe algo arriba para previsualizar</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!previewData || loading}
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer shadow-xs"
          >
            Insertar texto
          </button>
        </div>
      </div>
    </div>
  );
};
