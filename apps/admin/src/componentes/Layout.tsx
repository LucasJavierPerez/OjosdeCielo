import { useAuth } from '@ojosdecielo/ui/auth';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';

const SECCIONES = [
  { a: '/agenda', texto: 'Agenda' },
  { a: '/tablero', texto: 'Tablero' },
  { a: '/pacientes', texto: 'Pacientes' },
  { a: '/reposiciones', texto: 'Reposiciones' },
  { a: '/caja', texto: 'Caja' },
  { a: '/inventario', texto: 'Inventario' },
  { a: '/mensajes', texto: 'Mensajes' },
  { a: '/campanas', texto: 'Campañas' },
  { a: '/equipo', texto: 'Equipo' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { perfil, cerrarSesion } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-semibold">
              Ojos de Cielo
            </Link>
            <nav className="flex gap-4 text-sm">
              {SECCIONES.map((s) => (
                <Link
                  key={s.a}
                  to={s.a}
                  className={
                    pathname.startsWith(s.a)
                      ? 'font-medium text-marca-700'
                      : 'text-slate-600 hover:text-slate-900'
                  }
                >
                  {s.texto}
                </Link>
              ))}
            </nav>
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

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
