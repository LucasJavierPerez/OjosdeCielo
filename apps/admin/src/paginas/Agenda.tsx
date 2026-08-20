import {
  formatearFechaCivil,
  formatearFechaLarga,
  formatearHora,
  hoyCivil,
  sumarDiasCiviles,
} from '@ojosdecielo/core';
import type { Database } from '@ojosdecielo/db';
import { Boton, Cargando, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Layout } from '../componentes/Layout.js';
import { NuevoTurno } from '../features/agenda/NuevoTurno.js';
import { lunesDeLaSemana, VistaSemana } from '../features/agenda/VistaSemana.js';

/** El estado sale del enum de la base: agregar uno nuevo rompe acá. */
type EstadoTurno = Database['public']['Enums']['estado_turno'];

interface TurnoAgenda {
  id: string;
  inicio: string;
  fin: string;
  estado: EstadoTurno;
  motivo: string | null;
  notas_internas: string | null;
  mascota_id: string;
  mascota_nombre: string;
  especie: string;
  tutor_nombre: string | null;
  tutor_telefono: string | null;
  profesional_id: string;
  profesional: string;
  color_agenda: string;
}

const ETIQUETA_ESTADO: Record<string, string> = {
  solicitado: 'A confirmar',
  confirmado: 'Confirmado',
  en_curso: 'En consultorio',
  atendido: 'Atendido',
  cancelado: 'Cancelado',
  ausente: 'No vino',
};

/** Lo que el personal necesita hacer con un turno, en el orden en que ocurre. */
const SIGUIENTES: Partial<Record<EstadoTurno, { estado: EstadoTurno; texto: string }[]>> = {
  solicitado: [
    { estado: 'confirmado', texto: 'Confirmar' },
    { estado: 'ausente', texto: 'No vino' },
  ],
  confirmado: [
    { estado: 'en_curso', texto: 'Pasó al consultorio' },
    { estado: 'ausente', texto: 'No vino' },
  ],
  en_curso: [{ estado: 'atendido', texto: 'Atendido' }],
};

export function Agenda() {
  const { supabase } = useAuth();
  const qc = useQueryClient();
  const [fecha, setFecha] = useState(hoyCivil);
  const [vista, setVista] = useState<'dia' | 'semana'>('dia');
  const [error, setError] = useState<string | null>(null);
  const [cargandoTurno, setCargandoTurno] = useState(false);

  const {
    data: turnos,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['agenda', fecha],
    enabled: vista === 'dia',
    queryFn: async (): Promise<TurnoAgenda[]> => {
      const { data, error: err } = await supabase.rpc('agenda_dia', { p_fecha: fecha });
      if (err) throw err;
      return data as TurnoAgenda[];
    },
  });

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoTurno }) => {
      const { error: err } = await supabase.rpc('cambiar_estado_turno', {
        p_turno_id: id,
        p_estado: estado,
      });
      if (err) throw new Error(err.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agenda', fecha] }),
  });

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase.rpc('cancelar_turno', { p_turno_id: id });
      if (err) throw new Error(err.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agenda', fecha] }),
  });

  const mover = (dias: number) =>
    setFecha(sumarDiasCiviles(fecha, vista === 'semana' ? dias * 7 : dias));

  const activos = (turnos ?? []).filter((t) => t.estado !== 'cancelado');

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Agenda</h1>
        <div className="flex items-center gap-2">
          {!cargandoTurno && (
            <Boton className="text-sm" onClick={() => setCargandoTurno(true)}>
              Nuevo turno
            </Boton>
          )}
          <Boton variante="secundario" className="text-sm" onClick={() => mover(-1)}>
            ‹
          </Boton>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="min-h-11 rounded-lg border border-slate-300 px-3"
          />
          <Boton variante="secundario" className="text-sm" onClick={() => mover(1)}>
            ›
          </Boton>
          <Boton variante="texto" className="text-sm" onClick={() => setFecha(hoyCivil())}>
            Hoy
          </Boton>

          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {[
              { v: 'dia' as const, t: 'Día' },
              { v: 'semana' as const, t: 'Semana' },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setVista(o.v)}
                className={
                  vista === o.v
                    ? 'rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white'
                    : 'rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-slate-100'
                }
              >
                {o.t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-1 text-sm text-slate-600 first-letter:uppercase">
        {vista === 'dia'
          ? formatearFechaLarga(`${fecha}T12:00:00Z`)
          : `Semana del ${formatearFechaCivil(lunesDeLaSemana(fecha))}`}
        {vista === 'dia' &&
          activos.length > 0 &&
          ` · ${activos.length} turno${activos.length > 1 ? 's' : ''}`}
      </p>

      {cargandoTurno && <NuevoTurno onListo={() => setCargandoTurno(false)} />}

      {error && (
        <div className="mt-4">
          <MensajeError detalle={error} />
        </div>
      )}

      {vista === 'semana' && (
        <VistaSemana
          fecha={fecha}
          profesionalId={null}
          onElegirDia={(d) => {
            setFecha(d);
            setVista('dia');
          }}
        />
      )}

      {vista === 'dia' && isLoading && <Cargando etiqueta="Cargando la agenda" />}

      {vista === 'dia' && isError && (
        <div className="mt-4">
          <MensajeError titulo="No pudimos cargar la agenda" onReintentar={() => void refetch()} />
        </div>
      )}

      {vista === 'dia' && turnos && activos.length === 0 && (
        <div className="mt-6">
          <Vacio
            titulo="Sin turnos para este día"
            descripcion="Los turnos que saquen desde la app aparecen acá automáticamente."
          />
        </div>
      )}

      {vista === 'dia' && activos.length > 0 && (
        <ul className="mt-6 space-y-2">
          {activos.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
              style={{ borderLeftWidth: 4, borderLeftColor: t.color_agenda }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="tabular-nums">{formatearHora(t.inicio)}</span>
                    <span className="mx-2 text-slate-300">·</span>
                    <Link
                      to={`/pacientes/${t.mascota_id}`}
                      className="hover:text-marca-700 hover:underline"
                    >
                      {t.mascota_nombre}
                    </Link>
                  </p>
                  <p className="text-sm text-slate-600">
                    {t.tutor_nombre ?? 'Sin tutor registrado'}
                    {t.tutor_telefono && (
                      <a href={`tel:${t.tutor_telefono}`} className="ml-2 text-marca-600">
                        {t.tutor_telefono}
                      </a>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">{t.profesional}</p>
                  {t.motivo && <p className="mt-1 text-sm text-slate-700">{t.motivo}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      t.estado === 'confirmado'
                        ? 'rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800'
                        : t.estado === 'en_curso'
                          ? 'rounded bg-marca-100 px-2 py-0.5 text-xs text-marca-700'
                          : t.estado === 'atendido'
                            ? 'rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
                            : 'rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800'
                    }
                  >
                    {ETIQUETA_ESTADO[t.estado] ?? t.estado}
                  </span>

                  {(SIGUIENTES[t.estado] ?? []).map((s) => (
                    <Boton
                      key={s.estado}
                      variante="secundario"
                      className="text-sm"
                      cargando={cambiarEstado.isPending}
                      onClick={() => {
                        setError(null);
                        cambiarEstado.mutate(
                          { id: t.id, estado: s.estado },
                          { onError: (e) => setError(e.message) },
                        );
                      }}
                    >
                      {s.texto}
                    </Boton>
                  ))}

                  {t.estado !== 'atendido' && (
                    <Boton
                      variante="texto"
                      className="text-sm text-red-700"
                      cargando={cancelar.isPending}
                      onClick={() => {
                        setError(null);
                        cancelar.mutate(t.id, { onError: (e) => setError(e.message) });
                      }}
                    >
                      Cancelar
                    </Boton>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
