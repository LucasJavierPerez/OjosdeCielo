import type { ClienteSupabase, Especie, Fila, SexoMascota } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claves } from '../pacientes/api.js';

export type Adjunto = Fila<'adjunto'>;
export type ContactoTutor = Fila<'contacto_tutor'>;

export interface EntradaHistorial {
  id: string;
  fecha: string;
  motivo: string;
  anamnesis: string | null;
  examen_fisico: string | null;
  diagnostico: string | null;
  tratamiento: string | null;
  evolucion: string | null;
  peso_kg: number | null;
  temperatura: number | null;
  corrige_a: string | null;
  profesional: string;
  adjuntos: number;
}

export const clavesClinica = {
  historial: (mascotaId: string) => ['historial', mascotaId] as const,
  adjuntos: (consultaId: string) => ['adjuntos', consultaId] as const,
  contacto: (mascotaId: string) => ['contacto', mascotaId] as const,
};

export function useHistorial(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: clavesClinica.historial(mascotaId),
    queryFn: async (): Promise<EntradaHistorial[]> => {
      const { data, error } = await supabase.rpc('historial_mascota', {
        p_mascota_id: mascotaId,
      });
      if (error) throw error;
      return data as EntradaHistorial[];
    },
  });
}

export function useContactoTutor(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: clavesClinica.contacto(mascotaId),
    queryFn: async (): Promise<ContactoTutor | null> => {
      const { data, error } = await supabase
        .from('contacto_tutor')
        .select('*')
        .eq('mascota_id', mascotaId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export interface DatosConsulta {
  motivo: string;
  anamnesis?: string;
  examen_fisico?: string;
  diagnostico?: string;
  tratamiento?: string;
  evolucion?: string;
  peso_kg?: string;
  temperatura?: string;
  corrige_a?: string;
}

const oNull = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null);
const oNumero = (v: string | undefined) => (v && v.trim() !== '' ? Number(v) : null);

export function useCargarConsulta(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: DatosConsulta): Promise<string> => {
      const { data, error } = await supabase
        .from('consulta')
        .insert({
          mascota_id: mascotaId,
          motivo: datos.motivo.trim(),
          anamnesis: oNull(datos.anamnesis),
          examen_fisico: oNull(datos.examen_fisico),
          diagnostico: oNull(datos.diagnostico),
          tratamiento: oNull(datos.tratamiento),
          evolucion: oNull(datos.evolucion),
          peso_kg: oNumero(datos.peso_kg),
          temperatura: oNumero(datos.temperatura),
          corrige_a: oNull(datos.corrige_a),
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);

      // Si se midió el peso, se registra también en la curva: es el mismo dato
      // y el tutor lo ve en su gráfico.
      const peso = oNumero(datos.peso_kg);
      if (peso !== null) {
        await supabase.from('peso_registro').insert({
          mascota_id: mascotaId,
          peso_kg: peso,
          nota: 'Medido en consulta',
        });
      }

      return data.id;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesClinica.historial(mascotaId) });
      void qc.invalidateQueries({ queryKey: claves.salud(mascotaId) });
    },
  });
}

export function useAdjuntos(supabase: ClienteSupabase, consultaId: string) {
  return useQuery({
    queryKey: clavesClinica.adjuntos(consultaId),
    enabled: Boolean(consultaId),
    queryFn: async (): Promise<Adjunto[]> => {
      const { data, error } = await supabase
        .from('adjunto')
        .select('*')
        .eq('consulta_id', consultaId)
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useSubirEstudio(supabase: ClienteSupabase, mascotaId: string, consultaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      archivo,
      tipo,
      descripcion,
    }: {
      archivo: File;
      tipo: Adjunto['tipo'];
      descripcion?: string;
    }): Promise<void> => {
      // El primer segmento del path tiene que ser el id de la mascota: es lo
      // que usan las políticas de storage para resolver el acceso.
      const seguro = archivo.name.replace(/[^\w.-]/g, '_').slice(-80);
      const path = `${mascotaId}/${consultaId}/${Date.now()}-${seguro}`;

      const { error: errSubida } = await supabase.storage
        .from('estudios')
        .upload(path, archivo, { upsert: false });
      if (errSubida) throw new Error(errSubida.message);

      const { error } = await supabase.from('adjunto').insert({
        consulta_id: consultaId,
        mascota_id: mascotaId,
        tipo,
        storage_path: path,
        nombre_archivo: archivo.name,
        mime: archivo.type || 'application/octet-stream',
        tamano_bytes: archivo.size,
        descripcion: oNull(descripcion),
      });
      if (error) {
        // Si falla el registro, el archivo quedaría huérfano en el bucket.
        await supabase.storage.from('estudios').remove([path]);
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesClinica.adjuntos(consultaId) });
      void qc.invalidateQueries({ queryKey: clavesClinica.historial(mascotaId) });
    },
  });
}

/** URL firmada para abrir un estudio. El bucket es privado. */
export async function urlEstudio(supabase: ClienteSupabase, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('estudios').createSignedUrl(path, 300);
  if (error) return null;
  return data.signedUrl;
}

export interface DatosPaciente {
  nombre: string;
  especie: Especie;
  raza?: string;
  sexo: SexoMascota;
  fecha_nacimiento?: string;
  castrado?: boolean;
  microchip?: string;
  tutor_nombre: string;
  tutor_apellido?: string;
  tutor_email?: string;
  tutor_telefono?: string;
  tutor_dni?: string;
}

export function useCrearPaciente(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: DatosPaciente): Promise<{ id: string }> => {
      // Los opcionales se omiten en vez de mandarse como null: los parámetros
      // de la función tienen `default null`, y la firma generada los tipa como
      // opcionales, no como nullables.
      const opcional = (clave: string, valor: string | undefined) => {
        const limpio = valor?.trim();
        return limpio ? { [clave]: limpio } : {};
      };

      const { data, error } = await supabase.rpc('crear_paciente', {
        p_nombre: d.nombre.trim(),
        p_especie: d.especie,
        p_tutor_nombre: d.tutor_nombre.trim(),
        p_tutor_apellido: d.tutor_apellido?.trim() ?? '',
        p_sexo: d.sexo,
        ...opcional('p_raza', d.raza),
        ...opcional('p_fecha_nacimiento', d.fecha_nacimiento),
        ...(d.castrado !== undefined && { p_castrado: d.castrado }),
        ...opcional('p_microchip', d.microchip),
        ...opcional('p_tutor_email', d.tutor_email),
        ...opcional('p_tutor_telefono', d.tutor_telefono),
        ...opcional('p_tutor_dni', d.tutor_dni),
      });
      if (error) throw new Error(error.message);
      return data as { id: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pacientes'] }),
  });
}
