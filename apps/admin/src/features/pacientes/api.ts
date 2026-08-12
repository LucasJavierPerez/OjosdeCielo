import type { ClienteSupabase, Especie, Fila } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Paciente {
  mascota_id: string;
  nombre: string;
  especie: Especie;
  raza: string | null;
  foto_url: string | null;
  fecha_nacimiento: string | null;
  fallecido_en: string | null;
  titular_nombre: string;
  titular_apellido: string;
  titular_telefono: string | null;
  titular_email: string;
  cantidad_tutores: number;
}

export type PesoRegistro = Fila<'peso_registro'>;
export type Aplicacion = Fila<'aplicacion'>;
export type Antecedente = Fila<'antecedente'>;
export type Medicacion = Fila<'medicacion_en_curso'>;

export const claves = {
  busqueda: (texto: string) => ['pacientes', texto] as const,
  mascota: (id: string) => ['paciente', id] as const,
  salud: (id: string) => ['paciente', id, 'salud'] as const,
  tutores: (id: string) => ['paciente', id, 'tutores'] as const,
};

export function useBuscarPacientes(supabase: ClienteSupabase, texto: string) {
  return useQuery({
    queryKey: claves.busqueda(texto),
    queryFn: async (): Promise<Paciente[]> => {
      const { data, error } = await supabase.rpc('buscar_pacientes', { p_texto: texto });
      if (error) throw error;
      return data as Paciente[];
    },
    // Mantiene el listado anterior mientras llega el nuevo: sin esto la lista
    // parpadea con cada tecla.
    placeholderData: (previo) => previo,
  });
}

export function usePaciente(supabase: ClienteSupabase, id: string) {
  return useQuery({
    queryKey: claves.mascota(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('mascota').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useTutoresPaciente(supabase: ClienteSupabase, id: string) {
  return useQuery({
    queryKey: claves.tutores(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tutores_de_mascota', { p_mascota_id: id });
      if (error) throw error;
      return data;
    },
  });
}

/** Trae las cuatro tablas de salud en paralelo. */
export function useSaludPaciente(supabase: ClienteSupabase, id: string) {
  return useQuery({
    queryKey: claves.salud(id),
    queryFn: async () => {
      const [pesos, aplicaciones, antecedentes, medicacion] = await Promise.all([
        supabase
          .from('peso_registro')
          .select('*')
          .eq('mascota_id', id)
          .order('fecha', { ascending: false }),
        supabase
          .from('aplicacion')
          .select('*')
          .eq('mascota_id', id)
          .order('fecha', { ascending: false }),
        supabase.from('antecedente').select('*').eq('mascota_id', id).eq('activo', true),
        supabase
          .from('medicacion_en_curso')
          .select('*')
          .eq('mascota_id', id)
          .order('desde', { ascending: false }),
      ]);

      const error = pesos.error ?? aplicaciones.error ?? antecedentes.error ?? medicacion.error;
      if (error) throw error;

      return {
        pesos: (pesos.data ?? []) as PesoRegistro[],
        aplicaciones: (aplicaciones.data ?? []) as Aplicacion[],
        antecedentes: (antecedentes.data ?? []) as Antecedente[],
        medicacion: (medicacion.data ?? []) as Medicacion[],
      };
    },
  });
}

type TablaVerificable = 'peso_registro' | 'aplicacion' | 'antecedente' | 'medicacion_en_curso';

export function useVerificarRegistro(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tabla, id }: { tabla: TablaVerificable; id: string }): Promise<void> => {
      const { error } = await supabase.rpc('verificar_registro', { p_tabla: tabla, p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.salud(mascotaId) }),
  });
}
