import { Boton, Cargando, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useAceptarInvitacion } from '../features/mascotas/tutores.js';

/**
 * Pantalla que abre quien recibe el enlace.
 *
 * No muestra nada de la mascota antes de aceptar: quien tiene el enlace todavía
 * no es tutor, así que no puede ver sus datos. Mostrar el nombre acá filtraría
 * información a cualquiera que consiga un token.
 */
export function AceptarInvitacion() {
  const { token = '' } = useParams<{ token: string }>();
  const { session, supabase, cargando } = useAuth();
  const navigate = useNavigate();
  const aceptar = useAceptarInvitacion(supabase);
  const [error, setError] = useState<string | null>(null);

  if (cargando) return <Cargando />;

  // Sin sesión no se puede aceptar. Se guarda el destino para volver acá
  // después de ingresar o registrarse.
  if (!session) {
    return <Navigate to="/ingresar" state={{ desde: `/invitacion/${token}` }} replace />;
  }

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold">Te invitaron a cuidar una mascota</h1>
      <p className="mt-2 text-slate-600">
        Si aceptás, vas a poder ver su ficha, su historial de salud y sacarle turnos.
      </p>

      {error && (
        <div className="mt-4">
          <MensajeError titulo="No pudimos aceptar la invitación" detalle={error} />
        </div>
      )}

      <Boton
        className="mt-6"
        cargando={aceptar.isPending}
        onClick={() => {
          setError(null);
          aceptar.mutate(token, {
            onSuccess: (mascota) => void navigate(`/mascotas/${mascota.id}`, { replace: true }),
            onError: () =>
              setError(
                'El enlace puede haber vencido, ya haberse usado, o haber sido anulado. Pedile uno nuevo a quien te lo mandó.',
              ),
          });
        }}
      >
        Aceptar invitación
      </Boton>

      <Link to="/" className="mt-4 text-center text-sm text-slate-500 hover:underline">
        Ahora no
      </Link>
    </main>
  );
}
