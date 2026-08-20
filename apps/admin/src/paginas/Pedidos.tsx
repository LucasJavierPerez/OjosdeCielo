import { formatearFechaHora } from '@ojosdecielo/core';
import type { Database } from '@ojosdecielo/db';
import { Boton, Cargando, cn, MensajeError, Seleccion, Vacio } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useState } from 'react';
import { Layout } from '../componentes/Layout.js';
import {
  type Pedido,
  useCancelarPedido,
  useCobrarPedido,
  useEntregarPedido,
  usePedidos,
} from '../features/pedidos/api.js';

type MedioPago = Database['public']['Enums']['medio_pago'];

const MEDIOS: { valor: MedioPago; texto: string }[] = [
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'debito', texto: 'Débito' },
  { valor: 'credito', texto: 'Crédito' },
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'cuenta_corriente', texto: 'Cuenta corriente' },
];

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  pendiente_pago: { texto: 'Esperando que lo retiren', clase: 'bg-amber-100 text-amber-800' },
  pagada: { texto: 'Pagado, falta entregar', clase: 'bg-marca-100 text-marca-700' },
  entregada: { texto: 'Entregado', clase: 'bg-emerald-100 text-emerald-800' },
  cancelada: { texto: 'Cancelado', clase: 'bg-slate-100 text-slate-500' },
};

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

/**
 * Pedidos hechos desde la app, sin Mercado Pago: el tutor los genera y
 * reserva el stock, pero el pago se cobra acá cuando pasa a retirarlos.
 */
export function Pedidos() {
  const { supabase } = useAuth();
  const { data: pedidos, isLoading, isError, refetch } = usePedidos(supabase);

  const pendientes = (pedidos ?? []).filter((p) => p.estado === 'pendiente_pago');
  const paraEntregar = (pedidos ?? []).filter((p) => p.estado === 'pagada');
  const resto = (pedidos ?? []).filter(
    (p) => p.estado !== 'pendiente_pago' && p.estado !== 'pagada',
  );

  return (
    <Layout>
      <h1 className="text-xl font-semibold">Pedidos</h1>
      <p className="mt-1 text-sm text-slate-500">
        Compras hechas desde la app. Se pagan y se retiran acá, no por Mercado Pago.
      </p>

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
            titulo="Todavía no hay pedidos"
            descripcion="Los pedidos que hagan los tutores desde la tienda aparecen acá."
          />
        </div>
      )}

      {pendientes.length > 0 && (
        <Bloque titulo="Esperando cobro">
          {pendientes.map((p) => (
            <FilaPedido key={p.id} pedido={p} />
          ))}
        </Bloque>
      )}

      {paraEntregar.length > 0 && (
        <Bloque titulo="Pagados, falta entregar">
          {paraEntregar.map((p) => (
            <FilaPedido key={p.id} pedido={p} />
          ))}
        </Bloque>
      )}

      {resto.length > 0 && (
        <Bloque titulo="Historial">
          {resto.map((p) => (
            <FilaPedido key={p.id} pedido={p} />
          ))}
        </Bloque>
      )}
    </Layout>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-slate-500">{titulo}</h2>
      <ul className="mt-2 space-y-3">{children}</ul>
    </section>
  );
}

function FilaPedido({ pedido }: { pedido: Pedido }) {
  const { supabase } = useAuth();
  const cobrar = useCobrarPedido(supabase);
  const entregar = useEntregarPedido(supabase);
  const cancelar = useCancelarPedido(supabase);
  const [medio, setMedio] = useState<MedioPago>('efectivo');
  const [error, setError] = useState<string | null>(null);

  const estado = ETIQUETA_ESTADO[pedido.estado] ?? {
    texto: pedido.estado,
    clase: 'bg-slate-100 text-slate-600',
  };

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className={cn('rounded px-2 py-0.5 text-xs font-medium', estado.clase)}>
            {estado.texto}
          </span>
          <span className="ml-2 font-medium">
            {pedido.cliente ? `${pedido.cliente.nombre} ${pedido.cliente.apellido}` : 'Tutor'}
          </span>
          {pedido.cliente?.telefono && (
            <a href={`tel:${pedido.cliente.telefono}`} className="ml-2 text-sm text-marca-600">
              {pedido.cliente.telefono}
            </a>
          )}
        </div>
        <span className="text-sm text-slate-500">{formatearFechaHora(pedido.creado_en)}</span>
      </div>

      <ul className="mt-2 divide-y divide-slate-100 text-sm">
        {pedido.items.map((i) => (
          <li key={i.descripcion} className="flex justify-between py-1.5">
            <span>
              {i.cantidad} × {i.descripcion}
            </span>
            <span className="tabular-nums text-slate-500">{pesos(Number(i.subtotal))}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 font-medium">
        <span>Total</span>
        <span className="tabular-nums">{pesos(Number(pedido.total))}</span>
      </p>

      {error && (
        <div className="mt-3">
          <MensajeError detalle={error} />
        </div>
      )}

      {pedido.estado === 'pendiente_pago' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Seleccion
            aria-label="Medio de pago"
            value={medio}
            onChange={(e) => setMedio(e.target.value as MedioPago)}
            className="w-auto"
          >
            {MEDIOS.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.texto}
              </option>
            ))}
          </Seleccion>
          <Boton
            className="text-sm"
            cargando={cobrar.isPending}
            onClick={() => {
              setError(null);
              cobrar.mutate({ id: pedido.id, medio }, { onError: (e) => setError(e.message) });
            }}
          >
            Cobrar
          </Boton>
          <Boton
            variante="texto"
            className="text-sm text-slate-500"
            cargando={cancelar.isPending}
            onClick={() => {
              setError(null);
              cancelar.mutate(pedido.id, { onError: (e) => setError(e.message) });
            }}
          >
            Cancelar
          </Boton>
        </div>
      )}

      {pedido.estado === 'pagada' && (
        <div className="mt-3">
          <Boton
            className="text-sm"
            cargando={entregar.isPending}
            onClick={() => {
              setError(null);
              entregar.mutate(pedido.id, { onError: (e) => setError(e.message) });
            }}
          >
            Marcar entregado
          </Boton>
        </div>
      )}
    </li>
  );
}
