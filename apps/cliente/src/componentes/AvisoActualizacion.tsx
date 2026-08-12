import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Avisa cuando hay una versión nueva.
 *
 * Deliberadamente no usa `skipWaiting` automático: recargar mientras el usuario
 * está completando un formulario le hace perder lo cargado. La decisión es
 * suya (docs/stack.md, Decisión 8 y agente pwa-doctor).
 */
export function AvisoActualizacion() {
  const {
    needRefresh: [hayActualizacion, setHayActualizacion],
    updateServiceWorker,
  } = useRegisterSW();

  if (!hayActualizacion) return null;

  return (
    <div
      role="status"
      className="safe-bottom fixed inset-x-4 bottom-4 z-50 flex items-center gap-3 rounded-xl bg-slate-900 p-4 text-white shadow-lg"
    >
      <p className="flex-1 text-sm">Hay una versión nueva de la app.</p>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900"
      >
        Actualizar
      </button>
      <button
        type="button"
        onClick={() => setHayActualizacion(false)}
        className="text-sm text-slate-400 hover:text-white"
        aria-label="Descartar"
      >
        Después
      </button>
    </div>
  );
}
