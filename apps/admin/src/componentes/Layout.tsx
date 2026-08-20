import { etiquetarRoles } from '@ojosdecielo/core';
import { Isotipo } from '@ojosdecielo/ui';
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
  { a: '/promociones', texto: 'Promociones' },
  { a: '/pedidos', texto: 'Pedidos' },
  { a: '/equipo', texto: 'Equipo' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { perfil, cerrarSesion } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-6">
            <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
              <Isotipo className="h-8" />
              <span className="hidden lg:inline">Ojos de Cielo</span>
            </Link>
            {/* La navegación se desplaza en lugar de romperse: son nueve
                secciones y en una notebook de 13" no entran todas. */}
            <nav className="flex min-w-0 gap-4 overflow-x-auto text-sm">
              {SECCIONES.map((s) => (
                <Link
                  key={s.a}
                  to={s.a}
                  className={
                    pathname.startsWith(s.a)
                      ? 'shrink-0 font-medium text-marca-700'
                      : 'shrink-0 text-slate-600 hover:text-slate-900'
                  }
                >
                  {s.texto}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-4 text-sm">
            {/* Nombre y roles apilados: con los tres roles de una clínica
                unipersonal, en una línea se montaban sobre la navegación. */}
            <span className="hidden text-right leading-tight md:block">
              <span className="block text-slate-700">
                {perfil?.nombre} {perfil?.apellido}
              </span>
              <span className="block text-xs text-slate-500">{etiquetarRoles(perfil?.roles)}</span>
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
