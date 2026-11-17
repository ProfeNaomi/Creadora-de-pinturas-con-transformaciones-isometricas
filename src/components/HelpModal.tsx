import React from 'react';
import { X } from 'lucide-react';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Guía Rápida — Taller Isométrico y Corte Láser
            </h2>
            <p className="text-xs text-slate-500">
              Diseña tu obra con transformaciones isométricas y expórtala lista para madera
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar space-y-4 text-xs text-slate-700 leading-relaxed">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
              <div className="font-bold text-rose-800 mb-1">
                1. Línea Roja = Corte del borde
              </div>
              <p>
                El contorno exterior del tablero (ej. 20 × 20 cm) se exporta en color{' '}
                <strong>rojo (#FF0000)</strong> para que la cortadora láser corte la pieza de madera.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-100 border border-slate-300">
              <div className="font-bold text-slate-900 mb-1">
                2. Líneas Negras = Grabado interior
              </div>
              <p>
                Todos los dibujos y formas de adentro se exportan en{' '}
                <strong>negro (#000000)</strong> sin relleno para que la máquina solo marque/grabe la madera y luego puedan pintarla en persona.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
            <div className="font-bold text-amber-900 mb-1">
              3. Guías Matemáticas y Cuadrícula con Imán
            </div>
            <p>
              Los <strong>Puntos</strong>, <strong>Rectas</strong> y <strong>Vectores</strong> sirven para construir simetrías y rotaciones exactas. Tienen imán automático a la cuadrícula (1 cm, 0.5 cm, 0.25 cm o 0.1 cm) y{' '}
              <strong>NO aparecen en el archivo SVG del láser</strong>.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="font-bold text-slate-900 text-sm">
              Cómo aplicar Transformaciones Isométricas:
            </div>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Simetría Axial:</strong> Selecciona la figura → haz clic en una recta/eje guía (o usa los botones rápidos de Eje X / Eje Y / Diagonales).
              </li>
              <li>
                <strong>Simetría Central:</strong> Selecciona la figura → haz clic en el punto centro (refleja a 180°).
              </li>
              <li>
                <strong>Rotación:</strong> Selecciona la figura → haz clic en el punto centro → elige el ángulo (30°, 45°, 60°, 90°, etc.).
              </li>
              <li>
                <strong>Rosetón / Mandala:</strong> Selecciona una forma (ej. un pétalo) → haz clic en el punto centro → elige cuántas repeticiones quieres (4, 6, 8, 12...) para armar flores simétricas.
              </li>
              <li>
                <strong>Traslación:</strong> Selecciona la figura → haz clic en un vector guía o escribe el desplazamiento (dx, dy) en centímetros.
              </li>
            </ul>
          </div>

          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
            <div className="font-bold text-indigo-900 mb-1">
              4. Unificar, Dividir y Recortar Intersecciones
            </div>
            <p>
              Arrastra un <strong>recuadro de selección</strong> con la herramienta Mover (o usa{' '}
              <kbd className="font-bold">Shift + clic</kbd>) y elige{' '}
              <strong>Agrupar</strong> (<kbd className="font-bold">Ctrl + G</kbd>) para
              trabajar en bloque, o <strong>Unir</strong> (<kbd className="font-bold">Ctrl + J</kbd>)
              para soldar trazos en una figura rellenable. Para borrar solo una parte de una intersección
              (por ejemplo entre dos círculos), usa la herramienta <strong>Recortar</strong> (<kbd className="font-bold">T</kbd>)
              o selecciona las figuras y pulsa <strong>Dividir</strong> (<kbd className="font-bold">Ctrl + Shift + J</kbd>) para separarlas en tramos independientes.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="font-bold text-emerald-900 mb-1">
              5. Líneas Curvas, Texto Vectorial y Formas de Animales
            </div>
            <p>
              Usa <strong>Curva</strong> (3 puntos: inicio, fin y curvatura exacta) o{' '}
              <strong>Curva +</strong> (curva continua multipunto; haz clic en el inicio o doble clic para terminar).
              Con <strong>Texto</strong> puedes escribir en 6 fuentes tipográficas reales listas para pintar y cortar en láser, y en <strong>Formas</strong> encontrarás una categoría de <strong>Animales</strong>.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="font-bold text-slate-900 text-sm">
              Atajos de teclado útiles (con mouse):
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <kbd className="font-bold">Ctrl + G</kbd> / <kbd className="font-bold">Ctrl + Shift + G</kbd>: Agrupar / Desagrupar
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <kbd className="font-bold">Ctrl + J</kbd> / <kbd className="font-bold">Ctrl + A</kbd>: Unir trazos / Selec. todo
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <kbd className="font-bold">Ctrl + Z</kbd> / <kbd className="font-bold">Ctrl + Y</kbd>: Deshacer / Rehacer
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <kbd className="font-bold">Ctrl + C</kbd> / <kbd className="font-bold">Ctrl + V</kbd>: Copiar / Pegar
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <kbd className="font-bold">Ctrl + D</kbd>: Duplicar selección
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <kbd className="font-bold">Supr</kbd> / <kbd className="font-bold">Backspace</kbd>: Borrar selección
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <kbd className="font-bold">Rueda del mouse</kbd>: Hacer Zoom
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <kbd className="font-bold">Espacio + Arrastrar</kbd>: Mover lienzo
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 cursor-pointer"
          >
            ¡Entendido, a crear!
          </button>
        </div>
      </div>
    </div>
  );
};
