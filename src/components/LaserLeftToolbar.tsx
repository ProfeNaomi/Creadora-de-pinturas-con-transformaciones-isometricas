import React from 'react';
import { Hand, Layers, MousePointer2, PaintBucket } from 'lucide-react';
import { LaserDepthId } from '../types/geometry';
import { LASER_LAYERS } from '../utils/laserLayers';

export type LaserToolMode = 'select' | 'pan' | 'brush';

interface LaserLeftToolbarProps {
  laserTool: LaserToolMode;
  onChangeLaserTool: (mode: LaserToolMode) => void;
  activeBrushLayer: LaserDepthId;
  onSelectBrushLayer: (layer: LaserDepthId) => void;
  onBackToDesign: () => void;
}

export const LaserLeftToolbar: React.FC<LaserLeftToolbarProps> = ({
  laserTool,
  onChangeLaserTool,
  activeBrushLayer,
  onSelectBrushLayer,
  onBackToDesign,
}) => {
  const selectableLayers = LASER_LAYERS.filter((l) => l.isSelectableForShapes);

  return (
    <aside className="w-[82px] bg-white border-r border-slate-200 flex flex-col py-2 px-1.5 gap-2 overflow-y-auto custom-scrollbar shrink-0 z-10">
      <div className="flex flex-col gap-1">
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">
          Navegar
        </div>
        <button
          type="button"
          onClick={() => onChangeLaserTool('select')}
          className={`w-full px-1.5 py-1.5 rounded-lg flex flex-col items-center gap-0.5 text-[10px] font-medium cursor-pointer transition ${
            laserTool === 'select'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="Seleccionar figuras (Shift+clic para varias)"
        >
          <MousePointer2 className="w-4 h-4" />
          <span>Elegir</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeLaserTool('pan')}
          className={`w-full px-1.5 py-1.5 rounded-lg flex flex-col items-center gap-0.5 text-[10px] font-medium cursor-pointer transition ${
            laserTool === 'pan'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="Mover la vista del lienzo"
        >
          <Hand className="w-4 h-4" />
          <span>Mano</span>
        </button>
      </div>

      <div className="h-px bg-slate-200 mx-1" />

      <div className="flex flex-col gap-1.5">
        <div
          className="text-[9px] font-bold uppercase tracking-wider text-amber-700 text-center flex flex-col items-center gap-0.5"
          title="Elige un nivel y haz clic sobre cualquier figura del dibujo para cambiar su profundidad"
        >
          <PaintBucket className="w-3.5 h-3.5" />
          <span>Pincel Láser</span>
        </div>

        {selectableLayers.map((layer) => {
          const isActive =
            laserTool === 'brush' && activeBrushLayer === layer.id;
          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => {
                onSelectBrushLayer(layer.id);
                onChangeLaserTool('brush');
              }}
              title={`${layer.name}: ${layer.description}`}
              className={`w-full px-1 py-1.5 rounded-lg border flex flex-col items-center gap-1 transition cursor-pointer ${
                isActive
                  ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <span
                className="w-4 h-4 rounded-full border border-white shadow-xs"
                style={{ backgroundColor: layer.color }}
              />
              <span className="text-[9px] font-semibold leading-tight text-center">
                {layer.shortName}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-2 border-t border-slate-200">
        <button
          type="button"
          onClick={onBackToDesign}
          className="w-full px-1 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold flex flex-col items-center gap-0.5 cursor-pointer transition"
          title="Volver al Modo 1 para editar formas y transformaciones"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Diseño</span>
        </button>
      </div>
    </aside>
  );
};
