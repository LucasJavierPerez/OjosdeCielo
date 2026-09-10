import type { ClienteSupabase, Fila } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type GastoFijo = Fila<'gasto_fijo'>;
export type GastoFijoRegistro = Fila<'gasto_fijo_registro'>;

export interface ResumenGasto {
  gasto_fijo_id: string;
  concepto: string;
  categoria: string | null;
  ultimo_periodo: string | null;
  ultimo_monto: number | null;
}

export const clavesGastos = {
  resumen: ['gastos-fijos', 'resumen'] as const,
  historial: (gastoFijoId: string) => ['gastos-fijos', gastoFijoId, 'historial'] as const,
};

export function useResumenGastos(supabase: ClienteSupabase, habilitado: boolean) {
  return useQuery({
    queryKey: clavesGastos.resumen,
    enabled: habilitado,
    queryFn: async (): Promise<ResumenGasto[]> => {
      const { data, error } = await supabase.rpc('gastos_fijos_resumen');
      if (error) throw error;
      return data as ResumenGasto[];
    },
  });
}

export function useHistorialGasto(
  supabase: ClienteSupabase,
  gastoFijoId: string,
  habilitado: boolean,
) {
  return useQuery({
    queryKey: clavesGastos.historial(gastoFijoId),
    enabled: habilitado,
    queryFn: async (): Promise<GastoFijoRegistro[]> => {
      const { data, error } = await supabase
        .from('gasto_fijo_registro')
        .select('*')
        .eq('gasto_fijo_id', gastoFijoId)
        .order('periodo', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCrearGastoFijo(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { concepto: string; categoria?: string }): Promise<void> => {
      const { error } = await supabase.from('gasto_fijo').insert({
        concepto: d.concepto.trim(),
        categoria: d.categoria?.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesGastos.resumen }),
  });
}

/**
 * Carga o corrige el monto de un mes. `upsert` sobre el índice único
 * (gasto_fijo_id, periodo): un segundo registro del mismo mes reemplaza al
 * anterior en vez de fallar.
 */
export function useRegistrarMonto(supabase: ClienteSupabase, gastoFijoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { periodo: string; monto: number; notas?: string }): Promise<void> => {
      const { error } = await supabase.from('gasto_fijo_registro').upsert(
        {
          gasto_fijo_id: gastoFijoId,
          periodo: d.periodo,
          monto: d.monto,
          notas: d.notas?.trim() || null,
        },
        { onConflict: 'gasto_fijo_id,periodo' },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesGastos.resumen });
      void qc.invalidateQueries({ queryKey: clavesGastos.historial(gastoFijoId) });
    },
  });
}
