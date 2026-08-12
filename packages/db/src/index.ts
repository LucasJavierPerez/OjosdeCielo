// Reexportados para que el resto del monorepo no dependa directamente del SDK:
// packages/db es el único punto de contacto con @supabase/supabase-js.
export type {
  AuthError,
  PostgrestError,
  Session,
  User,
} from '@supabase/supabase-js';
export { type ClienteSupabase, crearCliente } from './cliente.js';
export type { Database, Json } from './database.types.js';
export type {
  Actualizar,
  AuditLog,
  ConfiguracionClinica,
  Especie,
  Fila,
  Insertar,
  InvitacionTutor,
  Mascota,
  MascotaTutor,
  Perfil,
  Rol,
  RolTutor,
  SexoMascota,
  Tablas,
} from './tipos.js';
