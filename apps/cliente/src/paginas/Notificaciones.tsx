import type { Database } from '@ojosdecielo/db';
import { Boton, Cargando, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';
import {
  activarPush,
  desactivarPush,
  type EstadoPush,
  estadoActual,
} from '../features/notificaciones/push.js';

/** El tipo sale del enum de la base, así que agregar uno nuevo rompe acá. */
type TipoNotificacion = Database['public']['Enums']['tipo_notificacion'];

const TIPOS: { tipo: TipoNotificacion; etiqueta: string; detalle: string }[] = [
  { tipo: 'vacuna', etiqueta: 'Vacunas', detalle: 'Cuando se acerca la fecha de refuerzo' },
  {
    tipo: 'desparasitacion',
    etiqueta: 'Desparasitaciones',
    detalle: 'Interna y externa, según lo que cargaste',
  },
  { tipo: 'medicacion', etiqueta: 'Medicación', detalle: 'Cuando termina un tratamiento' },
  { tipo: 'turno', etiqueta: 'Turnos', detalle: 'Un día antes de cada turno' },
];

export function Notificaciones() {
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    void estadoActual().then(setEstado);
  }, []);

  const { data: preferencias } = useQuery({
    queryKey: ['preferencias'],
    queryFn: async () => {
      const { data, error: err } = await supabase.from('preferencia_notificacion').select('*');
      if (err) throw err;
      return data;
    },
  });

  const cambiar = useMutation({
    mutationFn: async ({ tipo, habilitado }: { tipo: TipoNotificacion; habilitado: boolean }) => {
      const { error: err } = await supabase
        .from('preferencia_notificacion')
        .upsert({ tipo, habilitado }, { onConflict: 'perfil_id,tipo' });
      if (err) throw err;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preferencias'] }),
  });

  // Ausencia de fila significa habilitado: un tipo nuevo no queda silenciado
  // para los usuarios que ya existían.
  const estaHabilitado = (tipo: TipoNotificacion) =>
    preferencias?.find((p) => p.tipo === tipo)?.habilitado ?? true;

  if (estado === null) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="Recordatorios" volverA="/" />
        <Cargando />
      </main>
    );
  }

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo="Recordatorios" volverA="/" />

      <p className="mt-2 text-sm text-slate-600">
        Te avisamos cuando le toque una vacuna, una desparasitación o termine un tratamiento.
      </p>

      {estado === 'requiere_instalar' && (
        <div className="mt-6 rounded-xl bg-amber-50 p-4">
          <p className="font-medium text-amber-900">Primero instalá la app</p>
          <p className="mt-1 text-sm text-amber-800">
            En iPhone, las notificaciones sólo funcionan con la app agregada a la pantalla de
            inicio. Es un paso rápido y se hace una sola vez.
          </p>
          <Link
            to="/instalar"
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-amber-900 px-4 font-medium text-white"
          >
            Ver cómo instalarla
          </Link>
        </div>
      )}

      {estado === 'no_soportado' && (
        <div className="mt-6 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
          Este navegador no admite notificaciones. Probá desde Chrome en Android o Safari en iPhone
          con la app instalada.
        </div>
      )}

      {estado === 'denegado' && (
        <div className="mt-6 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Las notificaciones están bloqueadas</p>
          <p className="mt-1">
            Se bloquearon desde el navegador, así que no podemos volver a pedirlas desde acá.
            Habilitalas en los ajustes del sitio y volvé a esta pantalla.
          </p>
        </div>
      )}

      {(estado === 'sin_permiso' || estado === 'activo') && (
        <div className="mt-6 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{estado === 'activo' ? 'Activadas' : 'Desactivadas'}</p>
              <p className="text-sm text-slate-500">
                {estado === 'activo'
                  ? 'Este dispositivo va a recibir los avisos.'
                  : 'Activalas para no perderte ninguna fecha.'}
              </p>
            </div>

            <Boton
              variante={estado === 'activo' ? 'secundario' : 'primario'}
              cargando={trabajando}
              onClick={async () => {
                setError(null);
                setTrabajando(true);
                try {
                  if (estado === 'activo') {
                    await desactivarPush(supabase);
                    setEstado('sin_permiso');
                  } else {
                    // Se llama desde el click: en iOS pedir el permiso fuera de
                    // un gesto del usuario falla en silencio.
                    const nuevo = await activarPush(
                      supabase,
                      import.meta.env.VITE_VAPID_PUBLIC_KEY,
                    );
                    setEstado(nuevo);
                    if (nuevo === 'denegado') {
                      setError('Rechazaste el permiso. Podés habilitarlo desde el navegador.');
                    }
                  }
                } catch {
                  setError('No pudimos cambiar la configuración. Probá de nuevo.');
                } finally {
                  setTrabajando(false);
                }
              }}
            >
              {estado === 'activo' ? 'Desactivar' : 'Activar'}
            </Boton>
          </div>

          {error && (
            <div className="mt-3">
              <MensajeError detalle={error} />
            </div>
          )}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-500">Qué querés recibir</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {TIPOS.map((t) => (
            <li key={t.tipo} className="flex items-center justify-between gap-4 py-3">
              <label htmlFor={`pref-${t.tipo}`} className="min-w-0">
                <span className="block font-medium">{t.etiqueta}</span>
                <span className="block text-sm text-slate-500">{t.detalle}</span>
              </label>
              <input
                id={`pref-${t.tipo}`}
                type="checkbox"
                checked={estaHabilitado(t.tipo)}
                onChange={(e) => cambiar.mutate({ tipo: t.tipo, habilitado: e.target.checked })}
                className="size-5 shrink-0 rounded border-slate-300"
              />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Cada tutor elige por separado: desactivar acá no afecta a las otras personas que comparten
          la mascota.
        </p>
      </section>
    </main>
  );
}
