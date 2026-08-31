import { etiquetarRoles } from '@ojosdecielo/core';
import { cn, Isotipo } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';

const SECCIONES = [
  { a: '/agenda', texto: 'Agenda' },
  { a: '/tablero', texto: 'Tablero' },
  { a: '/pacientes', texto: 'Pacientes' },
  { a: '/internaciones', texto: 'Internación' },
  { a: '/domicilios', texto: 'Domicilios' },
  { a: '/reposiciones', texto: 'Reposiciones' },
  { a: '/caja', texto: 'Caja' },
  { a: '/inventario', texto: 'Inventario' },
  { a: '/mensajes', texto: 'Mensajes' },
  { a: '/promociones', texto: 'Promociones' },
  { a: '/pedidos', texto: 'Pedidos' },
  { a: '/equipo', texto: 'Equipo' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { perfil, cerrarSesion } = useAuth();
  const { pathname } = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const cerrarMenu = () => setMenuAbierto(false);

  // Un solo menú desplegable para las dos pantallas: son once secciones y en
  // una notebook de 13" no entran en una barra. Cada enlace lo cierra al
  // navegar; Escape también.
  useEffect(() => {
    if (!menuAbierto) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAbierto(false);
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [menuAbierto]);

  const seccionActual = SECCIONES.find((s) => pathname.startsWith(s.a));

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="relative z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-expanded={menuAbierto}
            aria-controls="menu-principal"
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <span aria-hidden="true" className="text-base leading-none">
              {menuAbierto ? '✕' : '☰'}
            </span>
            <span>Menú</span>
            {seccionActual && !menuAbierto && (
              <span className="hidden text-slate-400 sm:inline">· {seccionActual.texto}</span>
            )}
          </button>

          <Link
            to="/"
            onClick={cerrarMenu}
            className="flex shrink-0 items-center gap-2 font-semibold"
          >
            <Isotipo className="h-8" />
            <span className="hidden lg:inline">Ojos de Cielo</span>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-4 text-sm">
            {/* Nombre y roles apilados: con los tres roles de una clínica
                unipersonal, en una línea se montan sobre lo demás. */}
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

        {menuAbierto && (
          <nav
            id="menu-principal"
            className="absolute inset-x-0 top-full border-b border-slate-200 bg-white shadow-lg"
          >
            <ul className="mx-auto grid max-w-6xl gap-1 px-4 py-3 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
              {SECCIONES.map((s) => (
                <li key={s.a}>
                  <Link
                    to={s.a}
                    onClick={cerrarMenu}
                    className={cn(
                      'block rounded-lg px-3 py-2.5 text-sm',
                      pathname.startsWith(s.a)
                        ? 'bg-marca-50 font-medium text-marca-700'
                        : 'text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    {s.texto}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
