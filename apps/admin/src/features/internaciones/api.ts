import type { ClienteSupabase, Fila } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { urlEstudio } from '../clinica/api.js';

export type Evolucion = Fila<'internacion_evolucion'>;
export type EstudioInternacion = Fila<'internacion_estudio'>;
export type MedicacionInternacion = Fila<'internacion_medicacion'>;
export type CargoInternacion = Fila<'orden_item'>;
export type PagoInternacion = Fila<'pago'>;
export type AdjuntoInternacion = Fila<'adjunto'>;

/** Un episodio puede ser una internación en la clínica o una atención a domicilio. */
export type EpisodioTipo = 'internacion' | 'domicilio';

export interface ResumenInternacion {
  id: string;
  mascota_id: string;
  mascota: string;
  especie: string;
  orden_id: string;
  profesional: string;
  motivo: string;
  diagnostico: string | null;
  ubicacion: string | null;
  indicaciones: string | null;
  estado: 'activa' | 'cerrada';
  ingreso_en: string;
  egreso_en: string | null;
  motivo_egreso: string | null;
  total_cargos: number;
  total_pagado: number;
  saldo: number;
  n_evoluciones: number;
  n_estudios: number;
  n_medicacion: number;
  tipo: EpisodioTipo;
  direccion: string | null;
}

export interface InternacionActiva {
  id: string;
  mascota_id: string;
  mascota: string;
  especie: string;
  profesional: string;
  motivo: string;
  ubicacion: string | null;
  ingreso_en: string;
  total_cargos: number;
  total_pagado: number;
  saldo: number;
  tipo: EpisodioTipo;
  direccion: string | null;
}

export interface InternacionConSaldo {
  id: string;
  mascota_id: string;
  mascota: string;
  especie: string;
  profesional: string;
  egreso_en: string;
  total_cargos: number;
  total_pagado: number;
  saldo: number;
  tipo: EpisodioTipo;
}

export const clavesInternacion = {
  activas: (tipo: EpisodioTipo) => ['internaciones', 'activas', tipo] as const,
  conSaldo: (tipo: EpisodioTipo) => ['internaciones', 'con-saldo', tipo] as const,
  detalle: (id: string) => ['internacion', id] as const,
  evoluciones: (id: string) => ['internacion', id, 'evoluciones'] as const,
  estudios: (id: string) => ['internacion', id, 'estudios'] as const,
  medicacion: (id: string) => ['internacion', id, 'medicacion'] as const,
  adjuntos: (id: string) => ['internacion', id, 'adjuntos'] as const,
  cargos: (ordenId: string) => ['internacion', 'orden', ordenId, 'cargos'] as const,
  pagos: (ordenId: string) => ['internacion', 'orden', ordenId, 'pagos'] as const,
  // Todas las internaciones de un paciente, para su historia clínica.
  dePaciente: (mascotaId: string) => ['internacion', 'de-paciente', mascotaId] as const,
};

const num = (v: string | undefined) => (v && v.trim() !== '' ? Number(v) : undefined);

/**
 * Los parámetros opcionales de las RPC se **omiten**, no se mandan como `null`:
 * la firma generada por Supabase los tipa como `string | undefined`, no como
 * nullables (mismo criterio que `crear_paciente`).
 */
const opc = (clave: string, valor: string | undefined) => {
  const limpio = valor?.trim();
  return limpio ? { [clave]: limpio } : {};
};
const opcNum = (clave: string, valor: string | undefined) => {
  const n = num(valor);
  return n !== undefined ? { [clave]: n } : {};
};

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export function useInternacionesActivas(supabase: ClienteSupabase, tipo: EpisodioTipo) {
  return useQuery({
    queryKey: clavesInternacion.activas(tipo),
    queryFn: async (): Promise<InternacionActiva[]> => {
      const { data, error } = await supabase.rpc('internaciones_activas', { p_tipo: tipo });
      if (error) throw error;
      return data as InternacionActiva[];
    },
  });
}

export function useInternacionesConSaldo(supabase: ClienteSupabase, tipo: EpisodioTipo) {
  return useQuery({
    queryKey: clavesInternacion.conSaldo(tipo),
    queryFn: async (): Promise<InternacionConSaldo[]> => {
      const { data, error } = await supabase.rpc('internaciones_con_saldo', { p_tipo: tipo });
      if (error) throw error;
      return data as InternacionConSaldo[];
    },
  });
}

export function useInternacion(supabase: ClienteSupabase, id: string) {
  return useQuery({
    queryKey: clavesInternacion.detalle(id),
    queryFn: async (): Promise<ResumenInternacion | null> => {
      const { data, error } = await supabase.rpc('resumen_internacion', { p_internacion_id: id });
      if (error) throw error;
      const filas = data as ResumenInternacion[];
      return filas[0] ?? null;
    },
  });
}

export type InternacionResumen = Pick<
  Fila<'internacion'>,
  | 'id'
  | 'tipo'
  | 'motivo'
  | 'diagnostico'
  | 'direccion'
  | 'estado'
  | 'ingreso_en'
  | 'egreso_en'
  | 'motivo_egreso'
>;

/**
 * Todas las internaciones de un paciente, la más reciente primero. Para la
 * historia clínica en la ficha del paciente (qué le pasó y por qué).
 */
export function useInternacionesDePaciente(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: clavesInternacion.dePaciente(mascotaId),
    queryFn: async (): Promise<InternacionResumen[]> => {
      const { data, error } = await supabase
        .from('internacion')
        .select(
          'id, tipo, motivo, diagnostico, direccion, estado, ingreso_en, egreso_en, motivo_egreso',
        )
        .eq('mascota_id', mascotaId)
        .order('ingreso_en', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEvoluciones(supabase: ClienteSupabase, id: string) {
  return useQuery({
    queryKey: clavesInternacion.evoluciones(id),
    queryFn: async (): Promise<Evolucion[]> => {
      const { data, error } = await supabase
        .from('internacion_evolucion')
        .select('*')
        .eq('internacion_id', id)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEstudios(supabase: ClienteSupabase, id: string) {
  return useQuery({
    queryKey: clavesInternacion.estudios(id),
    queryFn: async (): Promise<EstudioInternacion[]> => {
      const { data, error } = await supabase
        .from('internacion_estudio')
        .select('*')
        .eq('internacion_id', id)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useMedicacion(supabase: ClienteSupabase, id: string) {
  return useQuery({
    queryKey: clavesInternacion.medicacion(id),
    queryFn: async (): Promise<MedicacionInternacion[]> => {
      const { data, error } = await supabase
        .from('internacion_medicacion')
        .select('*')
        .eq('internacion_id', id)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCargos(supabase: ClienteSupabase, ordenId: string) {
  return useQuery({
    queryKey: clavesInternacion.cargos(ordenId),
    enabled: Boolean(ordenId),
    queryFn: async (): Promise<CargoInternacion[]> => {
      const { data, error } = await supabase
        .from('orden_item')
        .select('*')
        .eq('orden_id', ordenId)
        .order('id', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function usePagosInternacion(supabase: ClienteSupabase, ordenId: string) {
  return useQuery({
    queryKey: clavesInternacion.pagos(ordenId),
    enabled: Boolean(ordenId),
    queryFn: async (): Promise<PagoInternacion[]> => {
      const { data, error } = await supabase
        .from('pago')
        .select('*')
        .eq('orden_id', ordenId)
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useAdjuntosInternacion(supabase: ClienteSupabase, id: string) {
  return useQuery({
    queryKey: clavesInternacion.adjuntos(id),
    queryFn: async (): Promise<AdjuntoInternacion[]> => {
      const { data, error } = await supabase
        .from('adjunto')
        .select('*')
        .eq('internacion_id', id)
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export { urlEstudio };

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

export function useCrearInternacion(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      mascotaId: string;
      tipo?: EpisodioTipo;
      motivo: string;
      diagnostico?: string;
      ubicacion?: string;
      direccion?: string;
      indicaciones?: string;
    }): Promise<{ id: string }> => {
      const { data, error } = await supabase.rpc('crear_internacion', {
        p_mascota_id: d.mascotaId,
        p_motivo: d.motivo.trim(),
        ...(d.tipo && { p_tipo: d.tipo }),
        ...opc('p_diagnostico', d.diagnostico),
        ...opc('p_ubicacion', d.ubicacion),
        ...opc('p_direccion', d.direccion),
        ...opc('p_indicaciones', d.indicaciones),
      });
      if (error) throw new Error(error.message);
      return data as { id: string };
    },
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: clavesInternacion.activas(v.tipo ?? 'internacion') });
      void qc.invalidateQueries({ queryKey: clavesInternacion.dePaciente(v.mascotaId) });
    },
  });
}

export function useActualizarInternacion(supabase: ClienteSupabase, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      diagnostico?: string;
      ubicacion?: string;
      direccion?: string;
      indicaciones?: string;
    }): Promise<void> => {
      // Se mandan siempre como texto (vacío = borrar el campo): la RPC hace
      // `nullif(trim(...), '')`. La firma generada no admite `null`.
      const { error } = await supabase.rpc('actualizar_internacion', {
        p_id: id,
        p_diagnostico: (d.diagnostico ?? '').trim(),
        p_ubicacion: (d.ubicacion ?? '').trim(),
        p_direccion: (d.direccion ?? '').trim(),
        p_indicaciones: (d.indicaciones ?? '').trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesInternacion.detalle(id) }),
  });
}

export function useRegistrarEvolucion(supabase: ClienteSupabase, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { nota: string; temperatura?: string }): Promise<void> => {
      const { error } = await supabase.rpc('registrar_evolucion_internacion', {
        p_internacion_id: id,
        p_nota: d.nota.trim(),
        ...opcNum('p_temperatura', d.temperatura),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesInternacion.evoluciones(id) });
      void qc.invalidateQueries({ queryKey: clavesInternacion.detalle(id) });
    },
  });
}

export function useRegistrarEstudio(supabase: ClienteSupabase, id: string, ordenId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      tipo: string;
      resultado?: string;
      cargo_concepto?: string;
      cargo_monto?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('registrar_estudio_internacion', {
        p_internacion_id: id,
        p_tipo: d.tipo.trim(),
        ...opc('p_resultado', d.resultado),
        ...opc('p_cargo_concepto', d.cargo_concepto),
        ...opcNum('p_cargo_monto', d.cargo_monto),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesInternacion.estudios(id) });
      void qc.invalidateQueries({ queryKey: clavesInternacion.detalle(id) });
      void qc.invalidateQueries({ queryKey: clavesInternacion.cargos(ordenId) });
    },
  });
}

export function useActualizarResultadoEstudio(supabase: ClienteSupabase, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { estudioId: string; resultado: string }): Promise<void> => {
      const { error } = await supabase.rpc('actualizar_resultado_estudio', {
        p_estudio_id: d.estudioId,
        p_resultado: d.resultado.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesInternacion.estudios(id) }),
  });
}

export function useRegistrarMedicacion(supabase: ClienteSupabase, id: string, ordenId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      descripcion: string;
      dosis?: string;
      via?: string;
      producto_id?: string;
      unidades?: string;
      cargo_concepto?: string;
      cargo_monto?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('registrar_medicacion_internacion', {
        p_internacion_id: id,
        p_descripcion: d.descripcion.trim(),
        ...opc('p_dosis', d.dosis),
        ...opc('p_via', d.via),
        ...opc('p_producto_id', d.producto_id),
        ...opcNum('p_unidades', d.unidades),
        ...opc('p_cargo_concepto', d.cargo_concepto),
        ...opcNum('p_cargo_monto', d.cargo_monto),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesInternacion.medicacion(id) });
      void qc.invalidateQueries({ queryKey: clavesInternacion.detalle(id) });
      void qc.invalidateQueries({ queryKey: clavesInternacion.cargos(ordenId) });
    },
  });
}

export function useAgregarCargo(supabase: ClienteSupabase, id: string, ordenId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      concepto: string;
      monto: string;
      cantidad?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('agregar_cargo_internacion', {
        p_internacion_id: id,
        p_concepto: d.concepto.trim(),
        p_monto: Number(d.monto),
        ...opcNum('p_cantidad', d.cantidad),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesInternacion.cargos(ordenId) });
      void qc.invalidateQueries({ queryKey: clavesInternacion.detalle(id) });
    },
  });
}

export function useRegistrarPago(supabase: ClienteSupabase, id: string, ordenId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { monto: string; medio: PagoInternacion['medio'] }): Promise<void> => {
      const { error } = await supabase.rpc('registrar_pago_internacion', {
        p_internacion_id: id,
        p_monto: Number(d.monto),
        p_medio: d.medio,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesInternacion.pagos(ordenId) });
      void qc.invalidateQueries({ queryKey: clavesInternacion.detalle(id) });
      void qc.invalidateQueries({ queryKey: ['internaciones', 'activas'] });
      void qc.invalidateQueries({ queryKey: ['internaciones', 'con-saldo'] });
    },
  });
}

export function useCerrarInternacion(supabase: ClienteSupabase, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      motivoEgreso?: string;
    }): Promise<{ total: number; pagado: number; saldo: number }> => {
      const { data, error } = await supabase.rpc('cerrar_internacion', {
        p_internacion_id: id,
        ...opc('p_motivo_egreso', d.motivoEgreso),
      });
      if (error) throw new Error(error.message);
      const filas = data as { total: number; pagado: number; saldo: number }[];
      return filas[0] ?? { total: 0, pagado: 0, saldo: 0 };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesInternacion.detalle(id) });
      void qc.invalidateQueries({ queryKey: ['internaciones', 'activas'] });
      void qc.invalidateQueries({ queryKey: ['internaciones', 'con-saldo'] });
      // La ficha del paciente muestra el estado de sus internaciones.
      void qc.invalidateQueries({ queryKey: ['internacion', 'de-paciente'] });
    },
  });
}

export function useSubirAdjuntoInternacion(
  supabase: ClienteSupabase,
  internacionId: string,
  mascotaId: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      archivo,
      tipo,
      descripcion,
    }: {
      archivo: File;
      tipo: AdjuntoInternacion['tipo'];
      descripcion?: string;
    }): Promise<void> => {
      // El primer segmento del path tiene que ser el id de la mascota: es lo
      // que usan las políticas de storage para resolver el acceso.
      const seguro = archivo.name.replace(/[^\w.-]/g, '_').slice(-80);
      const path = `${mascotaId}/internacion/${internacionId}/${Date.now()}-${seguro}`;

      const { error: errSubida } = await supabase.storage
        .from('estudios')
        .upload(path, archivo, { upsert: false });
      if (errSubida) throw new Error(errSubida.message);

      const { error } = await supabase.from('adjunto').insert({
        internacion_id: internacionId,
        mascota_id: mascotaId,
        tipo,
        storage_path: path,
        nombre_archivo: archivo.name,
        mime: archivo.type || 'application/octet-stream',
        tamano_bytes: archivo.size,
        descripcion: descripcion?.trim() || null,
      });
      if (error) {
        await supabase.storage.from('estudios').remove([path]);
        throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesInternacion.adjuntos(internacionId) }),
  });
}
