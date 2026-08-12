/**
 * Alias en español sobre los tipos generados.
 *
 * Van acá y no en `database.types.ts` porque ese archivo lo sobrescribe
 * `pnpm db:types` en cada regeneración.
 */

import type { Database, Tables, TablesInsert, TablesUpdate } from './database.types.js';

export type Tablas = Database['public']['Tables'];
export type Fila<T extends keyof Tablas> = Tables<T>;
export type Insertar<T extends keyof Tablas> = TablesInsert<T>;
export type Actualizar<T extends keyof Tablas> = TablesUpdate<T>;

export type Rol = Database['public']['Enums']['rol'];
export type Especie = Database['public']['Enums']['especie'];
export type SexoMascota = Database['public']['Enums']['sexo_mascota'];
export type RolTutor = Database['public']['Enums']['rol_tutor'];

export type Perfil = Fila<'perfil'>;
export type ConfiguracionClinica = Fila<'configuracion_clinica'>;
export type AuditLog = Fila<'audit_log'>;
export type Mascota = Fila<'mascota'>;
export type MascotaTutor = Fila<'mascota_tutor'>;
export type InvitacionTutor = Fila<'invitacion_tutor'>;
