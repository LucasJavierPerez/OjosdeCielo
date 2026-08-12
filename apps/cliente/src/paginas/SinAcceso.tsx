import { Boton } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { Navigate } from 'react-router';

/**
 * Un usuario del personal de la clínica que abre la app de clientes.
 *
 * Pasa de verdad: la misma persona puede tener el panel abierto y tocar un
 * enlace de la app. Sin esta pantalla caía en el 404 genérico, que no explica
 * nada ni ofrece salida.
 */
export function SinAcceso() {
  const { session, perfil, cerrarSesion } = useAuth();

  if (!session) return <Navigate to="/ingresar" replace />;

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">Esta app es para los tutores</h1>
      <p className="mt-2 text-slate-600">
        Tu cuenta es del personal de la clínica{perfil ? ` (${perfil.rol})` : ''}. Para atender
        pacientes usá el panel.
      </p>
      <Boton variante="texto" className="mt-6" onClick={() => void cerrarSesion()}>
        Cerrar sesión
      </Boton>
    </main>
  );
}
