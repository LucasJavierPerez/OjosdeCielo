import type { Rol } from '@ojosdecielo/core';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './contexto.js';

/**
 * Restringe una ruta a ciertos roles.
 *
 * ATENCIÓN: esto es navegación, no seguridad. Cualquiera puede saltearlo
 * editando el bundle. Lo que realmente protege los datos son las políticas RLS
 * (AGENTS.md, regla 1). Si una ruta necesita este componente, verificá que
 * exista la política que la respalda.
 */
export function RutaProtegida({
  children,
  rolesPermitidos,
  redirigirA = '/ingresar',
}: {
  children: ReactNode;
  rolesPermitidos?: readonly Rol[];
  redirigirA?: string;
}) {
  const { session, perfil, cargando } = useAuth();
  const location = useLocation();

  if (cargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div
          className="size-8 animate-spin rounded-full border-2 border-current border-t-transparent text-marca-600"
          role="status"
          aria-label="Cargando"
        />
      </div>
    );
  }

  if (!session) {
    // `state` preserva a dónde quería ir, para volver después de ingresar.
    return <Navigate to={redirigirA} state={{ desde: location.pathname }} replace />;
  }

  // Basta con tener alguno de los roles permitidos: quien atiende y además
  // administra entra por las dos puertas.
  const permitido =
    !rolesPermitidos || !perfil || rolesPermitidos.some((r) => perfil.roles.includes(r));

  if (!permitido) {
    return <Navigate to="/sin-acceso" replace />;
  }

  return <>{children}</>;
}
