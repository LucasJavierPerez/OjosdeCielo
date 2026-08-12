import type { ClienteSupabase, InvitacionTutor, RolTutor } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { clavesMascotas } from './api.js';

export interface Tutor {
  id: string;
  perfil_id: string;
  rol: RolTutor;
  desde: string;
  nombre: string;
  apellido: string;
  email: string;
  soy_yo: boolean;
}

export function useTutores(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: clavesMascotas.tutores(mascotaId),
    queryFn: async (): Promise<Tutor[]> => {
      // RPC y no un join a `perfil`: un tutor no puede leer el perfil de otro,
      // y RLS filtra filas pero no columnas. La función devuelve exactamente
      // nombre, apellido y email — nada de dni ni teléfono.
      const { data, error } = await supabase.rpc('tutores_de_mascota', {
        p_mascota_id: mascotaId,
      });
      if (error) throw error;
      return data as Tutor[];
    },
  });
}

export function useInvitacionesPendientes(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: [...clavesMascotas.tutores(mascotaId), 'invitaciones'],
    queryFn: async (): Promise<InvitacionTutor[]> => {
      const { data, error } = await supabase
        .from('invitacion_tutor')
        .select('*')
        .eq('mascota_id', mascotaId)
        .is('aceptada_en', null)
        .is('revocada_en', null)
        .gt('vence_en', new Date().toISOString())
        .order('creado_en', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useInvitarTutor(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<InvitacionTutor> => {
      const { data, error } = await supabase.rpc('invitar_tutor', { p_mascota_id: mascotaId });
      if (error) throw error;
      return data as InvitacionTutor;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesMascotas.tutores(mascotaId) }),
  });
}

export function useRevocarInvitacion(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invitacionId: string): Promise<void> => {
      const { error } = await supabase.rpc('revocar_invitacion', {
        p_invitacion_id: invitacionId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesMascotas.tutores(mascotaId) }),
  });
}

export function useRevocarTutor(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (perfilId: string): Promise<void> => {
      const { error } = await supabase.rpc('revocar_tutor', {
        p_mascota_id: mascotaId,
        p_perfil_id: perfilId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesMascotas.tutores(mascotaId) }),
  });
}

export function useTransferirTitularidad(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nuevoTitular: string): Promise<void> => {
      const { error } = await supabase.rpc('transferir_titularidad', {
        p_mascota_id: mascotaId,
        p_nuevo_titular: nuevoTitular,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesMascotas.tutores(mascotaId) }),
  });
}

export function useAceptarInvitacion(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string): Promise<{ id: string; nombre: string }> => {
      const { data, error } = await supabase.rpc('aceptar_invitacion', { p_token: token });
      if (error) throw error;
      return data as { id: string; nombre: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesMascotas.todas }),
  });
}

/**
 * Mantiene la vista al día cuando el otro tutor hace cambios.
 *
 * Realtime respeta RLS, así que la suscripción no abre un canal lateral: sólo
 * llegan eventos de filas que este usuario ya podría leer. Se desuscribe al
 * desmontar — cada canal abierto cuesta.
 */
export function useRealtimeMascota(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const canal = supabase
      .channel(`mascota:${mascotaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mascota', filter: `id=eq.${mascotaId}` },
        () => {
          void qc.invalidateQueries({ queryKey: clavesMascotas.una(mascotaId) });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mascota_tutor',
          filter: `mascota_id=eq.${mascotaId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: clavesMascotas.tutores(mascotaId) });
          // Un acceso revocado saca la mascota de la lista del otro tutor.
          void qc.invalidateQueries({ queryKey: clavesMascotas.todas });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, mascotaId, qc]);
}
