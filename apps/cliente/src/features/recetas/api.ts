import type { ClienteSupabase } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface ItemReceta {
  id: string;
  descripcion: string;
  cantidad: string;
  dosis: string;
  duracion: string | null;
  cronico: boolean;
  orden: number;
}

export interface RecetaDelTutor {
  id: string;
  codigo: string;
  estado: 'vigente' | 'dispensada' | 'anulada';
  emitida_en: string;
  vence_el: string;
  diagnostico: string | null;
  indicaciones: string | null;
  motivo_anulacion: string | null;
  items: ItemReceta[];
}

export interface SolicitudReposicion {
  id: string;
  receta_item_id: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  solicitado_en: string;
  nota_respuesta: string | null;
}

export interface RecetaImpresa {
  id: string;
  codigo: string;
  estado: string;
  vencida: boolean;
  emitida_en: string;
  vence_el: string;
  diagnostico: string | null;
  indicaciones: string | null;
  mascota: string;
  especie: string;
  raza: string | null;
  sexo: string;
  fecha_nacimiento: string | null;
  profesional: string;
  matricula: string | null;
  clinica: {
    nombre: string;
    logo_url: string | null;
    direccion: string | null;
    localidad: string | null;
    telefono: string | null;
    email: string | null;
  };
  items: {
    descripcion: string;
    cantidad: string;
    dosis: string;
    duracion: string | null;
    cronico: boolean;
  }[];
}

export const clavesRecetas = {
  deMascota: (id: string) => ['recetas', id] as const,
  imprimir: (id: string) => ['receta-imprimir', id] as const,
  solicitudes: (id: string) => ['reposiciones', id] as const,
};

export function useRecetasDeMascota(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: clavesRecetas.deMascota(mascotaId),
    enabled: Boolean(mascotaId),
    queryFn: async (): Promise<RecetaDelTutor[]> => {
      const { data, error } = await supabase
        .from('receta')
        .select(
          'id, codigo, estado, emitida_en, vence_el, diagnostico, indicaciones, motivo_anulacion, items:receta_item (id, descripcion, cantidad, dosis, duracion, cronico, orden)',
        )
        .eq('mascota_id', mascotaId)
        .order('emitida_en', { ascending: false });
      if (error) throw error;
      return data as unknown as RecetaDelTutor[];
    },
  });
}

export function useSolicitudes(supabase: ClienteSupabase, mascotaId: string) {
  return useQuery({
    queryKey: clavesRecetas.solicitudes(mascotaId),
    enabled: Boolean(mascotaId),
    queryFn: async (): Promise<SolicitudReposicion[]> => {
      const { data, error } = await supabase
        .from('solicitud_reposicion')
        .select('id, receta_item_id, estado, solicitado_en, nota_respuesta')
        .eq('mascota_id', mascotaId)
        .order('solicitado_en', { ascending: false });
      if (error) throw error;
      return data as SolicitudReposicion[];
    },
  });
}

export function useSolicitarReposicion(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, nota }: { itemId: string; nota?: string }): Promise<void> => {
      const { error } = await supabase.rpc('solicitar_reposicion', {
        p_receta_item_id: itemId,
        ...(nota?.trim() && { p_nota: nota.trim() }),
      });
      // El mensaje de la base explica el caso concreto: no es crónico, la
      // receta está anulada, o ya hay un pedido pendiente.
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesRecetas.solicitudes(mascotaId) }),
  });
}

export function useRecetaParaImprimir(supabase: ClienteSupabase, recetaId: string) {
  return useQuery({
    queryKey: clavesRecetas.imprimir(recetaId),
    enabled: Boolean(recetaId),
    queryFn: async (): Promise<RecetaImpresa> => {
      const { data, error } = await supabase.rpc('receta_para_imprimir', {
        p_receta_id: recetaId,
      });
      if (error) throw new Error(error.message);
      return data as unknown as RecetaImpresa;
    },
  });
}
