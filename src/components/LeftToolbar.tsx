import React, { useState } from 'react';
import {
  ArrowRight,
  Circle,
  Compass,
  Dot,
  Eraser,
  FlipHorizontal2,
  Hand,
  Hexagon,
  Minus,
  MousePointer2,
  Move,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Shapes,
  Slash,
  Sparkles,
} from 'lucide-react';
import { PresetId, ToolId } from '../types/geometry';
import { PRESET_LIST } from '../utils/presets';

interface LeftToolbarProps {
  activeTool: ToolId;
  onSelectTool: (tool: ToolId) => void;
  activePreset: PresetId;
  onSelectPreset: (preset: PresetId) => void;
  polygonSides: number;
  onChangePolygonSides: (sides: number) => void;
  onQuickAddAxis: (kind: 'x' | 'y' | 'diag1' | 'diag2' | 'origin') => void;
}

interface ToolButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
  accent?: 'indigo' | 'amber' | 'emerald' | 'rose';
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
}) => {
  const [showPresets, setShowPresets] = useState(false);
  const [showPolygonMenu, setShowPolygonMenu] = useState(false);
  const [showQuickAxes, setShowQuickAxes] = useState(false);

  return (
    <aside className="w-[74px] bg-white border-r border-slate-200 flex flex-col py-2 px-1.5 gap-2 overflow-y-auto custom-scrollbar shrink-0 z-10 relative">
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
          active={activeTool === 'eraser'}
          onClick={() => onSelectTool('eraser')}
          icon={<Eraser className="w-4 h-4" />}
          label="Borrar"
          title="Haz clic sobre cualquier figura o referencia para borrarla (E)"
          accent="rose"
        />
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
            <div className="fixed left-[78px] top-60 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 z-50 w-44">
              <div className="text-xs font-semibold text-slate-800 mb-1.5">
                Lados del polígono
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[3, 4, 5, 6, 8, 10].map((n) => (
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
            title="Estampas y formas artísticas listas para colocar"
          />
          {showPresets && (
            <div className="fixed left-[78px] top-40 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-50 w-72">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800">
                  Formas Predeterminadas
                </span>
                <button
                  type="button"
                  onClick={() => setShowPresets(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-700"
                >
                  Cerrar
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mb-2">
                Elige una figura y haz clic en el lienzo para colocarla:
              </p>
              <div className="grid grid-cols-3 gap-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-0.5">
                {PRESET_LIST.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onSelectPreset(preset.id);
                      onSelectTool('preset');
                      setShowPresets(false);
                    }}
                    className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition cursor-pointer ${
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
                            stroke="currentColor"
                            strokeWidth="0.16"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ))}
                      </g>
                    </svg>
                    <span className="text-[10px] font-medium leading-tight text-center">
                      {preset.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
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
            <div className="fixed left-[78px] bottom-28 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 z-50 w-48">
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
