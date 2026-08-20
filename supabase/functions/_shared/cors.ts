/**
 * Cabeceras CORS compartidas por las Edge Functions que invoca el navegador
 * (panel o app de tutores) directo, sin pasar por el cliente de Supabase.
 *
 * Sin esto el preflight OPTIONS nunca llega a la lógica de la función: el
 * navegador lo corta antes, y el error que se ve en consola ("blocked by
 * CORS policy") no dice nada sobre la causa real.
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
