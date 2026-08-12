import { Boton } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { Navigate } from 'react-router';

/**
 * Un usuario del personal de la clínica que abre la app de tutores.
 *
 * Pasa seguido: son dos apps en direcciones distintas y es fácil equivocarse.
 * Lo importante es decir a dónde ir, no sólo que este no es el lugar.
 */
export function SinAcceso() {
  const { session, perfil, cerrarSesion } = useAuth();

  if (!session) return <Navigate to="/ingresar" replace />;

  const urlPanel = import.meta.env.VITE_URL_PANEL;

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">Esta app es para los tutores</h1>
      <p className="mt-2 text-slate-600">
        Tu cuenta es del personal de la clínica{perfil ? ` (${perfil.rol})` : ''}. Para atender
        pacientes entrá al panel.
      </p>

      {urlPanel && (
        <a
          href={urlPanel}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-marca-600 px-4 font-medium text-white hover:bg-marca-700"
        >
          Ir al panel
        </a>
      )}

      <Boton variante="texto" className="mt-4" onClick={() => void cerrarSesion()}>
        Cerrar sesión
      </Boton>
    </main>
  );
}
