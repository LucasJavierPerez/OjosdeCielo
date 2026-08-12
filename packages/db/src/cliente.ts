import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

export type ClienteSupabase = SupabaseClient<Database>;

/**
 * Crea el cliente de Supabase.
 *
 * Sólo acepta la clave anónima. La `service_role` key nunca va en código de
 * frontend: saltea RLS por completo (ver AGENTS.md, regla 1). Si hace falta
 * privilegio elevado, va en una Edge Function.
 */
export function crearCliente(url: string, claveAnonima: string): ClienteSupabase {
  if (!url || !claveAnonima) {
    throw new Error(
      'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env.',
    );
  }

  if (claveAnonima.includes('service_role')) {
    throw new Error(
      'Se detectó una service_role key en el cliente. Nunca debe salir del servidor.',
    );
  }

  return createClient<Database>(url, claveAnonima, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
