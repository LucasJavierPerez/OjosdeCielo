import { formatearFechaCivil } from '@ojosdecielo/core';
import { Boton, Cargando, cn, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

type TipoEvento =
  | 'consulta'
  | 'aplicacion'
  | 'peso'
  | 'antecedente'
  | 'medicacion'
  | 'receta'
  | 'turno';

interface Evento {
  tipo: TipoEvento;
  origen_id: string;
  fecha: string;
  momento: string | null;
  titulo: string;
  detalle: string | null;
  origen: 'tutor' | 'clinica';
}

const COLOR: Record<TipoEvento, string> = {
  consulta: 'bg-marca-600',
  turno: 'bg-marca-400',
  receta: 'bg-violet-500',
  aplicacion: 'bg-emerald-500',
  peso: 'bg-slate-400',
  antecedente: 'bg-amber-500',
  medicacion: 'bg-acento-500',
};

const PAGINA = 20;

/**
 * Todo lo que le pasó a la mascota, en un solo orden cronológico.
 *
 * Las secciones de abajo siguen existiendo porque sirven para cargar y para
 * comparar dentro de un mismo tipo —la curva de peso, el carnet completo—.
 * Esto contesta otra pregunta: "¿qué le pasó este año?".
 *
 * Se pagina por fecha y no por offset: si mientras el tutor mira se carga un
 * registro nuevo, un offset le repetiría o le saltearía una fila.
 */
export function LineaDeTiempo({ mascotaId }: { mascotaId: string }) {
  const { supabase } = useAuth();
  const [antesDe, setAntesDe] = useState<string | null>(null);
  const [acumulado, setAcumulado] = useState<Evento[]>([]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['linea-tiempo', mascotaId, antesDe],
    queryFn: async (): Promise<Evento[]> => {
      const { data: filas, error } = await supabase.rpc('linea_de_tiempo', {
        p_mascota_id: mascotaId,
        p_limite: PAGINA,
        ...(antesDe && { p_antes_de: antesDe }),
      });
      if (error) throw error;
      return filas as Evento[];
    },
  });

  // La primera página se muestra sola; las siguientes se van sumando.
  const eventos = antesDe === null ? (data ?? []) : [...acumulado, ...(data ?? [])];
  const hayMas = (data?.length ?? 0) === PAGINA;

  const verMas = () => {
    const ultima = eventos.at(-1)?.fecha;
    if (!ultima) return;
    setAcumulado(eventos);
    setAntesDe(ultima);
  };

  if (isLoading) return <Cargando etiqueta="Armando la historia" />;

  if (isError) {
    return (
      <MensajeError titulo="No pudimos armar la historia" onReintentar={() => void refetch()} />
    );
  }

  if (eventos.length === 0) {
    return (
      <Vacio
        titulo="Todavía no hay nada registrado"
        descripcion="A medida que cargues datos o la clínica atienda a tu mascota, todo va a aparecer acá en orden."
      />
    );
  }

  return (
    <div>
      <ol className="relative ml-2 border-l border-slate-200 pl-5">
        {eventos.map((e, i) => (
          <li
            // Dos registros distintos pueden compartir id entre tablas: la
            // clave lleva el tipo para que no colisionen.
            key={`${e.tipo}-${e.origen_id}`}
            className={i === eventos.length - 1 ? 'pb-1' : 'pb-5'}
          >
            <span
              className={cn(
                'absolute -left-[5px] mt-1.5 size-2.5 rounded-full',
                COLOR[e.tipo] ?? 'bg-slate-400',
              )}
              aria-hidden="true"
            />
            <p className="text-xs text-slate-400">{formatearFechaCivil(e.fecha)}</p>
            <p className="font-medium">
              {e.titulo}
              {e.origen === 'tutor' && (
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-500">
                  Lo cargaste vos
                </span>
              )}
            </p>
            {e.detalle && <p className="text-sm text-slate-600">{e.detalle}</p>}
          </li>
        ))}
      </ol>

      {hayMas && (
        <Boton
          variante="secundario"
          className="mt-4 w-full text-sm"
          cargando={isFetching}
          onClick={verMas}
        >
          Ver más atrás
        </Boton>
      )}
    </div>
  );
}
