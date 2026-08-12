import { useAuth } from '@ojosdecielo/ui/auth';

export function Escritorio() {
  const { perfil, cerrarSesion } = useAuth();

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-baseline gap-3">
            <span className="font-semibold">Ojos de Cielo</span>
            <span className="text-sm text-slate-500">Panel</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-600">
              {perfil?.nombre} {perfil?.apellido}
              <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">
                {perfil?.rol}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void cerrarSesion()}
              className="text-slate-500 hover:text-slate-900"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Fase 1: búsqueda de pacientes. Fase 5: agenda del día. */}
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-slate-600">El panel está en construcción.</p>
          <p className="mt-1 text-sm text-slate-500">
            La búsqueda de pacientes llega en la fase 1; la agenda, en la fase 5.
          </p>
        </div>
      </main>
    </div>
  );
}
