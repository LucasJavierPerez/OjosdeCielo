import { useAuth } from '@ojosdecielo/ui/auth';
import { Navigate } from 'react-router';

export function SinAcceso() {
  const { cerrarSesion, session } = useAuth();

  // Sin sesión no hay nada que explicar acá: al cerrar sesión, esta pantalla
  // deja de tener sentido y hay que volver al login.
  if (!session) return <Navigate to="/ingresar" replace />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">No tenés acceso al panel</h1>
      <p className="mt-2 text-slate-600">
        Esta sección es sólo para el personal de la clínica. Si sos cliente, entrá desde la app.
      </p>
      <button
        type="button"
        onClick={() => void cerrarSesion()}
        className="mt-6 font-medium text-marca-600 hover:underline"
      >
        Cerrar sesión
      </button>
    </main>
  );
}
