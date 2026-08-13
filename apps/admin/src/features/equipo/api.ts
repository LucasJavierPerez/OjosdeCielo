import type { ClienteSupabase, Rol } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Integrante {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  roles: Rol[];
  activo: boolean;
  creado_en: string;
  soy_yo: boolean;
}

export const clavesEquipo = { todos: ['equipo'] as const };

export function useEquipo(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: clavesEquipo.todos,
    queryFn: async (): Promise<Integrante[]> => {
      const { data, error } = await supabase.rpc('listar_personal');
      if (error) throw error;
      return data as Integrante[];
    },
  });
}

export function useCambiarRoles(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ perfilId, roles }: { perfilId: string; roles: Rol[] }): Promise<void> => {
      const { error } = await supabase.rpc('cambiar_roles', {
        p_perfil_id: perfilId,
        p_roles: roles,
      });
      // El mensaje de la base explica el motivo (último administrador, sacarse
      // el rol propio), así que se propaga en vez de uno genérico.
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesEquipo.todos }),
  });
}

export function useCambiarEstado(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      perfilId,
      activo,
    }: {
      perfilId: string;
      activo: boolean;
    }): Promise<void> => {
      const { error } = await supabase.rpc('cambiar_estado_personal', {
        p_perfil_id: perfilId,
        p_activo: activo,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesEquipo.todos }),
  });
}

export interface DatosInvitacion {
  email: string;
  nombre: string;
  apellido: string;
  roles: Rol[];
}

export function useInvitarPersonal(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: DatosInvitacion): Promise<string> => {
      // Edge Function y no RPC: crear una cuenta necesita service_role, que
      // nunca puede salir del navegador.
      const { data, error } = await supabase.functions.invoke<{
        resultado: string;
        error?: string;
      }>('invitar-personal', { body: datos });

      if (error) {
        // El cuerpo de un error de Edge Function trae el motivo real; sin esto
        // el usuario vería sólo "non-2xx status code".
        const detalle = await leerMotivo(error);
        throw new Error(detalle ?? 'No pudimos enviar la invitación');
      }
      if (!data) throw new Error('No pudimos enviar la invitación');
      return data.resultado;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesEquipo.todos }),
  });
}

async function leerMotivo(error: unknown): Promise<string | null> {
  const contexto = (error as { context?: unknown }).context;
  if (contexto instanceof Response) {
    try {
      const cuerpo = (await contexto.json()) as { error?: string };
      return cuerpo.error ?? null;
    } catch {
      return null;
    }
  }
  return null;
}
