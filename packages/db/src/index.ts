// Reexportados para que el resto del monorepo no dependa directamente del SDK:
// packages/db es el único punto de contacto con @supabase/supabase-js.
export type { AuthError, PostgrestError, Session, User } from '@supabase/supabase-js';
export { type ClienteSupabase, crearCliente } from './cliente.js';
export type {
  Actualizar,
  ConfiguracionClinica,
  Database,
  Fila,
  Insertar,
  Json,
  Perfil,
  Rol,
  Tablas,
} from './database.types.js';
