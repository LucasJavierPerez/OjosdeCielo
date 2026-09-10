import type { ClienteSupabase, Fila } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Servicio = Fila<'servicio'>;

export const clavesServicios = {
  todos: ['servicios'] as const,
};

export function useServicios(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: clavesServicios.todos,
    queryFn: async (): Promise<Servicio[]> => {
      const { data, error } = await supabase
        .from('servicio')
        .select('*')
        .order('categoria', { ascending: true, nullsFirst: false })
        .order('nombre');
      if (error) throw error;
      return data;
    },
  });
}

export interface DatosServicio {
  nombre: string;
  precio: number;
  categoria?: string;
  notas?: string;
}

export function useCrearServicio(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: DatosServicio): Promise<void> => {
      const { error } = await supabase.from('servicio').insert({
        nombre: d.nombre.trim(),
        precio: d.precio,
        categoria: d.categoria?.trim() || null,
        notas: d.notas?.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesServicios.todos }),
  });
}

export function useActualizarServicio(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: DatosServicio & { id: string; activo: boolean }): Promise<void> => {
      const { error } = await supabase
        .from('servicio')
        .update({
          nombre: d.nombre.trim(),
          precio: d.precio,
          categoria: d.categoria?.trim() || null,
          notas: d.notas?.trim() || null,
          activo: d.activo,
        })
        .eq('id', d.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesServicios.todos }),
  });
}
