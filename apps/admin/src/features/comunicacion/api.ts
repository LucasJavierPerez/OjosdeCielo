import type { ClienteSupabase, Fila } from '@ojosdecielo/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Campana = Fila<'campana'>;

// `type` y no `interface`: viaja como jsonb a la RPC y sólo un alias de tipo
// obtiene el índice implícito que exige `Json`.
export type Segmento = {
  especie?: 'perro' | 'gato' | 'otro';
  vacuna_vencida_dias?: number;
  sin_venir_meses?: number;
  edad_min_meses?: number;
  edad_max_meses?: number;
};

export interface VistaPrevia {
  total: number;
  muestra: { nombre: string; mascotas: string | null }[];
}

export interface ConversacionBandeja {
  id: string;
  asunto: string;
  cliente_id: string;
  cliente: string;
  telefono: string | null;
  mascota_id: string | null;
  mascota: string | null;
  ultimo_mensaje_en: string;
  ultimo_mensaje: string | null;
  espera_respuesta: boolean;
  sin_leer: number;
  cerrada_en: string | null;
}

export interface Mensaje {
  id: string;
  cuerpo: string;
  de_la_clinica: boolean;
  creado_en: string;
  leido_en: string | null;
}

export const clavesComunicacion = {
  campanas: ['campanas'] as const,
  previa: (s: Segmento) => ['previa-campana', JSON.stringify(s)] as const,
  bandeja: (cerradas: boolean) => ['bandeja', cerradas] as const,
  mensajes: (id: string) => ['mensajes', id] as const,
};

// ---------------------------------------------------------------------------
// Campañas
// ---------------------------------------------------------------------------

export function useCampanas(supabase: ClienteSupabase) {
  return useQuery({
    queryKey: clavesComunicacion.campanas,
    queryFn: async (): Promise<Campana[]> => {
      const { data, error } = await supabase
        .from('campana')
        .select('*')
        .order('creada_en', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useVistaPrevia(supabase: ClienteSupabase, segmento: Segmento) {
  return useQuery({
    queryKey: clavesComunicacion.previa(segmento),
    queryFn: async (): Promise<VistaPrevia> => {
      const { data, error } = await supabase.rpc('previsualizar_campana', {
        p_segmento: segmento,
      });
      if (error) throw new Error(error.message);
      return data as unknown as VistaPrevia;
    },
  });
}

export function useCrearCampana(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: {
      titulo: string;
      cuerpo: string;
      segmento: Segmento;
      url?: string;
    }): Promise<Campana> => {
      const { data, error } = await supabase.rpc('crear_campana', {
        p_titulo: c.titulo,
        p_cuerpo: c.cuerpo,
        p_segmento: c.segmento,
        ...(c.url?.trim() && { p_url: c.url.trim() }),
      });
      if (error) throw new Error(error.message);
      return data as Campana;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesComunicacion.campanas }),
  });
}

export function useLanzarCampana(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ enviados: number; quedan: number }> => {
      // Dos pasos: la base congela el alcance y cambia el estado, la Edge
      // Function manda los push. Si el envío falla a mitad, la campaña queda
      // en 'enviando' y se puede reintentar sin duplicar nada.
      const { error } = await supabase.rpc('lanzar_campana', { p_campana_id: id });
      if (error) throw new Error(error.message);

      const { data, error: errEnvio } = await supabase.functions.invoke<{
        enviados: number;
        quedan: number;
      }>('enviar-campana', { body: { campana_id: id } });

      if (errEnvio || !data) {
        throw new Error(
          'La campaña quedó lanzada pero el envío falló. Reintentá desde el botón de reenviar.',
        );
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesComunicacion.campanas }),
  });
}

export function useReintentarEnvio(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ enviados: number; quedan: number }> => {
      const { data, error } = await supabase.functions.invoke<{
        enviados: number;
        quedan: number;
      }>('enviar-campana', { body: { campana_id: id } });
      if (error || !data) throw new Error('No pudimos retomar el envío.');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesComunicacion.campanas }),
  });
}

export function useCancelarCampana(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.rpc('cancelar_campana', { p_campana_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesComunicacion.campanas }),
  });
}

export function useBorrarCampana(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.rpc('borrar_campana', { p_campana_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesComunicacion.campanas }),
  });
}

// ---------------------------------------------------------------------------
// Mensajería
// ---------------------------------------------------------------------------

export function useBandeja(supabase: ClienteSupabase, cerradas: boolean) {
  return useQuery({
    queryKey: clavesComunicacion.bandeja(cerradas),
    queryFn: async (): Promise<ConversacionBandeja[]> => {
      const { data, error } = await supabase.rpc('bandeja_conversaciones', {
        p_cerradas: cerradas,
      });
      if (error) throw error;
      return data as ConversacionBandeja[];
    },
  });
}

export function useMensajes(supabase: ClienteSupabase, conversacionId: string) {
  return useQuery({
    queryKey: clavesComunicacion.mensajes(conversacionId),
    enabled: Boolean(conversacionId),
    queryFn: async (): Promise<Mensaje[]> => {
      const { data, error } = await supabase
        .from('mensaje')
        .select('id, cuerpo, de_la_clinica, creado_en, leido_en')
        .eq('conversacion_id', conversacionId)
        .order('creado_en');
      if (error) throw error;
      return data;
    },
  });
}

export function useResponder(supabase: ClienteSupabase, conversacionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cuerpo: string): Promise<void> => {
      // `de_la_clinica` va igual porque la columna es NOT NULL, pero el valor
      // lo pisa un trigger con el rol real del autor. Mandarlo en true desde
      // acá no cambia nada.
      const { error } = await supabase.from('mensaje').insert({
        conversacion_id: conversacionId,
        de_la_clinica: true,
        cuerpo,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clavesComunicacion.mensajes(conversacionId) });
      void qc.invalidateQueries({ queryKey: ['bandeja'] });
    },
  });
}

export function useMarcarLeida(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.rpc('marcar_conversacion_leida', {
        p_conversacion_id: id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bandeja'] }),
  });
}

export function useCerrarConversacion(supabase: ClienteSupabase) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, cerrar }: { id: string; cerrar: boolean }): Promise<void> => {
      const { error } = await supabase
        .from('conversacion')
        .update({ cerrada_en: cerrar ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bandeja'] }),
  });
}
