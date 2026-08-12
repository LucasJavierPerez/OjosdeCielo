import type { ClienteSupabase, Fila } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Turno = Fila<'turno'>;
export type Especialidad = Fila<'especialidad'>;

export interface Slot {
  inicio: string;
  fin: string;
}

export interface ProfesionalConNombre {
  id: string;
  nombre: string;
  apellido: string;
}

export const clavesTurnos = {
  mios: ['turnos'] as const,
  slots: (profesionalId: string, fecha: string, especialidadId: string) =>
    ['slots', profesionalId, fecha, especialidadId] as const,
};

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
      // RPC y no un join a `perfil`: un cliente no puede leer el perfil del
      // veterinario, así que el join devolvería null y la pantalla quedaría
      // vacía sin decir por qué.
      const { data, error } = await supabase.rpc('profesionales_disponibles');
      if (error) throw error;
      return data as ProfesionalConNombre[];
    },
  });
}

export function useSlots(
  supabase: ClienteSupabase,
  profesionalId: string,
  fecha: string,
  especialidadId: string,
) {
  return useQuery({
    queryKey: clavesTurnos.slots(profesionalId, fecha, especialidadId),
    enabled: Boolean(profesionalId && fecha && especialidadId),
    // Los slots se ocupan mientras el usuario mira: no conviene servir caché.
    staleTime: 0,
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await supabase.rpc('slots_disponibles', {
        p_profesional_id: profesionalId,
        p_fecha: fecha,
        p_especialidad_id: especialidadId,
      });
      if (error) throw error;
      return data as Slot[];
    },
  });
}

export interface TurnoConDatos extends Turno {
  mascota: { nombre: string } | null;
  especialidad: { nombre: string } | null;
}

export function useMisTurnos(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: clavesTurnos.mios,
    queryFn: async (): Promise<TurnoConDatos[]> => {
      const { data, error } = await supabase
        .from('turno')
        .select('*, mascota:mascota_id (nombre), especialidad:especialidad_id (nombre)')
        .order('inicio', { ascending: true });
      if (error) throw error;
      return data as unknown as TurnoConDatos[];
    },
  });
}

export function useSolicitarTurno(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: {
      mascotaId: string;
      profesionalId: string;
      especialidadId: string;
      inicio: string;
      motivo?: string;
    }): Promise<Turno> => {
      const { data, error } = await supabase.rpc('solicitar_turno', {
        p_mascota_id: datos.mascotaId,
        p_profesional_id: datos.profesionalId,
        p_especialidad_id: datos.especialidadId,
        p_inicio: datos.inicio,
        ...(datos.motivo?.trim() && { p_motivo: datos.motivo.trim() }),
      });
      // El mensaje de la base explica el motivo real ("ese horario ya no está
      // disponible"), que es más útil que uno genérico.
      if (error) throw new Error(error.message);
      return data as Turno;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesTurnos.mios });
      void qc.invalidateQueries({ queryKey: ['slots'] });
    },
  });
}

export function useCancelarTurno(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (turnoId: string): Promise<void> => {
      const { error } = await supabase.rpc('cancelar_turno', { p_turno_id: turnoId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesTurnos.mios });
      void qc.invalidateQueries({ queryKey: ['slots'] });
    },
  });
}
