import type { ClienteSupabase, Fila } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Receta = Fila<'receta'>;
export type RecetaItem = Fila<'receta_item'>;

export interface RecetaConItems extends Receta {
  items: RecetaItem[];
}

// `type` y no `interface` a propósito: se manda como jsonb a la RPC y sólo un
// alias de tipo obtiene el índice implícito que exige `Json`. Con `interface`
// TypeScript rechaza la asignación.
export type ItemNuevo = {
  descripcion: string;
  cantidad: string;
  dosis: string;
  duracion?: string;
  cronico: boolean;
};

export interface ReposicionPendiente {
  id: string;
  solicitado_en: string;
  nota_tutor: string | null;
  mascota_id: string;
  mascota: string;
  especie: string;
  medicamento: string;
  dosis: string;
  receta_id: string;
  receta_codigo: string;
  receta_vence_el: string;
  solicitante: string;
}

export const clavesRecetario = {
  deMascota: (id: string) => ['recetas', id] as const,
  reposiciones: ['reposiciones'] as const,
};

export function useRecetas(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: clavesRecetario.deMascota(mascotaId),
    enabled: Boolean(mascotaId),
    queryFn: async (): Promise<RecetaConItems[]> => {
      const { data, error } = await supabase
        .from('receta')
        .select('*, items:receta_item (*)')
        .eq('mascota_id', mascotaId)
        .order('emitida_en', { ascending: false });
      if (error) throw error;
      return data as unknown as RecetaConItems[];
    },
  });
}

export function useEmitirReceta(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: {
      venceEl: string;
      items: ItemNuevo[];
      diagnostico?: string;
      indicaciones?: string;
      consultaId?: string;
    }): Promise<Receta> => {
      const { data, error } = await supabase.rpc('emitir_receta', {
        p_mascota_id: mascotaId,
        p_vence_el: r.venceEl,
        p_items: r.items,
        ...(r.diagnostico?.trim() && { p_diagnostico: r.diagnostico.trim() }),
        ...(r.indicaciones?.trim() && { p_indicaciones: r.indicaciones.trim() }),
        ...(r.consultaId && { p_consulta_id: r.consultaId }),
      });
      if (error) throw new Error(error.message);
      return data as Receta;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesRecetario.deMascota(mascotaId) }),
  });
}

export function useAnularReceta(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }): Promise<void> => {
      const { error } = await supabase.rpc('anular_receta', {
        p_receta_id: id,
        p_motivo: motivo,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesRecetario.deMascota(mascotaId) }),
  });
}

export function useMarcarDispensada(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.rpc('marcar_receta_dispensada', { p_receta_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesRecetario.deMascota(mascotaId) }),
  });
}

// ---------------------------------------------------------------------------
// Reposiciones de medicación crónica
// ---------------------------------------------------------------------------

export function useReposiciones(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: clavesRecetario.reposiciones,
    queryFn: async (): Promise<ReposicionPendiente[]> => {
      const { data, error } = await supabase.rpc('reposiciones_pendientes');
      if (error) throw error;
      return data as ReposicionPendiente[];
    },
  });
}

export function useResolverReposicion(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: {
      id: string;
      aprobar: boolean;
      nota?: string;
      recetaNuevaId?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('resolver_reposicion', {
        p_solicitud_id: r.id,
        p_aprobar: r.aprobar,
        ...(r.nota?.trim() && { p_nota: r.nota.trim() }),
        ...(r.recetaNuevaId && { p_receta_nueva_id: r.recetaNuevaId }),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesRecetario.reposiciones });
      void qc.invalidateQueries({ queryKey: ['recetas'] });
    },
  });
}
