/**
 * ARCHIVO GENERADO — no editar a mano.
 *
 * Regenerar con:  pnpm db:types   (requiere `supabase start` corriendo)
 *
 * Esta versión inicial se escribió a mano para que el proyecto compile antes de
 * tener Docker levantado. En cuanto corras `pnpm db:types` queda sobrescrito
 * por la salida real del esquema, que es la fuente de verdad.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Rol = 'cliente' | 'recepcionista' | 'veterinario' | 'administrador';

export interface Database {
  public: {
    Tables: {
      perfil: {
        Row: {
          id: string;
          nombre: string;
          apellido: string;
          dni: string | null;
          telefono: string | null;
          email: string;
          rol: Rol;
          activo: boolean;
          archivado_en: string | null;
          creado_en: string;
          actualizado_en: string | null;
        };
        Insert: {
          id: string;
          nombre: string;
          apellido: string;
          dni?: string | null;
          telefono?: string | null;
          email: string;
          rol?: Rol;
          activo?: boolean;
          archivado_en?: string | null;
        };
        Update: {
          nombre?: string;
          apellido?: string;
          dni?: string | null;
          telefono?: string | null;
          email?: string;
          rol?: Rol;
          activo?: boolean;
          archivado_en?: string | null;
        };
        Relationships: [];
      };
      configuracion_clinica: {
        Row: {
          id: number;
          nombre: string;
          logo_url: string | null;
          direccion: string | null;
          localidad: string | null;
          telefono: string | null;
          email: string | null;
          horarios: Json;
          color_primario: string;
          horas_min_cancelacion: number;
          politica_sena: Json;
          creado_en: string;
          actualizado_en: string | null;
        };
        Insert: {
          id?: number;
          nombre: string;
          logo_url?: string | null;
          direccion?: string | null;
          localidad?: string | null;
          telefono?: string | null;
          email?: string | null;
          horarios?: Json;
          color_primario?: string;
          horas_min_cancelacion?: number;
          politica_sena?: Json;
        };
        Update: {
          nombre?: string;
          logo_url?: string | null;
          direccion?: string | null;
          localidad?: string | null;
          telefono?: string | null;
          email?: string | null;
          horarios?: Json;
          color_primario?: string;
          horas_min_cancelacion?: number;
          politica_sena?: Json;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          usuario_id: string | null;
          tabla: string;
          registro_id: string | null;
          accion: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT';
          datos_antes: Json | null;
          datos_despues: Json | null;
          creado_en: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      rol_actual: { Args: Record<string, never>; Returns: Rol };
      es_personal_clinica: { Args: Record<string, never>; Returns: boolean };
      es_veterinario: { Args: Record<string, never>; Returns: boolean };
      es_administrador: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      rol: Rol;
    };
    CompositeTypes: Record<never, never>;
  };
}

export type Tablas = Database['public']['Tables'];
export type Fila<T extends keyof Tablas> = Tablas[T]['Row'];
export type Insertar<T extends keyof Tablas> = Tablas[T]['Insert'];
export type Actualizar<T extends keyof Tablas> = Tablas[T]['Update'];

export type Perfil = Fila<'perfil'>;
export type ConfiguracionClinica = Fila<'configuracion_clinica'>;
