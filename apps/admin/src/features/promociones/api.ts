import type { ClienteSupabase, Fila } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Promocion = Fila<'promocion'>;

export const clavesPromo = {
  todas: ['promociones'] as const,
};

export function usePromociones(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: clavesPromo.todas,
    queryFn: async (): Promise<Promocion[]> => {
      const { data, error } = await supabase
        .from('promocion')
        .select('*')
        .order('desde', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export interface DatosPromocion {
  titulo: string;
  tipoDescuento: 'porcentaje' | 'monto';
  valor: number;
  alcance: 'todo' | 'categoria' | 'producto';
  categoria?: string;
  productoId?: string;
  desde: string;
  hasta: string;
}

export function useCrearPromocion(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: DatosPromocion): Promise<void> => {
      const { error } = await supabase.from('promocion').insert({
        titulo: d.titulo.trim(),
        tipo_descuento: d.tipoDescuento,
        valor: d.valor,
        producto_id: d.alcance === 'producto' ? d.productoId : null,
        categoria: d.alcance === 'categoria' ? d.categoria : null,
        desde: d.desde,
        hasta: d.hasta,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesPromo.todas }),
  });
}

export function usePausarPromocion(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activa }: { id: string; activa: boolean }): Promise<void> => {
      const { error } = await supabase.from('promocion').update({ activa }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesPromo.todas }),
  });
}
