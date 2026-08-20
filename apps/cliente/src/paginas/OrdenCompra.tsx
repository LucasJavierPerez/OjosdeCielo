import { formatearFechaHora } from '@ojosdecielo/core';
import { Boton, Cargando, MensajeError } from '@ojosdecielo/ui';
import { useAuth } from '@ojosdecielo/ui/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Encabezado } from '../componentes/Encabezado.js';

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  pendiente_pago: {
    texto: 'Pendiente de pago en la clínica',
    clase: 'bg-amber-100 text-amber-800',
  },
  pagada: { texto: 'Pagado', clase: 'bg-emerald-100 text-emerald-800' },
  entregada: { texto: 'Entregado', clase: 'bg-emerald-100 text-emerald-800' },
  cancelada: { texto: 'Cancelado', clase: 'bg-slate-100 text-slate-600' },
};

/**
 * El pedido no se paga acá: se paga y se retira en la clínica. La compra
 * desde la app sólo lo genera y reserva el stock — cobrarlo es una acción del
 * personal, en "Pedidos" del panel.
 */
export function OrdenCompra() {
  const { id = '' } = useParams<{ id: string }>();
  const { supabase } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: orden, isLoading } = useQuery({
    queryKey: ['orden', id],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('orden')
        .select('*, items:orden_item (descripcion, cantidad, precio_unitario, subtotal)')
        .eq('id', id)
        .single();
      if (err) throw err;
      return data as unknown as {
        id: string;
        estado: string;
        total: number;
        creado_en: string;
        items: {
          descripcion: string;
          cantidad: number;
          precio_unitario: number;
          subtotal: number;
        }[];
      };
    },
  });

  const cancelar = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error: err } = await supabase.rpc('cancelar_orden', { p_orden_id: id });
      if (err) throw new Error(err.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orden', id] }),
  });

  if (isLoading || !orden) {
    return (
      <main className="safe-top mx-auto min-h-dvh max-w-md px-6 py-6">
        <Encabezado titulo="Tu pedido" volverA="/tienda" />
        <Cargando />
      </main>
    );
  }

  const estado = ETIQUETA_ESTADO[orden.estado] ?? {
    texto: orden.estado,
    clase: 'bg-slate-100 text-slate-600',
  };

  return (
    <main className="safe-top safe-bottom mx-auto min-h-dvh max-w-md px-6 py-6">
      <Encabezado titulo="Tu pedido" volverA="/tienda" />

      <div className="mt-4 flex items-center justify-between">
        <span className={`rounded px-2 py-1 text-sm font-medium ${estado.clase}`}>
          {estado.texto}
        </span>
        <span className="text-sm text-slate-500">{formatearFechaHora(orden.creado_en)}</span>
      </div>

      <ul className="mt-6 divide-y divide-slate-100">
        {orden.items.map((i) => (
          <li key={i.descripcion} className="flex justify-between gap-3 py-2.5">
            <span className="min-w-0 text-sm">
              <span className="block">{i.descripcion}</span>
              <span className="text-xs text-slate-500">
                {i.cantidad} × {pesos(Number(i.precio_unitario))}
              </span>
            </span>
            <span className="tabular-nums text-sm">{pesos(Number(i.subtotal))}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-lg font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{pesos(Number(orden.total))}</span>
      </p>

      {orden.estado === 'pendiente_pago' && (
        <>
          <div className="mt-6 rounded-xl bg-marca-50 p-4">
            <p className="font-medium text-marca-900">Pedido enviado a la clínica</p>
            <p className="mt-1 text-sm text-marca-800">
              Te guardamos los productos. Pasá cuando quieras a pagarlo y retirarlo.
            </p>
          </div>

          {error && (
            <div className="mt-3">
              <MensajeError detalle={error} />
            </div>
          )}

          <Boton
            variante="texto"
            className="mt-4 w-full text-sm text-slate-500"
            cargando={cancelar.isPending}
            onClick={() =>
              cancelar.mutate(undefined, {
                onSuccess: () => void navigate('/tienda'),
                onError: (e) => setError(e.message),
              })
            }
          >
            Cancelar el pedido
          </Boton>
        </>
      )}

      {(orden.estado === 'pagada' || orden.estado === 'entregada') && (
        <div className="mt-6 rounded-xl bg-emerald-50 p-4">
          <p className="font-medium text-emerald-900">¡Listo, ya está pago!</p>
          <p className="mt-1 text-sm text-emerald-800">
            {orden.estado === 'entregada'
              ? 'Ya lo retiraste por la clínica.'
              : 'Pasá a retirarlo por la clínica cuando quieras.'}
          </p>
        </div>
      )}
    </main>
  );
}
