import React, { useState } from 'react';
import {
  ArrowRight,
  Circle,
  Combine,
  Compass,
  Dot,
  Eraser,
  FlipHorizontal2,
  Group,
  Hand,
  Hexagon,
  LayoutGrid,
  Minus,
  MousePointer2,
  Move,
  Pencil,
  PenTool,
  Plus,
  RefreshCw,
  RotateCw,
  Scissors,
  Shapes,
  Slash,
  Sparkles,
  Spline,
  Split,
  Type,
  Ungroup,
} from 'lucide-react';
import { PresetId, ToolId } from '../types/geometry';
import { PRESET_LIST, PresetCategory } from '../utils/presets';

interface LeftToolbarProps {
  activeTool: ToolId;
  onSelectTool: (tool: ToolId) => void;
  activePreset: PresetId;
  onSelectPreset: (preset: PresetId) => void;
  polygonSides: number;
  onChangePolygonSides: (sides: number) => void;
  onQuickAddAxis: (kind: 'x' | 'y' | 'diag1' | 'diag2' | 'origin') => void;
  onOpenTessellations: () => void;
  canGroup: boolean;
  canUngroup: boolean;
  canJoin: boolean;
  canSplit: boolean;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onJoinSelected: () => void;
  onSplitSelected: () => void;
}

interface ToolButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
  accent?: 'indigo' | 'amber' | 'emerald' | 'rose' | 'violet';
}

const ToolButton: React.FC<ToolButtonProps> = ({
  active,
  onClick,
  icon,
  label,
  title,
  accent = 'indigo',
}) => {
  const activeStyles = {
    indigo: 'bg-indigo-600 text-white shadow-xs',
    amber: 'bg-amber-500 text-white shadow-xs',
    emerald: 'bg-emerald-600 text-white shadow-xs',
    rose: 'bg-rose-600 text-white shadow-xs',
    violet: 'bg-violet-600 text-white shadow-xs',
  }[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-full px-1.5 py-1.5 rounded-lg flex flex-col items-center justify-center gap-0.5 transition text-[10px] font-medium leading-tight cursor-pointer ${
        active
          ? activeStyles
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {icon}
      <span className="truncate max-w-full">{label}</span>
    </button>
  );
};

export const LeftToolbar: React.FC<LeftToolbarProps> = ({
  activeTool,
  onSelectTool,
  activePreset,
  onSelectPreset,
  polygonSides,
  onChangePolygonSides,
  onQuickAddAxis,
  onOpenTessellations,
  canGroup,
  canUngroup,
  canJoin,
  canSplit,
  onGroupSelected,
  onUngroupSelected,
  onJoinSelected,
  onSplitSelected,
}) => {
  const [showPresets, setShowPresets] = useState(false);
  const [presetCat, setPresetCat] = useState<'all' | PresetCategory>('all');
  const [showPolygonMenu, setShowPolygonMenu] = useState(false);
  const [showQuickAxes, setShowQuickAxes] = useState(false);

  const visiblePresets =
    presetCat === 'all'
      ? PRESET_LIST
      : PRESET_LIST.filter((p) => p.category === presetCat);

  return (
    <aside className="w-[78px] bg-white border-r border-slate-200 flex flex-col py-2 px-1.5 gap-2 overflow-y-auto custom-scrollbar shrink-0 z-10 relative">
      {/* Navigation & Edit */}
      <div className="flex flex-col gap-1">
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">
          Edición
        </div>
        <ToolButton
          active={activeTool === 'select'}
          onClick={() => onSelectTool('select')}
          icon={<MousePointer2 className="w-4 h-4" />}
          label="Mover"
          title="Seleccionar, mover, escalar y rotar figuras (V)"
        />
        <ToolButton
          active={activeTool === 'pan'}
          onClick={() => onSelectTool('pan')}
          icon={<Hand className="w-4 h-4" />}
          label="Mano"
          title="Desplazar la vista del lienzo (también con Espacio + arrastrar)"
        />
        <ToolButton
          active={activeTool === 'trim'}
          onClick={() => onSelectTool('trim')}
          icon={<Scissors className="w-4 h-4" />}
          label="Recortar"
          title="Tijeras: borra solo el tramo entre intersecciones (ej. parte de un círculo que se cruza) (T)"
          accent="rose"
        />
        <ToolButton
          active={activeTool === 'eraser'}
          onClick={() => onSelectTool('eraser')}
          icon={<Eraser className="w-4 h-4" />}
          label="Borrar"
          title="Haz clic sobre cualquier figura o referencia para borrarla completa (E)"
          accent="rose"
        />
      </div>

      <div className="h-px bg-slate-200 mx-1" />

      {/* Block & Path Unification Actions */}
      <div className="flex flex-col gap-1">
        <div className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 text-center">
          Bloques
        </div>
        <button
          type="button"
          onClick={onGroupSelected}
          title="Agrupar líneas o figuras seleccionadas en un bloque conjunto (Ctrl+G)"
          className={`w-full px-1.5 py-1.5 rounded-lg flex flex-col items-center justify-center gap-0.5 transition text-[10px] font-medium leading-tight cursor-pointer border ${
            canGroup
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              : 'bg-white text-slate-500 border-transparent hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          <Group className="w-4 h-4" />
          <span className="truncate max-w-full">Agrupar</span>
        </button>
        <button
          type="button"
          onClick={onUngroupSelected}
          disabled={!canUngroup}
          title="Desagrupar bloque en sus elementos originales (Ctrl+Shift+G)"
          className={`w-full px-1.5 py-1.5 rounded-lg flex flex-col items-center justify-center gap-0.5 transition text-[10px] font-medium leading-tight border ${
            canUngroup
              ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 cursor-pointer'
              : 'bg-white text-slate-300 border-transparent opacity-60 cursor-not-allowed'
          }`}
        >
          <Ungroup className="w-4 h-4" />
          <span className="truncate max-w-full">Desagrup.</span>
        </button>
        <button
          type="button"
          onClick={onJoinSelected}
          title="Unir trazos conectados en una sola figura cerrada rellenable (Ctrl+J)"
          className={`w-full px-1.5 py-1.5 rounded-lg flex flex-col items-center justify-center gap-0.5 transition text-[10px] font-medium leading-tight cursor-pointer border ${
            canJoin
              ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
              : 'bg-white text-slate-500 border-transparent hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          <Combine className="w-4 h-4" />
          <span className="truncate max-w-full">Unir</span>
        </button>
        <button
          type="button"
          onClick={onSplitSelected}
          title="Dividir figuras o cruces en trazos sueltos para borrar partes por separado (Ctrl+Shift+J)"
          className={`w-full px-1.5 py-1.5 rounded-lg flex flex-col items-center justify-center gap-0.5 transition text-[10px] font-medium leading-tight cursor-pointer border ${
            canSplit
              ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              : 'bg-white text-slate-500 border-transparent hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          <Split className="w-4 h-4" />
          <span className="truncate max-w-full">Dividir</span>
        </button>
      </div>

      <div className="h-px bg-slate-200 mx-1" />

      {/* Drawing Tools (Laser Engraving) */}
      <div className="flex flex-col gap-1">
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">
          Dibujo
        </div>
        <ToolButton
          active={activeTool === 'freehand'}
          onClick={() => onSelectTool('freehand')}
          icon={<Pencil className="w-4 h-4" />}
          label="Lápiz"
          title="Dibujo libre suavizado para grabado láser"
        />
        <ToolButton
          active={activeTool === 'dots'}
          onClick={() => onSelectTool('dots')}
          icon={<Dot className="w-4 h-4" />}
          label="Puntos"
          title="Trazo de puntitos decorativos (como mandalas)"
        />
        <ToolButton
          active={activeTool === 'segment'}
          onClick={() => onSelectTool('segment')}
          icon={<Minus className="w-4 h-4 -rotate-45" />}
          label="Trazo"
          title="Segmento recto entre dos puntos con imán"
        />
        <ToolButton
          active={activeTool === 'curve'}
          onClick={() => onSelectTool('curve')}
          icon={<Spline className="w-4 h-4" />}
          label="Curva"
          title="Curva de 3 puntos: inicio, fin y punto exacto por donde pasa la curva"
        />
        <ToolButton
          active={activeTool === 'spline'}
          onClick={() => onSelectTool('spline')}
          icon={<PenTool className="w-4 h-4" />}
          label="Curva +"
          title="Curva continua multipunto: haz clic en varios puntos para dibujar ondas o figuras cerradas"
        />
        <ToolButton
          active={activeTool === 'circle'}
          onClick={() => onSelectTool('circle')}
          icon={<Circle className="w-4 h-4" />}
          label="Círculo"
          title="Dibujar círculo desde su centro"
        />
        <ToolButton
          active={activeTool === 'ellipse'}
          onClick={() => onSelectTool('ellipse')}
          icon={<Circle className="w-4 h-4 scale-y-75" />}
          label="Óvalo"
          title="Dibujar elipse / óvalo"
        />

        <div className="relative">
          <ToolButton
            active={activeTool === 'polygon'}
            onClick={() => {
              onSelectTool('polygon');
              setShowPolygonMenu((v) => !v);
              setShowPresets(false);
              setShowQuickAxes(false);
            }}
            icon={<Hexagon className="w-4 h-4" />}
            label={`${polygonSides} lados`}
            title="Polígono regular (clic para elegir cantidad de lados)"
          />
          {showPolygonMenu && (
            <div className="fixed left-[82px] top-60 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 z-50 w-44">
              <div className="text-xs font-semibold text-slate-800 mb-1.5">
                Lados del polígono
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      onChangePolygonSides(n);
                      onSelectTool('polygon');
                      setShowPolygonMenu(false);
                    }}
                    className={`py-1 rounded text-xs font-medium cursor-pointer ${
                      polygonSides === n
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <ToolButton
            active={activeTool === 'preset'}
            onClick={() => {
              onSelectTool('preset');
              setShowPresets((v) => !v);
              setShowPolygonMenu(false);
              setShowQuickAxes(false);
            }}
            icon={<Shapes className="w-4 h-4" />}
            label="Formas"
            title={`Flores, pétalos, figuras y animales (${PRESET_LIST.length} motivos)`}
          />
          {showPresets && (
            <div className="fixed left-[82px] top-20 bg-white border border-slate-200 rounded-xl shadow-2xl p-3 z-50 w-[340px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800">
                  Biblioteca de Formas ({PRESET_LIST.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowPresets(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>

              <div className="flex flex-wrap gap-1 mb-2">
                {(
                  [
                    { id: 'all', label: 'Todas' },
                    { id: 'flores', label: 'Flores' },
                    { id: 'petalos', label: 'Pétalos/Hojas' },
                    { id: 'animales', label: 'Animales' },
                    { id: 'figuras', label: 'Figuras' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setPresetCat(cat.id)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer border transition ${
                      presetCat === cat.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <p className="text-[11px] text-slate-500 mb-2">
                Elige una figura y haz clic en el lienzo para colocarla:
              </p>
              <div className="grid grid-cols-4 gap-1.5 max-h-80 overflow-y-auto custom-scrollbar pr-0.5">
                {visiblePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onSelectPreset(preset.id);
                      onSelectTool('preset');
                      setShowPresets(false);
                    }}
                    className={`p-1.5 rounded-lg border flex flex-col items-center gap-1 transition cursor-pointer ${
                      activePreset === preset.id && activeTool === 'preset'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <svg viewBox="-2 -2 4 4" className="w-8 h-8">
                      <g transform="scale(1,-1)">
                        {preset.paths.map((d, i) => (
                          <path
                            key={i}
                            d={d}
                            fill={
                              i === 0 && preset.fillable
                                ? 'rgba(99, 102, 241, 0.14)'
                                : 'none'
                            }
                            fillRule="evenodd"
                            stroke="currentColor"
                            strokeWidth="0.14"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ))}
                      </g>
                    </svg>
                    <span className="text-[9px] font-medium leading-tight text-center">
                      {preset.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Text Tool */}
        <ToolButton
          active={activeTool === 'text'}
          onClick={() => {
            setShowPresets(false);
            setShowPolygonMenu(false);
            setShowQuickAxes(false);
            onSelectTool('text');
          }}
          icon={<Type className="w-4 h-4" />}
          label="Texto"
          title="Colocar texto con diferentes fuentes tipográficas"
        />

        {/* Tessellations Button */}
        <ToolButton
          active={false}
          onClick={() => {
            setShowPresets(false);
            setShowPolygonMenu(false);
            setShowQuickAxes(false);
            onOpenTessellations();
          }}
          icon={<LayoutGrid className="w-4 h-4 text-violet-600" />}
          label="Teselar"
          title="Teselaciones: crear patrones geométricos combinados (360°) dentro de un área específica"
          accent="violet"
        />
      </div>

      <div className="h-px bg-slate-200 mx-1" />

      {/* Geometric References (Not laser-cut) */}
      <div className="flex flex-col gap-1">
        <div className="text-[9px] font-bold uppercase tracking-wider text-amber-600 text-center">
          Guías
        </div>
        <ToolButton
          active={activeTool === 'ref-point'}
          onClick={() => onSelectTool('ref-point')}
          icon={<Plus className="w-4 h-4" />}
          label="Punto"
          title="Colocar un punto de referencia con imán exacto a la cuadrícula"
          accent="amber"
        />
        <ToolButton
          active={activeTool === 'ref-line'}
          onClick={() => onSelectTool('ref-line')}
          icon={<Slash className="w-4 h-4" />}
          label="Recta"
          title="Trazar una recta o eje de simetría (2 puntos)"
          accent="amber"
        />
        <ToolButton
          active={activeTool === 'ref-vector'}
          onClick={() => onSelectTool('ref-vector')}
          icon={<ArrowRight className="w-4 h-4" />}
          label="Vector"
          title="Trazar vector de traslación (origen y destino)"
          accent="amber"
        />
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowQuickAxes((v) => !v);
              setShowPresets(false);
              setShowPolygonMenu(false);
            }}
            className="w-full py-1 px-1 rounded-md text-[10px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition cursor-pointer"
            title="Agregar ejes rápidos centrados"
          >
            + Ejes
          </button>
          {showQuickAxes && (
            <div className="fixed left-[82px] bottom-28 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 z-50 w-48">
              <div className="text-xs font-bold text-slate-800 mb-1.5">
                Agregar guía rápida
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onQuickAddAxis('origin');
                    setShowQuickAxes(false);
                  }}
                  className="text-left px-2 py-1.5 text-xs rounded-lg hover:bg-amber-50 text-slate-700 cursor-pointer"
                >
                  • Punto centro (0, 0)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onQuickAddAxis('y');
                    setShowQuickAxes(false);
                  }}
                  className="text-left px-2 py-1.5 text-xs rounded-lg hover:bg-amber-50 text-slate-700 cursor-pointer"
                >
                  | Eje vertical (x = 0)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onQuickAddAxis('x');
                    setShowQuickAxes(false);
                  }}
                  className="text-left px-2 py-1.5 text-xs rounded-lg hover:bg-amber-50 text-slate-700 cursor-pointer"
                >
                  — Eje horizontal (y = 0)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onQuickAddAxis('diag1');
                    setShowQuickAxes(false);
                  }}
                  className="text-left px-2 py-1.5 text-xs rounded-lg hover:bg-amber-50 text-slate-700 cursor-pointer"
                >
                  ╱ Diagonal (y = x)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onQuickAddAxis('diag2');
                    setShowQuickAxes(false);
                  }}
                  className="text-left px-2 py-1.5 text-xs rounded-lg hover:bg-amber-50 text-slate-700 cursor-pointer"
                >
                  ╲ Diagonal (y = -x)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-slate-200 mx-1" />

      {/* Isometric Transformations */}
      <div className="flex flex-col gap-1">
        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 text-center">
          Isometrías
        </div>
        <ToolButton
          active={activeTool === 't-axial'}
          onClick={() => onSelectTool('t-axial')}
          icon={<FlipHorizontal2 className="w-4 h-4" />}
          label="Axial"
          title="Simetría Axial: reflejar figura respecto a una recta"
          accent="emerald"
        />
        <ToolButton
          active={activeTool === 't-central'}
          onClick={() => onSelectTool('t-central')}
          icon={<Compass className="w-4 h-4" />}
          label="Central"
          title="Simetría Central: reflejar figura a 180° respecto a un punto"
          accent="emerald"
        />
        <ToolButton
          active={activeTool === 't-rotation'}
          onClick={() => onSelectTool('t-rotation')}
          icon={<RotateCw className="w-4 h-4" />}
          label="Rotar"
          title="Rotación: girar figura alrededor de un punto por un ángulo"
          accent="emerald"
        />
        <ToolButton
          active={activeTool === 't-rosette'}
          onClick={() => onSelectTool('t-rosette')}
          icon={<RefreshCw className="w-4 h-4" />}
          label="Rosetón"
          title="Mandala / Rosetón: repetir figura en rotación circular"
          accent="emerald"
        />
        <ToolButton
          active={activeTool === 't-translation'}
          onClick={() => onSelectTool('t-translation')}
          icon={<Move className="w-4 h-4" />}
          label="Trasladar"
          title="Traslación: mover o repetir figura según un vector"
          accent="emerald"
        />
      </div>

      {/* Tiny indicator at bottom */}
      <div className="mt-auto pt-2 text-center">
        <Sparkles className="w-3.5 h-3.5 text-slate-300 mx-auto" />
      </div>
    </aside>
  );
};
