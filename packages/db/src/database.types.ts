export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      adjunto: {
        Row: {
          consulta_id: string
          creado_en: string
          descripcion: string | null
          id: string
          mascota_id: string
          mime: string
          nombre_archivo: string
          storage_path: string
          subido_por: string
          tamano_bytes: number
          tipo: Database["public"]["Enums"]["tipo_adjunto"]
        }
        Insert: {
          consulta_id: string
          creado_en?: string
          descripcion?: string | null
          id?: string
          mascota_id: string
          mime: string
          nombre_archivo: string
          storage_path: string
          subido_por?: string
          tamano_bytes: number
          tipo?: Database["public"]["Enums"]["tipo_adjunto"]
        }
        Update: {
          consulta_id?: string
          creado_en?: string
          descripcion?: string | null
          id?: string
          mascota_id?: string
          mime?: string
          nombre_archivo?: string
          storage_path?: string
          subido_por?: string
          tamano_bytes?: number
          tipo?: Database["public"]["Enums"]["tipo_adjunto"]
        }
        Relationships: [
          {
            foreignKeyName: "adjunto_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consulta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjunto_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjunto_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      antecedente: {
        Row: {
          activo: boolean
          actualizado_en: string | null
          cargado_por: string
          creado_en: string
          descripcion: string
          fecha: string | null
          id: string
          mascota_id: string
          origen: Database["public"]["Enums"]["origen_dato"]
          tipo: Database["public"]["Enums"]["tipo_antecedente"]
          verificado_en: string | null
          verificado_por: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string | null
          cargado_por?: string
          creado_en?: string
          descripcion: string
          fecha?: string | null
          id?: string
          mascota_id: string
          origen?: Database["public"]["Enums"]["origen_dato"]
          tipo: Database["public"]["Enums"]["tipo_antecedente"]
          verificado_en?: string | null
          verificado_por?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string | null
          cargado_por?: string
          creado_en?: string
          descripcion?: string
          fecha?: string | null
          id?: string
          mascota_id?: string
          origen?: Database["public"]["Enums"]["origen_dato"]
          tipo?: Database["public"]["Enums"]["tipo_antecedente"]
          verificado_en?: string | null
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "antecedente_cargado_por_fkey"
            columns: ["cargado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antecedente_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antecedente_verificado_por_fkey"
            columns: ["verificado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicacion: {
        Row: {
          actualizado_en: string | null
          cargado_por: string
          creado_en: string
          fecha: string
          id: string
          lote: string | null
          mascota_id: string
          nota: string | null
          origen: Database["public"]["Enums"]["origen_dato"]
          producto: string | null
          proxima_fecha: string | null
          tipo: Database["public"]["Enums"]["tipo_aplicacion"]
          verificado_en: string | null
          verificado_por: string | null
        }
        Insert: {
          actualizado_en?: string | null
          cargado_por?: string
          creado_en?: string
          fecha?: string
          id?: string
          lote?: string | null
          mascota_id: string
          nota?: string | null
          origen?: Database["public"]["Enums"]["origen_dato"]
          producto?: string | null
          proxima_fecha?: string | null
          tipo: Database["public"]["Enums"]["tipo_aplicacion"]
          verificado_en?: string | null
          verificado_por?: string | null
        }
        Update: {
          actualizado_en?: string | null
          cargado_por?: string
          creado_en?: string
          fecha?: string
          id?: string
          lote?: string | null
          mascota_id?: string
          nota?: string | null
          origen?: Database["public"]["Enums"]["origen_dato"]
          producto?: string | null
          proxima_fecha?: string | null
          tipo?: Database["public"]["Enums"]["tipo_aplicacion"]
          verificado_en?: string | null
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aplicacion_cargado_por_fkey"
            columns: ["cargado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacion_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacion_verificado_por_fkey"
            columns: ["verificado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          accion: string
          creado_en: string
          datos_antes: Json | null
          datos_despues: Json | null
          id: number
          registro_id: string | null
          tabla: string
          usuario_id: string | null
        }
        Insert: {
          accion: string
          creado_en?: string
          datos_antes?: Json | null
          datos_despues?: Json | null
          id?: number
          registro_id?: string | null
          tabla: string
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          creado_en?: string
          datos_antes?: Json | null
          datos_despues?: Json | null
          id?: number
          registro_id?: string | null
          tabla?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      aviso_hallazgo: {
        Row: {
          contacto: string | null
          creado_en: string
          id: string
          mascota_id: string
          mensaje: string
        }
        Insert: {
          contacto?: string | null
          creado_en?: string
          id?: string
          mascota_id: string
          mensaje: string
        }
        Update: {
          contacto?: string | null
          creado_en?: string
          id?: string
          mascota_id?: string
          mensaje?: string
        }
        Relationships: [
          {
            foreignKeyName: "aviso_hallazgo_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_clinica: {
        Row: {
          actualizado_en: string | null
          color_primario: string
          creado_en: string
          direccion: string | null
          email: string | null
          horarios: Json
          horas_min_cancelacion: number
          id: number
          localidad: string | null
          logo_url: string | null
          nombre: string
          politica_sena: Json
          telefono: string | null
        }
        Insert: {
          actualizado_en?: string | null
          color_primario?: string
          creado_en?: string
          direccion?: string | null
          email?: string | null
          horarios?: Json
          horas_min_cancelacion?: number
          id?: number
          localidad?: string | null
          logo_url?: string | null
          nombre: string
          politica_sena?: Json
          telefono?: string | null
        }
        Update: {
          actualizado_en?: string | null
          color_primario?: string
          creado_en?: string
          direccion?: string | null
          email?: string | null
          horarios?: Json
          horas_min_cancelacion?: number
          id?: number
          localidad?: string | null
          logo_url?: string | null
          nombre?: string
          politica_sena?: Json
          telefono?: string | null
        }
        Relationships: []
      }
      consulta: {
        Row: {
          anamnesis: string | null
          corrige_a: string | null
          creado_en: string
          diagnostico: string | null
          evolucion: string | null
          examen_fisico: string | null
          fecha: string
          id: string
          mascota_id: string
          motivo: string
          peso_kg: number | null
          profesional_id: string
          temperatura: number | null
          tratamiento: string | null
        }
        Insert: {
          anamnesis?: string | null
          corrige_a?: string | null
          creado_en?: string
          diagnostico?: string | null
          evolucion?: string | null
          examen_fisico?: string | null
          fecha?: string
          id?: string
          mascota_id: string
          motivo: string
          peso_kg?: number | null
          profesional_id?: string
          temperatura?: number | null
          tratamiento?: string | null
        }
        Update: {
          anamnesis?: string | null
          corrige_a?: string | null
          creado_en?: string
          diagnostico?: string | null
          evolucion?: string | null
          examen_fisico?: string | null
          fecha?: string
          id?: string
          mascota_id?: string
          motivo?: string
          peso_kg?: number | null
          profesional_id?: string
          temperatura?: number | null
          tratamiento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consulta_corrige_a_fkey"
            columns: ["corrige_a"]
            isOneToOne: false
            referencedRelation: "consulta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consulta_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consulta_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      contacto_tutor: {
        Row: {
          actualizado_en: string | null
          apellido: string
          creado_en: string
          dni: string | null
          email: string | null
          id: string
          mascota_id: string
          nombre: string
          notas: string | null
          perfil_id: string | null
          telefono: string | null
          vinculado_en: string | null
        }
        Insert: {
          actualizado_en?: string | null
          apellido?: string
          creado_en?: string
          dni?: string | null
          email?: string | null
          id?: string
          mascota_id: string
          nombre: string
          notas?: string | null
          perfil_id?: string | null
          telefono?: string | null
          vinculado_en?: string | null
        }
        Update: {
          actualizado_en?: string | null
          apellido?: string
          creado_en?: string
          dni?: string | null
          email?: string | null
          id?: string
          mascota_id?: string
          nombre?: string
          notas?: string | null
          perfil_id?: string | null
          telefono?: string | null
          vinculado_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacto_tutor_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacto_tutor_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      invitacion_tutor: {
        Row: {
          aceptada_en: string | null
          aceptada_por: string | null
          creada_por: string
          creado_en: string
          id: string
          mascota_id: string
          revocada_en: string | null
          token: string
          vence_en: string
        }
        Insert: {
          aceptada_en?: string | null
          aceptada_por?: string | null
          creada_por: string
          creado_en?: string
          id?: string
          mascota_id: string
          revocada_en?: string | null
          token?: string
          vence_en?: string
        }
        Update: {
          aceptada_en?: string | null
          aceptada_por?: string | null
          creada_por?: string
          creado_en?: string
          id?: string
          mascota_id?: string
          revocada_en?: string | null
          token?: string
          vence_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitacion_tutor_aceptada_por_fkey"
            columns: ["aceptada_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitacion_tutor_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitacion_tutor_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
        ]
      }
      mascota: {
        Row: {
          actualizado_en: string | null
          archivado_en: string | null
          castrado: boolean | null
          color: string | null
          creado_en: string
          especie: Database["public"]["Enums"]["especie"]
          fallecido_en: string | null
          fecha_nacimiento: string | null
          foto_url: string | null
          id: string
          microchip: string | null
          nombre: string
          nota_extravio: string | null
          perdida_desde: string | null
          raza: string | null
          sexo: Database["public"]["Enums"]["sexo_mascota"]
        }
        Insert: {
          actualizado_en?: string | null
          archivado_en?: string | null
          castrado?: boolean | null
          color?: string | null
          creado_en?: string
          especie: Database["public"]["Enums"]["especie"]
          fallecido_en?: string | null
          fecha_nacimiento?: string | null
          foto_url?: string | null
          id?: string
          microchip?: string | null
          nombre: string
          nota_extravio?: string | null
          perdida_desde?: string | null
          raza?: string | null
          sexo?: Database["public"]["Enums"]["sexo_mascota"]
        }
        Update: {
          actualizado_en?: string | null
          archivado_en?: string | null
          castrado?: boolean | null
          color?: string | null
          creado_en?: string
          especie?: Database["public"]["Enums"]["especie"]
          fallecido_en?: string | null
          fecha_nacimiento?: string | null
          foto_url?: string | null
          id?: string
          microchip?: string | null
          nombre?: string
          nota_extravio?: string | null
          perdida_desde?: string | null
          raza?: string | null
          sexo?: Database["public"]["Enums"]["sexo_mascota"]
        }
        Relationships: []
      }
      mascota_token_qr: {
        Row: {
          activo: boolean
          creado_en: string
          id: string
          mascota_id: string
          revocado_en: string | null
          token: string
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          id?: string
          mascota_id: string
          revocado_en?: string | null
          token?: string
        }
        Update: {
          activo?: boolean
          creado_en?: string
          id?: string
          mascota_id?: string
          revocado_en?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "mascota_token_qr_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
        ]
      }
      mascota_tutor: {
        Row: {
          desde: string
          id: string
          invitado_por: string | null
          mascota_id: string
          perfil_id: string
          revocado_en: string | null
          rol: Database["public"]["Enums"]["rol_tutor"]
        }
        Insert: {
          desde?: string
          id?: string
          invitado_por?: string | null
          mascota_id: string
          perfil_id: string
          revocado_en?: string | null
          rol?: Database["public"]["Enums"]["rol_tutor"]
        }
        Update: {
          desde?: string
          id?: string
          invitado_por?: string | null
          mascota_id?: string
          perfil_id?: string
          revocado_en?: string | null
          rol?: Database["public"]["Enums"]["rol_tutor"]
        }
        Relationships: [
          {
            foreignKeyName: "mascota_tutor_invitado_por_fkey"
            columns: ["invitado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mascota_tutor_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mascota_tutor_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      medicacion_en_curso: {
        Row: {
          actualizado_en: string | null
          cargado_por: string
          creado_en: string
          descripcion: string
          desde: string
          dosis: string | null
          frecuencia_horas: number | null
          hasta: string | null
          id: string
          mascota_id: string
          origen: Database["public"]["Enums"]["origen_dato"]
          recordar: boolean
          verificado_en: string | null
          verificado_por: string | null
        }
        Insert: {
          actualizado_en?: string | null
          cargado_por?: string
          creado_en?: string
          descripcion: string
          desde?: string
          dosis?: string | null
          frecuencia_horas?: number | null
          hasta?: string | null
          id?: string
          mascota_id: string
          origen?: Database["public"]["Enums"]["origen_dato"]
          recordar?: boolean
          verificado_en?: string | null
          verificado_por?: string | null
        }
        Update: {
          actualizado_en?: string | null
          cargado_por?: string
          creado_en?: string
          descripcion?: string
          desde?: string
          dosis?: string | null
          frecuencia_horas?: number | null
          hasta?: string | null
          id?: string
          mascota_id?: string
          origen?: Database["public"]["Enums"]["origen_dato"]
          recordar?: boolean
          verificado_en?: string | null
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medicacion_en_curso_cargado_por_fkey"
            columns: ["cargado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicacion_en_curso_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicacion_en_curso_verificado_por_fkey"
            columns: ["verificado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacion_log: {
        Row: {
          enviado_en: string
          error: string | null
          id: number
          perfil_id: string | null
          resultado: string
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
          titulo: string
        }
        Insert: {
          enviado_en?: string
          error?: string | null
          id?: number
          perfil_id?: string | null
          resultado: string
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
          titulo: string
        }
        Update: {
          enviado_en?: string
          error?: string | null
          id?: number
          perfil_id?: string | null
          resultado?: string
          tipo?: Database["public"]["Enums"]["tipo_notificacion"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacion_log_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil: {
        Row: {
          activo: boolean
          actualizado_en: string | null
          apellido: string
          archivado_en: string | null
          creado_en: string
          dni: string | null
          email: string
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol"]
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string | null
          apellido: string
          archivado_en?: string | null
          creado_en?: string
          dni?: string | null
          email: string
          id: string
          nombre: string
          rol?: Database["public"]["Enums"]["rol"]
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string | null
          apellido?: string
          archivado_en?: string | null
          creado_en?: string
          dni?: string | null
          email?: string
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol"]
          telefono?: string | null
        }
        Relationships: []
      }
      peso_registro: {
        Row: {
          actualizado_en: string | null
          cargado_por: string
          creado_en: string
          fecha: string
          id: string
          mascota_id: string
          nota: string | null
          origen: Database["public"]["Enums"]["origen_dato"]
          peso_kg: number
          verificado_en: string | null
          verificado_por: string | null
        }
        Insert: {
          actualizado_en?: string | null
          cargado_por?: string
          creado_en?: string
          fecha?: string
          id?: string
          mascota_id: string
          nota?: string | null
          origen?: Database["public"]["Enums"]["origen_dato"]
          peso_kg: number
          verificado_en?: string | null
          verificado_por?: string | null
        }
        Update: {
          actualizado_en?: string | null
          cargado_por?: string
          creado_en?: string
          fecha?: string
          id?: string
          mascota_id?: string
          nota?: string | null
          origen?: Database["public"]["Enums"]["origen_dato"]
          peso_kg?: number
          verificado_en?: string | null
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "peso_registro_cargado_por_fkey"
            columns: ["cargado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peso_registro_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peso_registro_verificado_por_fkey"
            columns: ["verificado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      preferencia_notificacion: {
        Row: {
          habilitado: boolean
          perfil_id: string
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
        }
        Insert: {
          habilitado?: boolean
          perfil_id?: string
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
        }
        Update: {
          habilitado?: boolean
          perfil_id?: string
          tipo?: Database["public"]["Enums"]["tipo_notificacion"]
        }
        Relationships: [
          {
            foreignKeyName: "preferencia_notificacion_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscription: {
        Row: {
          auth: string
          creado_en: string
          endpoint: string
          fallos_consecutivos: number
          id: string
          p256dh: string
          perfil_id: string
          ultima_vez_ok: string | null
          user_agent: string | null
        }
        Insert: {
          auth: string
          creado_en?: string
          endpoint: string
          fallos_consecutivos?: number
          id?: string
          p256dh: string
          perfil_id?: string
          ultima_vez_ok?: string | null
          user_agent?: string | null
        }
        Update: {
          auth?: string
          creado_en?: string
          endpoint?: string
          fallos_consecutivos?: number
          id?: string
          p256dh?: string
          perfil_id?: string
          ultima_vez_ok?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscription_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      recordatorio: {
        Row: {
          creado_en: string
          cuerpo: string
          enviado_en: string | null
          estado: Database["public"]["Enums"]["estado_recordatorio"]
          id: string
          mascota_id: string
          origen_id: string
          origen_tabla: string
          programado_para: string
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
          titulo: string
        }
        Insert: {
          creado_en?: string
          cuerpo: string
          enviado_en?: string | null
          estado?: Database["public"]["Enums"]["estado_recordatorio"]
          id?: string
          mascota_id: string
          origen_id: string
          origen_tabla: string
          programado_para: string
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
          titulo: string
        }
        Update: {
          creado_en?: string
          cuerpo?: string
          enviado_en?: string | null
          estado?: Database["public"]["Enums"]["estado_recordatorio"]
          id?: string
          mascota_id?: string
          origen_id?: string
          origen_tabla?: string
          programado_para?: string
          tipo?: Database["public"]["Enums"]["tipo_notificacion"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordatorio_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aceptar_invitacion: {
        Args: { p_token: string }
        Returns: {
          actualizado_en: string | null
          archivado_en: string | null
          castrado: boolean | null
          color: string | null
          creado_en: string
          especie: Database["public"]["Enums"]["especie"]
          fallecido_en: string | null
          fecha_nacimiento: string | null
          foto_url: string | null
          id: string
          microchip: string | null
          nombre: string
          nota_extravio: string | null
          perdida_desde: string | null
          raza: string | null
          sexo: Database["public"]["Enums"]["sexo_mascota"]
        }
        SetofOptions: {
          from: "*"
          to: "mascota"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archivar_mascota: { Args: { p_mascota_id: string }; Returns: undefined }
      avisar_hallazgo: {
        Args: { p_contacto?: string; p_mensaje: string; p_token: string }
        Returns: undefined
      }
      buscar_pacientes: {
        Args: { p_texto?: string }
        Returns: {
          cantidad_tutores: number
          especie: Database["public"]["Enums"]["especie"]
          fallecido_en: string
          fecha_nacimiento: string
          foto_url: string
          mascota_id: string
          nombre: string
          raza: string
          titular_apellido: string
          titular_email: string
          titular_nombre: string
          titular_telefono: string
        }[]
      }
      cambiar_estado_personal: {
        Args: { p_activo: boolean; p_perfil_id: string }
        Returns: undefined
      }
      cambiar_rol: {
        Args: { p_perfil_id: string; p_rol: Database["public"]["Enums"]["rol"] }
        Returns: undefined
      }
      crear_mascota: {
        Args: {
          p_castrado?: boolean
          p_color?: string
          p_especie: Database["public"]["Enums"]["especie"]
          p_fecha_nacimiento?: string
          p_microchip?: string
          p_nombre: string
          p_raza?: string
          p_sexo?: Database["public"]["Enums"]["sexo_mascota"]
        }
        Returns: {
          actualizado_en: string | null
          archivado_en: string | null
          castrado: boolean | null
          color: string | null
          creado_en: string
          especie: Database["public"]["Enums"]["especie"]
          fallecido_en: string | null
          fecha_nacimiento: string | null
          foto_url: string | null
          id: string
          microchip: string | null
          nombre: string
          nota_extravio: string | null
          perdida_desde: string | null
          raza: string | null
          sexo: Database["public"]["Enums"]["sexo_mascota"]
        }
        SetofOptions: {
          from: "*"
          to: "mascota"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_paciente: {
        Args: {
          p_castrado?: boolean
          p_especie: Database["public"]["Enums"]["especie"]
          p_fecha_nacimiento?: string
          p_microchip?: string
          p_nombre: string
          p_raza?: string
          p_sexo?: Database["public"]["Enums"]["sexo_mascota"]
          p_tutor_apellido?: string
          p_tutor_dni?: string
          p_tutor_email?: string
          p_tutor_nombre: string
          p_tutor_telefono?: string
        }
        Returns: {
          actualizado_en: string | null
          archivado_en: string | null
          castrado: boolean | null
          color: string | null
          creado_en: string
          especie: Database["public"]["Enums"]["especie"]
          fallecido_en: string | null
          fecha_nacimiento: string | null
          foto_url: string | null
          id: string
          microchip: string | null
          nombre: string
          nota_extravio: string | null
          perdida_desde: string | null
          raza: string | null
          sexo: Database["public"]["Enums"]["sexo_mascota"]
        }
        SetofOptions: {
          from: "*"
          to: "mascota"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      dejar_mascota: { Args: { p_mascota_id: string }; Returns: undefined }
      desarchivar_mascota: {
        Args: { p_mascota_id: string }
        Returns: undefined
      }
      destinatarios_recordatorio: {
        Args: { p_recordatorio_id: string }
        Returns: {
          auth: string
          endpoint: string
          p256dh: string
          perfil_id: string
          sub_id: string
        }[]
      }
      eliminar_mascota: { Args: { p_mascota_id: string }; Returns: undefined }
      es_administrador: { Args: never; Returns: boolean }
      es_personal_clinica: { Args: never; Returns: boolean }
      es_titular_de: { Args: { p_mascota_id: string }; Returns: boolean }
      es_tutor_de: { Args: { p_mascota_id: string }; Returns: boolean }
      es_veterinario: { Args: never; Returns: boolean }
      generar_qr: {
        Args: { p_mascota_id: string }
        Returns: {
          activo: boolean
          creado_en: string
          id: string
          mascota_id: string
          revocado_en: string | null
          token: string
        }
        SetofOptions: {
          from: "*"
          to: "mascota_token_qr"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generar_recordatorios: {
        Args: { p_aviso_previo?: number; p_dias_antes?: number }
        Returns: number
      }
      historial_mascota: {
        Args: { p_mascota_id: string }
        Returns: {
          adjuntos: number
          anamnesis: string
          corrige_a: string
          diagnostico: string
          evolucion: string
          examen_fisico: string
          fecha: string
          id: string
          motivo: string
          peso_kg: number
          profesional: string
          temperatura: number
          tratamiento: string
        }[]
      }
      invitar_tutor: {
        Args: { p_mascota_id: string }
        Returns: {
          aceptada_en: string | null
          aceptada_por: string | null
          creada_por: string
          creado_en: string
          id: string
          mascota_id: string
          revocada_en: string | null
          token: string
          vence_en: string
        }
        SetofOptions: {
          from: "*"
          to: "invitacion_tutor"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      listar_personal: {
        Args: never
        Returns: {
          activo: boolean
          apellido: string
          creado_en: string
          email: string
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol"]
          soy_yo: boolean
        }[]
      }
      marcar_encontrada: { Args: { p_mascota_id: string }; Returns: undefined }
      marcar_fallecida: {
        Args: { p_fecha?: string; p_mascota_id: string }
        Returns: undefined
      }
      marcar_perdida: {
        Args: { p_mascota_id: string; p_nota?: string }
        Returns: undefined
      }
      mascota_id_del_path: { Args: { p_name: string }; Returns: string }
      mascota_por_qr: {
        Args: { p_token: string }
        Returns: {
          clinica_nombre: string
          clinica_telefono: string
          contacto_nombre: string
          contacto_telefono: string
          especie: Database["public"]["Enums"]["especie"]
          foto_url: string
          nombre: string
          nota_extravio: string
          perdida: boolean
          perdida_desde: string
          raza: string
        }[]
      }
      revocar_invitacion: {
        Args: { p_invitacion_id: string }
        Returns: undefined
      }
      revocar_tutor: {
        Args: { p_mascota_id: string; p_perfil_id: string }
        Returns: undefined
      }
      rol_actual: { Args: never; Returns: Database["public"]["Enums"]["rol"] }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      transferir_titularidad: {
        Args: { p_mascota_id: string; p_nuevo_titular: string }
        Returns: undefined
      }
      tutores_de_mascota: {
        Args: { p_mascota_id: string }
        Returns: {
          apellido: string
          desde: string
          email: string
          id: string
          nombre: string
          perfil_id: string
          rol: Database["public"]["Enums"]["rol_tutor"]
          soy_yo: boolean
        }[]
      }
      verificar_registro: {
        Args: { p_id: string; p_tabla: string }
        Returns: undefined
      }
    }
    Enums: {
      especie: "perro" | "gato" | "ave" | "roedor" | "reptil" | "otro"
      estado_recordatorio: "pendiente" | "enviado" | "cancelado" | "fallido"
      origen_dato: "tutor" | "clinica"
      rol: "cliente" | "recepcionista" | "veterinario" | "administrador"
      rol_tutor: "titular" | "tutor"
      sexo_mascota: "macho" | "hembra" | "desconocido"
      tipo_adjunto: "radiografia" | "ecografia" | "laboratorio" | "otro"
      tipo_antecedente: "alergia" | "cirugia" | "patologia_cronica" | "otro"
      tipo_aplicacion:
        | "vacuna"
        | "desparasitacion_interna"
        | "desparasitacion_externa"
      tipo_notificacion:
        | "vacuna"
        | "desparasitacion"
        | "medicacion"
        | "turno"
        | "hallazgo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      especie: ["perro", "gato", "ave", "roedor", "reptil", "otro"],
      estado_recordatorio: ["pendiente", "enviado", "cancelado", "fallido"],
      origen_dato: ["tutor", "clinica"],
      rol: ["cliente", "recepcionista", "veterinario", "administrador"],
      rol_tutor: ["titular", "tutor"],
      sexo_mascota: ["macho", "hembra", "desconocido"],
      tipo_adjunto: ["radiografia", "ecografia", "laboratorio", "otro"],
      tipo_antecedente: ["alergia", "cirugia", "patologia_cronica", "otro"],
      tipo_aplicacion: [
        "vacuna",
        "desparasitacion_interna",
        "desparasitacion_externa",
      ],
      tipo_notificacion: [
        "vacuna",
        "desparasitacion",
        "medicacion",
        "turno",
        "hallazgo",
      ],
    },
  },
} as const

