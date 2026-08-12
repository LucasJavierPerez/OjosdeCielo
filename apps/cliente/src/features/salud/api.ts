import type {
  DatosAntecedente,
  DatosAplicacion,
  DatosMedicacion,
  DatosPeso,
} from '@ojosdecielo/core';
import type { ClienteSupabase, Fila } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type PesoRegistro = Fila<'peso_registro'>;
export type Aplicacion = Fila<'aplicacion'>;
export type Antecedente = Fila<'antecedente'>;
export type Medicacion = Fila<'medicacion_en_curso'>;

export const clavesSalud = {
  peso: (mascotaId: string) => ['salud', mascotaId, 'peso'] as const,
  aplicaciones: (mascotaId: string) => ['salud', mascotaId, 'aplicaciones'] as const,
  antecedentes: (mascotaId: string) => ['salud', mascotaId, 'antecedentes'] as const,
  medicacion: (mascotaId: string) => ['salud', mascotaId, 'medicacion'] as const,
};

/** Vacío a null: la base espera null, el formulario produce cadenas vacías. */
const oNull = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null);

// ---------------------------------------------------------------------------
// Peso
// ---------------------------------------------------------------------------

export function usePesos(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: clavesSalud.peso(mascotaId),
    queryFn: async (): Promise<PesoRegistro[]> => {
      const { data, error } = await supabase
        .from('peso_registro')
        .select('*')
        .eq('mascota_id', mascotaId)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCargarPeso(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: DatosPeso): Promise<void> => {
      // `origen` y `cargado_por` no se mandan: los fija un trigger en la base
      // según quién escribe. Enviarlos desde acá no tendría ningún efecto.
      const { error } = await supabase.from('peso_registro').insert({
        mascota_id: mascotaId,
        fecha: datos.fecha,
        peso_kg: datos.peso_kg,
        nota: oNull(datos.nota),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesSalud.peso(mascotaId) }),
  });
}

export function useBorrarPeso(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('peso_registro').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesSalud.peso(mascotaId) }),
  });
}

// ---------------------------------------------------------------------------
// Vacunas y desparasitaciones
// ---------------------------------------------------------------------------

export function useAplicaciones(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: clavesSalud.aplicaciones(mascotaId),
    queryFn: async (): Promise<Aplicacion[]> => {
      const { data, error } = await supabase
        .from('aplicacion')
        .select('*')
        .eq('mascota_id', mascotaId)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCargarAplicacion(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: DatosAplicacion): Promise<void> => {
      const { error } = await supabase.from('aplicacion').insert({
        mascota_id: mascotaId,
        tipo: datos.tipo,
        producto: oNull(datos.producto),
        fecha: datos.fecha,
        proxima_fecha: oNull(datos.proxima_fecha),
        nota: oNull(datos.nota),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesSalud.aplicaciones(mascotaId) }),
  });
}

export function useBorrarAplicacion(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('aplicacion').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesSalud.aplicaciones(mascotaId) }),
  });
}

// ---------------------------------------------------------------------------
// Antecedentes
// ---------------------------------------------------------------------------

export function useAntecedentes(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: clavesSalud.antecedentes(mascotaId),
    queryFn: async (): Promise<Antecedente[]> => {
      const { data, error } = await supabase
        .from('antecedente')
        .select('*')
        .eq('mascota_id', mascotaId)
        .eq('activo', true)
        .order('creado_en', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCargarAntecedente(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: DatosAntecedente): Promise<void> => {
      const { error } = await supabase.from('antecedente').insert({
        mascota_id: mascotaId,
        tipo: datos.tipo,
        descripcion: datos.descripcion,
        fecha: oNull(datos.fecha),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesSalud.antecedentes(mascotaId) }),
  });
}

export function useBorrarAntecedente(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('antecedente').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesSalud.antecedentes(mascotaId) }),
  });
}

// ---------------------------------------------------------------------------
// Medicación
// ---------------------------------------------------------------------------

export function useMedicacion(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: clavesSalud.medicacion(mascotaId),
    queryFn: async (): Promise<Medicacion[]> => {
      const { data, error } = await supabase
        .from('medicacion_en_curso')
        .select('*')
        .eq('mascota_id', mascotaId)
        .order('desde', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCargarMedicacion(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: DatosMedicacion): Promise<void> => {
      // El formulario entrega texto; la columna es integer.
      const frecuencia = datos.frecuencia_horas ? Number(datos.frecuencia_horas) : null;
      const { error } = await supabase.from('medicacion_en_curso').insert({
        mascota_id: mascotaId,
        descripcion: datos.descripcion,
        dosis: oNull(datos.dosis),
        frecuencia_horas: frecuencia,
        desde: datos.desde,
        hasta: oNull(datos.hasta),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesSalud.medicacion(mascotaId) }),
  });
}

export function useBorrarMedicacion(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('medicacion_en_curso').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesSalud.medicacion(mascotaId) }),
  });
}
