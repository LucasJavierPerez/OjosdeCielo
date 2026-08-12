import { type DatosMascota, paraActualizar, paraCrear } from '@ojosdecielo/core';
import type { ClienteSupabase, Mascota } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const BUCKET = 'mascotas';
const VIDA_URL_FIRMADA = 60 * 60; // 1 hora

export const clavesMascotas = {
  todas: ['mascotas'] as const,
  una: (id: string) => ['mascotas', id] as const,
  foto: (path: string) => ['foto', path] as const,
  tutores: (mascotaId: string) => ['mascotas', mascotaId, 'tutores'] as const,
};

export function useMascotas(supabase: ClienteSupabase, incluirArchivadas = false) {
  return useQuery({
    queryKey: [...clavesMascotas.todas, { incluirArchivadas }],
    queryFn: async (): Promise<Mascota[]> => {
      // Sin filtro por tutor: RLS ya devuelve sólo las mascotas accesibles.
      // Filtrar acá además sería redundante y daría la falsa impresión de que
      // la seguridad depende de esta consulta.
      let consulta = supabase.from('mascota').select('*');
      if (!incluirArchivadas) consulta = consulta.is('archivado_en', null);

      const { data, error } = await consulta.order('creado_en', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

/** Cuántas mascotas archivadas hay, para ofrecer verlas sin ocupar la pantalla. */
export function useCantidadArchivadas(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: [...clavesMascotas.todas, 'archivadas'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('mascota')
        .select('id', { count: 'exact', head: true })
        .not('archivado_en', 'is', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMascota(supabase: ClienteSupabase, id: string | undefined) {
  return useQuery({
    queryKey: clavesMascotas.una(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Mascota> => {
      const { data, error } = await supabase
        .from('mascota')
        .select('*')
        .eq('id', id ?? '')
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCrearMascota(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: DatosMascota): Promise<Mascota> => {
      // RPC y no insert: crea la mascota y el vínculo de titular en una sola
      // transacción (ver supabase/migrations/*_rpc_tutores.sql).
      const { data, error } = await supabase.rpc('crear_mascota', paraCrear(datos));
      if (error) throw error;
      return data as Mascota;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesMascotas.todas }),
  });
}

export function useActualizarMascota(supabase: ClienteSupabase, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (datos: DatosMascota): Promise<void> => {
      const { error } = await supabase.from('mascota').update(paraActualizar(datos)).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesMascotas.una(id) });
      void qc.invalidateQueries({ queryKey: clavesMascotas.todas });
    },
  });
}

/**
 * URL firmada para mostrar la foto.
 *
 * El bucket es privado, así que no hay URL pública. Se refresca antes de que
 * la firma venza para que la imagen no se rompa en una sesión larga.
 */
export function useUrlFoto(supabase: ClienteSupabase, path: string | null) {
  return useQuery({
    queryKey: clavesMascotas.foto(path ?? ''),
    enabled: Boolean(path),
    staleTime: (VIDA_URL_FIRMADA - 300) * 1000,
    gcTime: VIDA_URL_FIRMADA * 1000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path ?? '', VIDA_URL_FIRMADA);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function useSubirFoto(supabase: ClienteSupabase, mascotaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (archivo: File): Promise<string> => {
      // El primer segmento del path tiene que ser el id de la mascota: es lo
      // que usan las políticas de storage para resolver el acceso.
      const extension = archivo.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${mascotaId}/foto-${Date.now()}.${extension}`;

      const { error: errorSubida } = await supabase.storage
        .from(BUCKET)
        .upload(path, archivo, { upsert: false });
      if (errorSubida) throw errorSubida;

      const { error: errorFicha } = await supabase
        .from('mascota')
        .update({ foto_url: path })
        .eq('id', mascotaId);
      if (errorFicha) throw errorFicha;

      return path;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesMascotas.una(mascotaId) });
      void qc.invalidateQueries({ queryKey: clavesMascotas.todas });
    },
  });
}
