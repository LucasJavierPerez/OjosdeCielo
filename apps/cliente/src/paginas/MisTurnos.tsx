import { formatearFechaLarga, formatearHora, textoRelativo } from '@ojosdecielo/core';
import { Boton, Cargando, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Encabezado } from '../componentes/Encabezado.js';
import { type TurnoConDatos, useCancelarTurno, useMisTurnos } from '../features/turnos/api.js';

const ETIQUETA_ESTADO: Record<string, string> = {
  solicitado: 'A confirmar',
  confirmado: 'Confirmado',
  en_curso: 'En curso',
  atendido: 'Atendido',
  cancelado: 'Cancelado',
  ausente: 'No asististe',
};

export function MisTurnos() {
  const { supabase } = useAuth();
  const { data: turnos, isLoading, isError, refetch } = useMisTurnos(supabase);

  const ahora = new Date().toISOString();
  const proximos = (turnos ?? []).filter((t) => t.inicio >= ahora && t.estado !== 'cancelado');
  const pasados = (turnos ?? [])
    .filter((t) => t.inicio < ahora || t.estado === 'cancelado')
    .reverse();

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo="Turnos" volverA="/" />

      {isLoading && <Cargando etiqueta="Cargando turnos" />}

      {isError && (
        <div className="mt-4">
          <MensajeError titulo="No pudimos cargar los turnos" onReintentar={() => void refetch()} />
        </div>
      )}

      {turnos && proximos.length === 0 && (
        <div className="mt-6">
          <Vacio
            titulo="No tenés turnos pendientes"
            descripcion="Los turnos los agenda la clínica; acá vas a ver los que te confirmen, y te avisamos el día antes."
          />
        </div>
      )}

      {proximos.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-slate-500">Próximos</h2>
          <ul className="mt-2 space-y-3">
            {proximos.map((t) => (
              <FilaTurno key={t.id} turno={t} proximo />
            ))}
          </ul>
        </section>
      )}

      {pasados.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-slate-500">Anteriores</h2>
          <ul className="mt-2 space-y-2">
            {pasados.slice(0, 10).map((t) => (
              <FilaTurno key={t.id} turno={t} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function FilaTurno({ turno: t, proximo }: { turno: TurnoConDatos; proximo?: boolean }) {
  const { supabase } = useAuth();
  const cancelar = useCancelarTurno(supabase);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelado = t.estado === 'cancelado';

  return (
    <li
      className={
        proximo && !cancelado
          ? 'rounded-xl border border-slate-200 p-4'
          : 'rounded-xl border border-slate-100 p-3 opacity-70'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {t.mascota?.nombre}
            <span className="ml-2 text-sm font-normal text-slate-500">
              {t.especialidad?.nombre}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {formatearFechaLarga(t.inicio)} a las {formatearHora(t.inicio)}
          </p>
          {proximo && !cancelado && (
            <p className="text-xs text-slate-500">{textoRelativo(t.inicio)}</p>
          )}
          {t.motivo && <p className="mt-1 text-sm text-slate-500">{t.motivo}</p>}
        </div>

        <span
          className={
            cancelado
              ? 'shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500'
              : t.estado === 'confirmado'
                ? 'shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800'
                : 'shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800'
          }
        >
          {ETIQUETA_ESTADO[t.estado] ?? t.estado}
        </span>
      </div>

      {proximo && !cancelado && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {confirmando ? (
            <div className="flex gap-2">
              <Boton
                variante="peligro"
                className="flex-1 text-sm"
                cargando={cancelar.isPending}
                onClick={() =>
                  cancelar.mutate(t.id, {
                    onSettled: () => setConfirmando(false),
                    onError: (e) => setError(e.message),
                  })
                }
              >
                Sí, cancelar
              </Boton>
              <Boton
                variante="secundario"
                className="text-sm"
                onClick={() => setConfirmando(false)}
              >
                No
              </Boton>
            </div>
          ) : (
            <Boton
              variante="texto"
              className="text-sm text-red-700"
              onClick={() => {
                setError(null);
                setConfirmando(true);
              }}
            >
              Cancelar turno
            </Boton>
          )}

          {error && (
            <div className="mt-2">
              <MensajeError detalle={error} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
