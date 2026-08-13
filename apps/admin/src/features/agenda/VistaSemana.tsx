import { formatearHora, hoyCivil, sumarDiasCiviles } from '@ojosdecielo/core';
import type { Database } from '@ojosdecielo/db';
import { Cargando, cn, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useQuery } from '@tanstack/react-query';

type EstadoTurno = Database['public']['Enums']['estado_turno'];

interface TurnoSemana {
  dia: string;
  id: string;
  inicio: string;
  estado: EstadoTurno;
  mascota_nombre: string;
  tutor_nombre: string | null;
  profesional_id: string;
  profesional: string;
  color_agenda: string;
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * El lunes de la semana a la que pertenece una fecha civil.
 *
 * Se calcula sobre partes de fecha y no sobre un `Date` local para no repetir
 * el desplazamiento de zona que ya rompió la agenda una vez.
 */
export function lunesDeLaSemana(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-').map(Number);
  if (!anio || !mes || !dia) return fecha;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  // getUTCDay(): 0 es domingo. La semana de la clínica empieza el lunes.
  const desdeElLunes = (d.getUTCDay() + 6) % 7;
  return sumarDiasCiviles(fecha, -desdeElLunes);
}

export function VistaSemana({
  fecha,
  profesionalId,
  onElegirDia,
}: {
  fecha: string;
  profesionalId: string | null;
  onElegirDia: (dia: string) => void;
}) {
  const { supabase } = useAuth();
  const lunes = lunesDeLaSemana(fecha);
  const domingo = sumarDiasCiviles(lunes, 6);
  const hoy = hoyCivil();

  const {
    data: turnos,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['agenda-semana', lunes, profesionalId],
    queryFn: async (): Promise<TurnoSemana[]> => {
      const { data, error } = await supabase.rpc('agenda_rango', {
        p_desde: lunes,
        p_hasta: domingo,
        ...(profesionalId && { p_profesional_id: profesionalId }),
      });
      if (error) throw error;
      return data as TurnoSemana[];
    },
  });

  if (isLoading) return <Cargando etiqueta="Cargando la semana" />;

  if (isError) {
    return (
      <div className="mt-4">
        <MensajeError titulo="No pudimos cargar la semana" onReintentar={() => void refetch()} />
      </div>
    );
  }

  const activos = (turnos ?? []).filter((t) => t.estado !== 'cancelado');

  if (activos.length === 0) {
    return (
      <div className="mt-6">
        <Vacio
          titulo="Semana sin turnos"
          descripcion="No hay nada agendado entre estos siete días."
        />
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-x-auto">
      <div className="grid min-w-[900px] grid-cols-7 gap-2">
        {DIAS.map((nombre, i) => {
          const dia = sumarDiasCiviles(lunes, i);
          const delDia = activos.filter((t) => t.dia === dia);
          const esHoy = dia === hoy;

          return (
            <div key={dia} className="min-w-0">
              <button
                type="button"
                onClick={() => onElegirDia(dia)}
                className={cn(
                  'w-full rounded-lg px-2 py-1.5 text-left text-sm',
                  esHoy ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <span className="font-medium">{nombre}</span>{' '}
                <span className={esHoy ? 'text-slate-300' : 'text-slate-400'}>
                  {dia.slice(8, 10)}/{dia.slice(5, 7)}
                </span>
                {delDia.length > 0 && <span className="ml-1 text-xs">· {delDia.length}</span>}
              </button>

              <ul className="mt-2 space-y-1.5">
                {delDia.map((t) => (
                  <li
                    key={t.id}
                    className={cn(
                      'rounded-lg border border-slate-200 bg-white p-2 text-xs',
                      t.estado === 'ausente' && 'opacity-60',
                    )}
                    style={{ borderLeftWidth: 3, borderLeftColor: t.color_agenda }}
                  >
                    <p className="font-medium tabular-nums">{formatearHora(t.inicio)}</p>
                    <p className="truncate">{t.mascota_nombre}</p>
                    <p className="truncate text-slate-500">{t.tutor_nombre ?? 'Sin tutor'}</p>
                    {/* Sin filtro por profesional conviene saber de quién es
                        cada turno; con filtro sería repetir lo mismo siete
                        veces por columna. */}
                    {!profesionalId && (
                      <p className="truncate text-[11px] text-slate-400">{t.profesional}</p>
                    )}
                  </li>
                ))}
                {delDia.length === 0 && (
                  <li className="rounded-lg border border-dashed border-slate-200 p-2 text-center text-[11px] text-slate-300">
                    libre
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
