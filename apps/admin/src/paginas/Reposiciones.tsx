import {
  formatearFechaCivil,
  hoyCivil,
  puedeCargarHistoriaClinica,
  textoRelativo,
} from '@ojosdecielo/core';
import { Boton, Cargando, Entrada, MensajeError, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Link } from 'react-router';
import { Layout } from '../componentes/Layout.js';
import {
  type ReposicionPendiente,
  useReposiciones,
  useResolverReposicion,
} from '../features/recetario/api.js';

export function Reposiciones() {
  const { supabase, perfil } = useAuth();
  const { data: pedidos, isLoading, isError, refetch } = useReposiciones(supabase);

  const puedoResolver = perfil ? puedeCargarHistoriaClinica(perfil.roles) : false;

  return (
    <Layout>
      <h1 className="text-xl font-semibold">Reposiciones</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pedidos de renovación de medicación crónica. Aprobar acá no emite la receta: dejá asentada
        la decisión y emitila desde la ficha del paciente.
      </p>

      {!puedoResolver && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Podés ver los pedidos, pero resolverlos es exclusivo del veterinario.
        </p>
      )}

      {isLoading && <Cargando etiqueta="Cargando pedidos" />}

      {isError && (
        <div className="mt-4">
          <MensajeError
            titulo="No pudimos cargar los pedidos"
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {pedidos && pedidos.length === 0 && (
        <div className="mt-6">
          <Vacio
            titulo="No hay pedidos pendientes"
            descripcion="Cuando un tutor pida reposición de un crónico, aparece acá."
          />
        </div>
      )}

      {pedidos && pedidos.length > 0 && (
        <ul className="mt-4 space-y-3">
          {pedidos.map((p) => (
            <Pedido key={p.id} pedido={p} puedoResolver={puedoResolver} />
          ))}
        </ul>
      )}
    </Layout>
  );
}

function Pedido({
  pedido,
  puedoResolver,
}: {
  pedido: ReposicionPendiente;
  puedoResolver: boolean;
}) {
  const { supabase } = useAuth();
  const resolver = useResolverReposicion(supabase);
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recetaVencida = pedido.receta_vence_el < hoyCivil();

  const decidir = (aprobar: boolean) => {
    setError(null);
    resolver.mutate(
      { id: pedido.id, aprobar, ...(nota.trim() && { nota: nota.trim() }) },
      { onError: (e) => setError(e.message) },
    );
  };

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Link
          to={`/pacientes/${pedido.mascota_id}`}
          className="font-medium hover:text-marca-700 hover:underline"
        >
          {pedido.mascota}
        </Link>
        <span className="text-sm text-slate-500">{textoRelativo(pedido.solicitado_en)}</span>
      </div>

      <p className="mt-2">
        <span className="font-medium">{pedido.medicamento}</span>
        <span className="block text-sm text-slate-500">{pedido.dosis}</span>
      </p>

      <p className="mt-2 text-sm text-slate-500">
        Lo pide {pedido.solicitante} · receta{' '}
        <span className="font-mono text-xs">{pedido.receta_codigo}</span>, vence{' '}
        {formatearFechaCivil(pedido.receta_vence_el)}
        {recetaVencida && <span className="ml-2 font-medium text-amber-700">vencida</span>}
      </p>

      {pedido.nota_tutor && (
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
          “{pedido.nota_tutor}”
        </p>
      )}

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      {puedoResolver && (
        <div className="mt-3">
          <label htmlFor={`nota-${pedido.id}`} className="sr-only">
            Respuesta para el tutor
          </label>
          <Entrada
            id={`nota-${pedido.id}`}
            value={nota}
            placeholder="Respuesta para el tutor (opcional)"
            onChange={(e) => setNota(e.target.value)}
            className="mt-0"
          />
          <div className="mt-3 flex gap-2">
            <Boton cargando={resolver.isPending} onClick={() => decidir(true)}>
              Aprobar
            </Boton>
            <Boton variante="secundario" onClick={() => decidir(false)}>
              Rechazar
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}
