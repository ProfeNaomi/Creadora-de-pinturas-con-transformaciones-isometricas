import React, { useRef } from 'react';
import {
  Download,
  Eye,
  FileDown,
  FileUp,
  HelpCircle,
  Image as ImageIcon,
  Redo2,
  Scissors,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { BoardConfig, BorderShape, ViewMode } from '../types/geometry';

interface TopBarProps {
  board: BoardConfig;
  onChangeBoard: (next: BoardConfig) => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExportLaserSvg: () => void;
  onExportPaintPng: () => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
  onOpenHelp: () => void;
  onClearAll: () => void;
}

const SIZE_PRESETS = [
  { label: '10 × 10 cm', w: 10, h: 10 },
  { label: '15 × 15 cm', w: 15, h: 15 },
  { label: '20 × 20 cm', w: 20, h: 20 },
  { label: '25 × 25 cm', w: 25, h: 25 },
  { label: '30 × 30 cm', w: 30, h: 30 },
];

export const TopBar: React.FC<TopBarProps> = ({
  board,
  onChangeBoard,
  viewMode,
  onChangeViewMode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExportLaserSvg,
  onExportPaintPng,
  onSaveProject,
  onLoadProject,
  onOpenHelp,
  onClearAll,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPresetValue = SIZE_PRESETS.some(
    (p) => p.w === board.widthCm && p.h === board.heightCm
  )
    ? `${board.widthCm}x${board.heightCm}`
    : 'custom';

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-3 flex items-center justify-between gap-2 shrink-0 shadow-xs z-20">
      {/* Brand */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-xs shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="leading-tight hidden sm:block">
          <h1 className="text-sm font-bold text-slate-900 tracking-tight truncate">
            Taller Isométrico
          </h1>
          <p className="text-[11px] text-slate-500 truncate">
            Arte, Simetrías y Corte Láser
          </p>
        </div>
      </div>

      {/* Board size & border config */}
      <div className="flex items-center gap-1.5 bg-slate-100/80 px-2 py-1 rounded-lg border border-slate-200/80">
        <label className="text-[11px] font-medium text-slate-600 hidden md:inline">
          Madera:
        </label>
        <select
          value={currentPresetValue}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'custom') return;
            const [w, h] = val.split('x').map(Number);
            onChangeBoard({ ...board, widthCm: w, heightCm: h });
          }}
          className="text-xs font-semibold bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title="Tamaño físico del tablero en centímetros"
        >
          {SIZE_PRESETS.map((p) => (
            <option key={p.label} value={`${p.w}x${p.h}`}>
              {p.label}
            </option>
          ))}
          <option value="custom">Personalizado</option>
        </select>

        <div className="flex items-center gap-1 text-xs">
          <input
            type="number"
            min={5}
            max={100}
            step={1}
            value={board.widthCm}
            onChange={(e) => {
              const v = Math.max(5, Math.min(100, Number(e.target.value) || 20));
              onChangeBoard({ ...board, widthCm: v });
            }}
            className="w-12 bg-white border border-slate-200 rounded px-1.5 py-1 text-center font-medium text-slate-700"
            title="Ancho (cm)"
          />
          <span className="text-slate-400">×</span>
          <input
            type="number"
            min={5}
            max={100}
            step={1}
            value={board.heightCm}
            onChange={(e) => {
              const v = Math.max(5, Math.min(100, Number(e.target.value) || 20));
              onChangeBoard({ ...board, heightCm: v });
            }}
            className="w-12 bg-white border border-slate-200 rounded px-1.5 py-1 text-center font-medium text-slate-700"
            title="Alto (cm)"
          />
          <span className="text-[11px] text-slate-500 hidden lg:inline">cm</span>
        </div>

        <div className="h-4 w-px bg-slate-300 mx-0.5" />

        <select
          value={board.borderShape}
          onChange={(e) =>
            onChangeBoard({ ...board, borderShape: e.target.value as BorderShape })
          }
          className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title="Forma de la línea de corte exterior"
        >
          <option value="rect">Borde cuadrado</option>
          <option value="rounded">Esquinas redondeadas</option>
          <option value="circle">Borde circular</option>
        </select>

        <label
          className="flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer pl-1 pr-1.5 select-none"
          title="Agregar perforación de corte en la parte superior para colgar"
        >
          <input
            type="checkbox"
            checked={board.hangingHole}
            onChange={(e) =>
              onChangeBoard({ ...board, hangingHole: e.target.checked })
            }
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="hidden xl:inline">Colgar</span>
        </label>
      </div>

      {/* View Mode Switch */}
      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
        <button
          onClick={() => onChangeViewMode('paint')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
            viewMode === 'paint'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Muestra colores de relleno para imaginar tu pintura"
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Vista Pintura</span>
        </button>
        <button
          onClick={() => onChangeViewMode('laser')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
            viewMode === 'laser'
              ? 'bg-white text-rose-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Muestra exactamente qué se corta (rojo) y qué se graba (negro)"
        >
          <Scissors className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Vista Láser</span>
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-white transition"
            title="Deshacer (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-white transition"
            title="Rehacer (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLoadProject(file);
            e.target.value = '';
          }}
        />

        <button
          onClick={onSaveProject}
          className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 transition"
          title="Guardar proyecto editable (.json)"
        >
          <FileDown className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Guardar</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 transition"
          title="Abrir proyecto guardado (.json)"
        >
          <FileUp className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Abrir</span>
        </button>

        <button
          onClick={onExportPaintPng}
          className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 transition"
          title="Descargar imagen PNG de referencia a color"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">PNG</span>
        </button>

        <button
          onClick={onExportLaserSvg}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1.5 shadow-xs transition cursor-pointer"
          title="Exportar archivo SVG en milímetros listo para cortadora láser (Rojo = Corte borde, Negro = Grabado)"
        >
          <Download className="w-3.5 h-3.5" />
          <span>SVG Láser</span>
        </button>

        <button
          onClick={onClearAll}
          className="px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition hidden xl:inline-flex"
          title="Limpiar lienzo"
        >
          Nuevo
        </button>

        <button
          onClick={onOpenHelp}
          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
          title="Guía rápida para estudiantes y láser"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
