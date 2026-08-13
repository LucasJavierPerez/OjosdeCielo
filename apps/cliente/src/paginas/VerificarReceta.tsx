import { formatearFechaCivil } from '@ojosdecielo/core';
import { Cargando } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router';

interface RecetaVerificada {
  codigo: string;
  estado: 'vigente' | 'dispensada' | 'anulada';
  vencida: boolean;
  emitida_en: string;
  vence_el: string;
  diagnostico: string | null;
  indicaciones: string | null;
  motivo_anulacion: string | null;
  mascota: string;
  especie: string;
  profesional: string;
  matricula: string | null;
  clinica: string;
  clinica_telefono: string | null;
  items: {
    descripcion: string;
    cantidad: string;
    dosis: string;
    duracion: string | null;
  }[];
}

/**
 * Verificación pública de una receta. La abre quien la tiene en la mano:
 * una farmacia, un agropecuario, el propio tutor.
 *
 * Muestra exactamente lo que está impreso en el papel, para poder contrastarlo,
 * y nada del tutor. Contra el riesgo real —receta fotocopiada, con un renglón
 * agregado a mano, o vencida— alcanza: lo que dice acá es lo que emitió el
 * profesional.
 */
export function VerificarReceta() {
  const { codigo = '' } = useParams<{ codigo: string }>();
  const { supabase } = useAuth();

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['verificar-receta', codigo],
    retry: false,
    queryFn: async (): Promise<RecetaVerificada | null> => {
      const { data: fila, error } = await supabase.rpc('verificar_receta', { p_codigo: codigo });
      if (error) throw error;
      return (fila as unknown as RecetaVerificada | null) ?? null;
    },
  });

  if (isLoading) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-12">
        <Cargando />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-12">
        <div className="rounded-xl bg-red-50 p-6 text-center">
          <p className="text-lg font-semibold text-red-900">No existe esta receta</p>
          <p className="mt-2 text-sm text-red-800">
            El código <span className="font-mono">{codigo}</span> no corresponde a ninguna receta
            emitida. Revisá que esté bien copiado.
          </p>
        </div>
      </main>
    );
  }

  const valida = data.estado === 'vigente' && !data.vencida;

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-8">
      <div
        className={
          valida
            ? 'rounded-xl bg-emerald-50 p-5 text-center'
            : 'rounded-xl bg-amber-50 p-5 text-center'
        }
      >
        <p
          className={
            valida
              ? 'text-lg font-semibold text-emerald-900'
              : 'text-lg font-semibold text-amber-900'
          }
        >
          {data.estado === 'anulada'
            ? 'Receta anulada'
            : data.vencida
              ? 'Receta vencida'
              : data.estado === 'dispensada'
                ? 'Receta ya dispensada'
                : 'Receta válida'}
        </p>
        <p className={valida ? 'mt-1 text-sm text-emerald-800' : 'mt-1 text-sm text-amber-800'}>
          {data.estado === 'anulada'
            ? `El profesional la dejó sin efecto: ${data.motivo_anulacion}`
            : data.vencida
              ? `Venció el ${formatearFechaCivil(data.vence_el)}`
              : data.estado === 'dispensada'
                ? 'Ya se entregó la medicación de esta receta'
                : `Válida hasta el ${formatearFechaCivil(data.vence_el)}`}
        </p>
      </div>

      <dl className="mt-6 space-y-3 text-sm">
        <div>
          <dt className="text-slate-500">Emitida por</dt>
          <dd className="font-medium">
            {data.profesional}
            {data.matricula && ` · M.V. ${data.matricula}`}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Clínica</dt>
          <dd>
            {data.clinica}
            {data.clinica_telefono && ` · ${data.clinica_telefono}`}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Paciente</dt>
          <dd>
            {data.mascota} · {data.especie}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Fecha de emisión</dt>
          <dd>{formatearFechaCivil(data.emitida_en.slice(0, 10))}</dd>
        </div>
      </dl>

      <h2 className="mt-6 text-sm font-medium text-slate-500">Contenido de la receta</h2>
      <ul className="mt-2 divide-y divide-slate-100">
        {data.items.map((i) => (
          <li key={`${i.descripcion}-${i.dosis}`} className="py-2.5">
            <p className="font-medium">
              {i.descripcion} — {i.cantidad}
            </p>
            <p className="text-sm text-slate-500">
              {i.dosis}
              {i.duracion && ` · ${i.duracion}`}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-slate-500">
        Si lo que tenés en la mano dice algo distinto de esto, el papel fue adulterado. Ante la
        duda, llamá a la clínica.
      </p>

      <p className="mt-4 text-center font-mono text-xs text-slate-400">{data.codigo}</p>
    </main>
  );
}
