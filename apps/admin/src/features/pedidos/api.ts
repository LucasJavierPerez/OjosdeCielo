import type { ClienteSupabase, Database } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type MedioPago = Database['public']['Enums']['medio_pago'];

export interface ItemPedido {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface Pedido {
  id: string;
  estado: string;
  total: number;
  creado_en: string;
  notas: string | null;
  cliente: { nombre: string; apellido: string; telefono: string | null } | null;
  items: ItemPedido[];
}

export const clavesPedidos = {
  todos: ['pedidos'] as const,
};

/**
 * Los pedidos que la app le hace a la clínica, sin pasar por Mercado Pago:
 * el tutor los genera desde la tienda y el personal los cobra acá cuando la
 * persona pasa a retirarlos.
 */
export function usePedidos(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: clavesPedidos.todos,
    queryFn: async (): Promise<Pedido[]> => {
      const { data, error } = await supabase
        .from('orden')
        .select(
          '*, cliente:cliente_id (nombre, apellido, telefono), items:orden_item (descripcion, cantidad, precio_unitario, subtotal)',
        )
        .eq('canal', 'app')
        .order('creado_en', { ascending: false });
      if (error) throw error;
      return data as unknown as Pedido[];
    },
  });
}

export function useCobrarPedido(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, medio }: { id: string; medio: MedioPago }): Promise<void> => {
      const { error } = await supabase.rpc('confirmar_pedido_local', {
        p_orden_id: id,
        p_medio: medio,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesPedidos.todos }),
  });
}

export function useEntregarPedido(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('orden').update({ estado: 'entregada' }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesPedidos.todos }),
  });
}

export function useCancelarPedido(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.rpc('cancelar_orden', { p_orden_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesPedidos.todos }),
  });
}
