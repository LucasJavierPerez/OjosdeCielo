import { formatearFecha } from '@ojosdecielo/core';
import { Boton, Cargando, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';
import { useMascota } from '../features/mascotas/api.js';
import {
  type Tutor,
  useInvitacionesPendientes,
  useInvitarTutor,
  useRealtimeMascota,
  useRevocarInvitacion,
  useRevocarTutor,
  useTransferirTitularidad,
  useTutores,
} from '../features/mascotas/tutores.js';

export function TutoresMascota() {
  const { id = '' } = useParams<{ id: string }>();
  const { supabase } = useAuth();
  const { data: mascota } = useMascota(supabase, id);
  const { data: tutores, isLoading, isError, refetch } = useTutores(supabase, id);
  const { data: invitaciones } = useInvitacionesPendientes(supabase, id);

  useRealtimeMascota(supabase, id);

  const invitar = useInvitarTutor(supabase, id);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const yo = tutores?.find((t) => t.soy_yo);
  const soyTitular = yo?.rol === 'titular';

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo="Quién accede" volverA={`/mascotas/${id}`} />

      <p className="mt-2 text-sm text-slate-600">
        {mascota
          ? `Las personas que pueden ver y cuidar la salud de ${mascota.nombre}.`
          : 'Las personas que comparten esta mascota.'}
      </p>

      {isLoading && <Cargando etiqueta="Cargando tutores" />}

      {isError && (
        <div className="mt-4">
          <MensajeError
            titulo="No pudimos cargar los tutores"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {tutores && (
        <ul className="mt-6 space-y-2">
          {tutores.map((t) => (
            <FilaTutor
              key={t.id}
              tutor={t}
              mascotaId={id}
              puedoGestionar={soyTitular}
              nombreMascota={mascota?.nombre ?? 'la mascota'}
            />
          ))}
        </ul>
      )}

      {soyTitular && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-slate-500">Invitar a alguien más</h2>
          <p className="mt-1 text-sm text-slate-600">
            Generá un enlace y mandáselo. Quien lo abra y tenga cuenta va a poder ver y cuidar a{' '}
            {mascota?.nombre ?? 'tu mascota'}.
          </p>

          <Boton
            className="mt-3 w-full"
            cargando={invitar.isPending}
            onClick={() => {
              setError(null);
              invitar.mutate(undefined, {
                onSuccess: (inv) =>
                  setEnlace(`${globalThis.location.origin}/invitacion/${inv.token}`),
                onError: () => setError('No pudimos generar el enlace. Probá de nuevo.'),
              });
            }}
          >
            Generar enlace de invitación
          </Boton>

          {error && (
            <div className="mt-3">
              <MensajeError detalle={error} />
            </div>
          )}

          {enlace && <EnlaceGenerado enlace={enlace} nombreMascota={mascota?.nombre} />}

          {invitaciones && invitaciones.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-slate-500">Invitaciones sin usar</h3>
              <ul className="mt-2 space-y-2">
                {invitaciones.map((inv) => (
                  <FilaInvitacion key={inv.id} invitacion={inv} mascotaId={id} />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tutores && tutores.length === 1 && !soyTitular && (
        <div className="mt-6">
          <Vacio
            titulo="Sos el único tutor"
            descripcion="Sólo quien figura como titular puede invitar a otras personas."
          />
        </div>
      )}
    </main>
  );
}

function FilaTutor({
  tutor,
  mascotaId,
  puedoGestionar,
  nombreMascota,
}: {
  tutor: Tutor;
  mascotaId: string;
  puedoGestionar: boolean;
  nombreMascota: string;
}) {
  const { supabase } = useAuth();
  const revocar = useRevocarTutor(supabase, mascotaId);
  const transferir = useTransferirTitularidad(supabase, mascotaId);
  const [confirmando, setConfirmando] = useState<'revocar' | 'transferir' | null>(null);

  // El titular no puede quitarse a sí mismo: dejaría la mascota sin nadie que
  // pueda gestionarla. La base lo impide; acá directamente no se ofrece.
  const puedoActuar = puedoGestionar && !tutor.soy_yo;

  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {tutor.nombre} {tutor.apellido}
            {tutor.soy_yo && <span className="ml-1 text-sm text-slate-500">(vos)</span>}
          </p>
          <p className="truncate text-sm text-slate-500">{tutor.email}</p>
          <p className="mt-1 text-xs text-slate-400">
            {tutor.rol === 'titular' ? 'Titular · gestiona los accesos' : 'Tutor'} · desde{' '}
            {formatearFecha(tutor.desde)}
          </p>
        </div>
      </div>

      {puedoActuar && confirmando === null && (
        <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3">
          <Boton variante="texto" onClick={() => setConfirmando('transferir')}>
            Hacer titular
          </Boton>
          <Boton
            variante="texto"
            className="text-red-700"
            onClick={() => setConfirmando('revocar')}
          >
            Quitar acceso
          </Boton>
        </div>
      )}

      {confirmando === 'revocar' && (
        <Confirmacion
          mensaje={`${tutor.nombre} va a dejar de ver a ${nombreMascota}. Podés volver a invitarla cuando quieras.`}
          textoConfirmar="Quitar acceso"
          peligro
          cargando={revocar.isPending}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() =>
            revocar.mutate(tutor.perfil_id, { onSettled: () => setConfirmando(null) })
          }
        />
      )}

      {confirmando === 'transferir' && (
        <Confirmacion
          mensaje={`${tutor.nombre} va a pasar a ser titular y vos quedás como tutor. Ya no vas a poder gestionar los accesos.`}
          textoConfirmar="Transferir"
          cargando={transferir.isPending}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() =>
            transferir.mutate(tutor.perfil_id, { onSettled: () => setConfirmando(null) })
          }
        />
      )}
    </li>
  );
}

function Confirmacion({
  mensaje,
  textoConfirmar,
  peligro,
  cargando,
  onConfirmar,
  onCancelar,
}: {
  mensaje: string;
  textoConfirmar: string;
  peligro?: boolean;
  cargando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <p className="text-sm text-slate-700">{mensaje}</p>
      <div className="mt-3 flex gap-2">
        <Boton
          variante={peligro ? 'peligro' : 'primario'}
          cargando={cargando}
          onClick={onConfirmar}
          className="flex-1 text-sm"
        >
          {textoConfirmar}
        </Boton>
        <Boton variante="secundario" onClick={onCancelar} className="text-sm">
          Cancelar
        </Boton>
      </div>
    </div>
  );
}

function EnlaceGenerado({ enlace, nombreMascota }: { enlace: string; nombreMascota?: string }) {
  const [copiado, setCopiado] = useState(false);
  const mensaje = `Te comparto el acceso a la ficha de ${nombreMascota ?? 'mi mascota'} en Ojos de Cielo: ${enlace}`;

  return (
    <div className="mt-4 rounded-xl bg-marca-50 p-4">
      <p className="text-sm font-medium text-marca-800">Enlace listo</p>
      <p className="mt-1 text-xs text-marca-700">
        Sirve una sola vez y vence en 7 días. Compartilo sólo con quien quieras dar acceso.
      </p>

      <p className="mt-3 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-600">
        {enlace}
      </p>

      <div className="mt-3 flex gap-2">
        <Boton
          className="flex-1 text-sm"
          onClick={async () => {
            try {
              // navigator.share es lo natural en el celular: abre WhatsApp y el
              // resto de las apps. En desktop no existe y se copia al portapapeles.
              if (navigator.share) {
                await navigator.share({ text: mensaje });
                return;
              }
              await navigator.clipboard.writeText(enlace);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2500);
            } catch {
              // El usuario canceló el diálogo de compartir: no es un error.
            }
          }}
        >
          {copiado ? 'Copiado' : 'Compartir'}
        </Boton>
      </div>
    </div>
  );
}

function FilaInvitacion({
  invitacion,
  mascotaId,
}: {
  invitacion: { id: string; vence_en: string };
  mascotaId: string;
}) {
  const { supabase } = useAuth();
  const revocar = useRevocarInvitacion(supabase, mascotaId);

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <span className="text-sm text-slate-600">Vence el {formatearFecha(invitacion.vence_en)}</span>
      <Boton
        variante="texto"
        className="text-sm text-red-700"
        cargando={revocar.isPending}
        onClick={() => revocar.mutate(invitacion.id)}
      >
        Anular
      </Boton>
    </li>
  );
}
