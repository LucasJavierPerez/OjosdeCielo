import { formatearFechaCivil, hoyCivil } from '@ojosdecielo/core';
import { Boton, Cargando, cn, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';
import {
  type ItemReceta,
  type RecetaDelTutor,
  type SolicitudReposicion,
  useRecetasDeMascota,
  useSolicitarReposicion,
  useSolicitudes,
} from '../features/recetas/api.js';

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  vigente: { texto: 'Vigente', clase: 'bg-emerald-100 text-emerald-800' },
  dispensada: { texto: 'Ya retirada', clase: 'bg-slate-100 text-slate-600' },
  anulada: { texto: 'Anulada', clase: 'bg-red-100 text-red-800' },
};

const ETIQUETA_SOLICITUD: Record<string, string> = {
  pendiente: 'Pedido enviado, esperando al veterinario',
  aprobada: 'Reposición aprobada',
  rechazada: 'Reposición rechazada',
};

export function RecetasMascota() {
  const { id = '' } = useParams<{ id: string }>();
  const { supabase } = useAuth();
  const { data: recetas, isLoading, isError, refetch } = useRecetasDeMascota(supabase, id);
  const { data: solicitudes } = useSolicitudes(supabase, id);

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo="Recetas" volverA={`/mascotas/${id}`} />

      {isLoading && <Cargando etiqueta="Cargando recetas" />}

      {isError && (
        <div className="mt-4">
          <MensajeError
            titulo="No pudimos cargar las recetas"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {recetas && recetas.length === 0 && (
        <div className="mt-6">
          <Vacio
            titulo="Sin recetas"
            descripcion="Cuando el veterinario emita una receta la vas a ver acá, lista para mostrar en la farmacia."
          />
        </div>
      )}

      {recetas && recetas.length > 0 && (
        <ul className="mt-4 space-y-3">
          {recetas.map((r) => (
            <Receta key={r.id} receta={r} mascotaId={id} solicitudes={solicitudes ?? []} />
          ))}
        </ul>
      )}
    </main>
  );
}

function Receta({
  receta,
  mascotaId,
  solicitudes,
}: {
  receta: RecetaDelTutor;
  mascotaId: string;
  solicitudes: SolicitudReposicion[];
}) {
  const estado = ETIQUETA_ESTADO[receta.estado] ?? {
    texto: receta.estado,
    clase: 'bg-slate-100 text-slate-600',
  };
  const vencida = receta.vence_el < hoyCivil();
  const usable = receta.estado === 'vigente' && !vencida;

  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn('rounded px-2 py-0.5 text-xs font-medium', estado.clase)}>
          {estado.texto}
        </span>
        {receta.estado === 'vigente' && vencida && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Vencida
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-500">
        {formatearFechaCivil(receta.emitida_en.slice(0, 10))} · vence{' '}
        {formatearFechaCivil(receta.vence_el)}
      </p>

      {receta.diagnostico && <p className="mt-2 text-sm">{receta.diagnostico}</p>}

      <ul className="mt-3 space-y-3">
        {[...receta.items]
          .sort((a, b) => a.orden - b.orden)
          .map((i) => (
            <Medicamento
              key={i.id}
              item={i}
              mascotaId={mascotaId}
              recetaUsable={usable}
              solicitud={solicitudes.find((s) => s.receta_item_id === i.id)}
            />
          ))}
      </ul>

      {receta.indicaciones && (
        <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
          {receta.indicaciones}
        </p>
      )}

      {receta.estado === 'anulada' && receta.motivo_anulacion && (
        <p className="mt-3 text-sm text-red-700">
          El veterinario la anuló: {receta.motivo_anulacion}
        </p>
      )}

      {receta.estado !== 'anulada' && (
        <Link
          to={`/recetas/${receta.id}`}
          className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-slate-300 font-medium"
        >
          Ver e imprimir
        </Link>
      )}
    </li>
  );
}

function Medicamento({
  item,
  mascotaId,
  recetaUsable,
  solicitud,
}: {
  item: ItemReceta;
  mascotaId: string;
  recetaUsable: boolean;
  solicitud: SolicitudReposicion | undefined;
}) {
  const { supabase } = useAuth();
  const pedir = useSolicitarReposicion(supabase, mascotaId);
  const [pidiendo, setPidiendo] = useState(false);
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Un pedido resuelto no bloquea uno nuevo: el tratamiento sigue mes a mes.
  const pendiente = solicitud?.estado === 'pendiente';

  return (
    <li>
      <p className="font-medium">{item.descripcion}</p>
      <p className="text-sm text-slate-500">
        {item.cantidad} · {item.dosis}
        {item.duracion && ` · ${item.duracion}`}
      </p>

      {solicitud && (
        <p
          className={cn(
            'mt-1 text-xs',
            solicitud.estado === 'aprobada' && 'text-emerald-700',
            solicitud.estado === 'rechazada' && 'text-red-700',
            solicitud.estado === 'pendiente' && 'text-slate-500',
          )}
        >
          {ETIQUETA_SOLICITUD[solicitud.estado]}
          {solicitud.nota_respuesta && `: ${solicitud.nota_respuesta}`}
        </p>
      )}

      {error && (
        <div className="mt-2">
          <MensajeError detalle={error} />
        </div>
      )}

      {item.cronico && recetaUsable && !pendiente && !pidiendo && (
        <Boton variante="secundario" className="mt-2 text-sm" onClick={() => setPidiendo(true)}>
          Pedir reposición
        </Boton>
      )}

      {pidiendo && (
        <div className="mt-2 rounded-lg bg-slate-100 p-3">
          <label htmlFor={`nota-${item.id}`} className="text-sm text-slate-700">
            ¿Querés agregar algo?
          </label>
          <input
            id={`nota-${item.id}`}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Se le termina el viernes"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <Boton
              className="text-sm"
              cargando={pedir.isPending}
              onClick={() => {
                setError(null);
                pedir.mutate(
                  { itemId: item.id, ...(nota.trim() && { nota }) },
                  {
                    onSuccess: () => {
                      setPidiendo(false);
                      setNota('');
                    },
                    onError: (e) => setError(e.message),
                  },
                );
              }}
            >
              Enviar pedido
            </Boton>
            <Boton
              variante="texto"
              className="text-sm text-slate-500"
              onClick={() => setPidiendo(false)}
            >
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}
