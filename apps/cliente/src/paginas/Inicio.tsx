import { useAuth } from '@ojosdecielo/ui/auth';
import { Link } from 'react-router';

export function Inicio() {
  const { perfil, cerrarSesion } = useAuth();

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-8">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">Hola</p>
          <h1 className="text-2xl font-semibold">{perfil?.nombre ?? ''}</h1>
        </div>
        <button
          type="button"
          onClick={() => void cerrarSesion()}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Salir
        </button>
      </header>

      {/* Fase 1: acá va la lista de mascotas del tutor. */}
      <section className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center">
        <p className="text-slate-600">Todavía no cargaste ninguna mascota.</p>
        <p className="mt-1 text-sm text-slate-500">
          Próximamente vas a poder sumar a tu compañero y llevar su salud al día.
        </p>
      </section>

      <Link
        to="/instalar"
        className="mt-6 block rounded-xl bg-marca-50 p-4 text-sm text-marca-700 hover:bg-marca-100"
      >
        <strong className="block">Instalá la app en tu celular</strong>
        Para recibir recordatorios de vacunas y desparasitaciones.
      </Link>
    </main>
  );
}
