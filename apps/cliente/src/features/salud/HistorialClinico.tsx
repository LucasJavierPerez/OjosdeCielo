import { formatearFechaHora } from '@ojosdecielo/core';
import type { ClienteSupabase } from '@ojosdecielo/db';
import { Boton, Cargando } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

interface EntradaHistorial {
  id: string;
  fecha: string;
  motivo: string;
  diagnostico: string | null;
  tratamiento: string | null;
  evolucion: string | null;
  anamnesis: string | null;
  examen_fisico: string | null;
  peso_kg: number | null;
  temperatura: number | null;
  profesional: string;
  adjuntos: number;
}

interface Estudio {
  id: string;
  tipo: string;
  nombre_archivo: string;
  storage_path: string;
  tamano_bytes: number;
}

const ETIQUETA_ESTUDIO: Record<string, string> = {
  radiografia: 'Radiografía',
  ecografia: 'Ecografía',
  laboratorio: 'Laboratorio',
  otro: 'Estudio',
};

/**
 * Historia clínica vista por el tutor.
 *
 * Sólo lectura: las consultas son actos profesionales. Lo que sí puede hacer
 * es descargar los estudios, que es de las cosas más útiles de la app —
 * llevarlos a una segunda opinión sin pedirlos por teléfono.
 */
export function HistorialClinico({ mascotaId }: { mascotaId: string }) {
  const { supabase } = useAuth();
  const { data: historial, isLoading } = useQuery({
    queryKey: ['historial', mascotaId],
    queryFn: async (): Promise<EntradaHistorial[]> => {
      const { data, error } = await supabase.rpc('historial_mascota', {
        p_mascota_id: mascotaId,
      });
      if (error) throw error;
      return data as EntradaHistorial[];
    },
  });

  return (
    <section className="border-t border-slate-200 py-5">
      <h2 className="font-medium">
        Consultas
        {historial && historial.length > 0 && (
          <span className="ml-2 text-sm font-normal text-slate-500">{historial.length}</span>
        )}
      </h2>

      {isLoading && <Cargando etiqueta="Cargando consultas" />}

      {historial?.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">
          Cuando la clínica registre una consulta, va a aparecer acá con sus estudios.
        </p>
      )}

      {historial && historial.length > 0 && (
        <ol className="mt-3 space-y-3">
          {historial.map((c) => (
            <Consulta key={c.id} consulta={c} supabase={supabase} />
          ))}
        </ol>
      )}
    </section>
  );
}

function Consulta({
  consulta: c,
  supabase,
}: {
  consulta: EntradaHistorial;
  supabase: ClienteSupabase;
}) {
  const [abierta, setAbierta] = useState(false);

  const { data: estudios } = useQuery({
    queryKey: ['estudios', c.id],
    enabled: abierta && c.adjuntos > 0,
    queryFn: async (): Promise<Estudio[]> => {
      const { data, error } = await supabase
        .from('adjunto')
        .select('id, tipo, nombre_archivo, storage_path, tamano_bytes')
        .eq('consulta_id', c.id);
      if (error) throw error;
      return data as Estudio[];
    },
  });

  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <button
        type="button"
        onClick={() => setAbierta(!abierta)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-medium">{c.motivo}</span>
          <span className="block text-xs text-slate-500">
            {formatearFechaHora(c.fecha)} · {c.profesional}
            {c.adjuntos > 0 && ` · ${c.adjuntos} estudio${c.adjuntos > 1 ? 's' : ''}`}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-slate-400">
          {abierta ? '−' : '+'}
        </span>
      </button>

      {abierta && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <Dato titulo="Diagnóstico" texto={c.diagnostico} />
          <Dato titulo="Tratamiento" texto={c.tratamiento} />
          <Dato titulo="Evolución" texto={c.evolucion} />

          {(c.peso_kg !== null || c.temperatura !== null) && (
            <p className="text-sm text-slate-600">
              {c.peso_kg !== null && `Peso: ${Number(c.peso_kg)} kg`}
              {c.peso_kg !== null && c.temperatura !== null && ' · '}
              {c.temperatura !== null && `Temperatura: ${Number(c.temperatura)} °C`}
            </p>
          )}

          {estudios && estudios.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Estudios
              </h3>
              <ul className="mt-1 space-y-1">
                {estudios.map((e) => (
                  <FilaEstudio key={e.id} estudio={e} supabase={supabase} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Dato({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</h3>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{texto}</p>
    </div>
  );
}

function FilaEstudio({ estudio, supabase }: { estudio: Estudio; supabase: ClienteSupabase }) {
  const [abriendo, setAbriendo] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <span className="min-w-0 text-sm">
        <span className="block truncate">{estudio.nombre_archivo}</span>
        <span className="text-xs text-slate-400">
          {ETIQUETA_ESTUDIO[estudio.tipo] ?? estudio.tipo} ·{' '}
          {(estudio.tamano_bytes / 1024 / 1024).toFixed(1)} MB
        </span>
      </span>

      <Boton
        variante="texto"
        className="shrink-0 text-sm"
        cargando={abriendo}
        onClick={async () => {
          setAbriendo(true);
          // URL firmada: el bucket es privado y una radiografía nunca se sirve
          // desde una ruta pública.
          const { data } = await supabase.storage
            .from('estudios')
            .createSignedUrl(estudio.storage_path, 300);
          setAbriendo(false);
          if (data?.signedUrl) globalThis.open(data.signedUrl, '_blank', 'noopener');
        }}
      >
        Ver
      </Boton>
    </li>
  );
}
