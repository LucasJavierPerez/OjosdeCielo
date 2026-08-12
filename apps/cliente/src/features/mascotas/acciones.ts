import type { ClienteSupabase } from '@ojosdecielo/db';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clavesMascotas } from './api.js';

/**
 * Acciones que sacan una mascota de la vista del tutor.
 *
 * Cada una responde a una situación distinta y con consecuencias distintas;
 * ver `supabase/migrations/*_archivar_mascota.sql` para el detalle de qué
 * permite cada una.
 */

function invalidarTodo(qc: ReturnType<typeof useQueryClient>, mascotaId?: string) {
  void qc.invalidateQueries({ queryKey: clavesMascotas.todas });
  if (mascotaId) void qc.invalidateQueries({ queryKey: clavesMascotas.una(mascotaId) });
}

export function useArchivarMascota(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.rpc('archivar_mascota', { p_mascota_id: mascotaId });
      if (error) throw error;
    },
    onSuccess: () => invalidarTodo(qc, mascotaId),
  });
}

export function useDesarchivarMascota(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.rpc('desarchivar_mascota', { p_mascota_id: mascotaId });
      if (error) throw error;
    },
    onSuccess: () => invalidarTodo(qc, mascotaId),
  });
}

export function useMarcarFallecida(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fecha: string): Promise<void> => {
      const { error } = await supabase.rpc('marcar_fallecida', {
        p_mascota_id: mascotaId,
        p_fecha: fecha,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidarTodo(qc, mascotaId),
  });
}

export function useDejarMascota(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.rpc('dejar_mascota', { p_mascota_id: mascotaId });
      if (error) throw error;
    },
    onSuccess: () => invalidarTodo(qc),
  });
}

export function useEliminarMascota(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.rpc('eliminar_mascota', { p_mascota_id: mascotaId });
      // El mensaje de la base explica por qué no se pudo (otros tutores, o
      // atención registrada por la clínica), así que se propaga tal cual.
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidarTodo(qc),
  });
}
