import type { ClienteSupabase, Fila } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Especialidad = Fila<'especialidad'>;

export interface ProfesionalConNombre {
  id: string;
  nombre: string;
  apellido: string;
}

export function useEspecialidades(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: ['especialidades'],
    queryFn: async (): Promise<Especialidad[]> => {
      const { data, error } = await supabase
        .from('especialidad')
        .select('*')
        .eq('activa', true)
        .order('nombre');
      if (error) throw error;
      return data;
    },
  });
}

export function useProfesionales(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: ['profesionales'],
    queryFn: async (): Promise<ProfesionalConNombre[]> => {
      const { data, error } = await supabase.rpc('profesionales_disponibles');
      if (error) throw error;
      return data as ProfesionalConNombre[];
    },
  });
}

/**
 * Cargar un turno desde el panel.
 *
 * `solicitar_turno()` ya distingue al personal: salta la validación de slot
 * (una urgencia o un encaje no tienen por qué caer justo en la grilla) y crea
 * el turno confirmado directo, sin pasar por "a confirmar".
 */
export function useCrearTurnoPersonal(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: {
      mascotaId: string;
      profesionalId: string;
      especialidadId: string;
      inicio: string;
      motivo?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('solicitar_turno', {
        p_mascota_id: datos.mascotaId,
        p_profesional_id: datos.profesionalId,
        p_especialidad_id: datos.especialidadId,
        p_inicio: datos.inicio,
        ...(datos.motivo?.trim() && { p_motivo: datos.motivo.trim() }),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agenda'] }),
  });
}
