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
          consulta_id: string | null
          creado_en: string
          descripcion: string | null
          id: string
          internacion_id: string | null
          mascota_id: string
          mime: string
          nombre_archivo: string
          storage_path: string
          subido_por: string
          tamano_bytes: number
          tipo: Database["public"]["Enums"]["tipo_adjunto"]
        }
        Insert: {
          consulta_id?: string | null
          creado_en?: string
          descripcion?: string | null
          id?: string
          internacion_id?: string | null
          mascota_id: string
          mime: string
          nombre_archivo: string
          storage_path: string
          subido_por?: string
          tamano_bytes: number
          tipo?: Database["public"]["Enums"]["tipo_adjunto"]
        }
        Update: {
          consulta_id?: string | null
          creado_en?: string
          descripcion?: string | null
          id?: string
          internacion_id?: string | null
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
            foreignKeyName: "adjunto_internacion_id_fkey"
            columns: ["internacion_id"]
            isOneToOne: false
            referencedRelation: "internacion"
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
          descartado_en: string | null
          descartado_por: string | null
          descripcion: string
          fecha: string | null
          id: string
          mascota_id: string
          motivo_descarte: string | null
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
          descartado_en?: string | null
          descartado_por?: string | null
          descripcion: string
          fecha?: string | null
          id?: string
          mascota_id: string
          motivo_descarte?: string | null
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
          descartado_en?: string | null
          descartado_por?: string | null
          descripcion?: string
          fecha?: string | null
          id?: string
          mascota_id?: string
          motivo_descarte?: string | null
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
            foreignKeyName: "antecedente_descartado_por_fkey"
            columns: ["descartado_por"]
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
          descartado_en: string | null
          descartado_por: string | null
          fecha: string
          id: string
          lote: string | null
          mascota_id: string
          motivo_descarte: string | null
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
          descartado_en?: string | null
          descartado_por?: string | null
          fecha?: string
          id?: string
          lote?: string | null
          mascota_id: string
          motivo_descarte?: string | null
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
          descartado_en?: string | null
          descartado_por?: string | null
          fecha?: string
          id?: string
          lote?: string | null
          mascota_id?: string
          motivo_descarte?: string | null
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
            foreignKeyName: "aplicacion_descartado_por_fkey"
            columns: ["descartado_por"]
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
      bloqueo_agenda: {
        Row: {
          creado_en: string
          desde: string
          hasta: string
          id: string
          motivo: string | null
          profesional_id: string | null
        }
        Insert: {
          creado_en?: string
          desde: string
          hasta: string
          id?: string
          motivo?: string | null
          profesional_id?: string | null
        }
        Update: {
          creado_en?: string
          desde?: string
          hasta?: string
          id?: string
          motivo?: string | null
          profesional_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bloqueo_agenda_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesional"
            referencedColumns: ["id"]
          },
        ]
      }
      campana: {
        Row: {
          creada_en: string
          creada_por: string
          cuerpo: string
          destinatarios: number | null
          enviada_en: string | null
          estado: Database["public"]["Enums"]["estado_campana"]
          id: string
          segmento: Json
          titulo: string
          url: string | null
        }
        Insert: {
          creada_en?: string
          creada_por?: string
          cuerpo: string
          destinatarios?: number | null
          enviada_en?: string | null
          estado?: Database["public"]["Enums"]["estado_campana"]
          id?: string
          segmento?: Json
          titulo: string
          url?: string | null
        }
        Update: {
          creada_en?: string
          creada_por?: string
          cuerpo?: string
          destinatarios?: number | null
          enviada_en?: string | null
          estado?: Database["public"]["Enums"]["estado_campana"]
          id?: string
          segmento?: Json
          titulo?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campana_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      campana_envio: {
        Row: {
          campana_id: string
          enviado_en: string
          error: string | null
          estado: string
          id: number
          perfil_id: string
        }
        Insert: {
          campana_id: string
          enviado_en?: string
          error?: string | null
          estado: string
          id?: number
          perfil_id: string
        }
        Update: {
          campana_id?: string
          enviado_en?: string
          error?: string | null
          estado?: string
          id?: number
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campana_envio_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campana"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campana_envio_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobante: {
        Row: {
          cae: string | null
          cae_vencimiento: string | null
          creado_en: string
          cuit_receptor: string | null
          id: string
          numero: number
          orden_id: string
          punto_venta: number
          tipo_comprobante: string
          total: number
        }
        Insert: {
          cae?: string | null
          cae_vencimiento?: string | null
          creado_en?: string
          cuit_receptor?: string | null
          id?: string
          numero: number
          orden_id: string
          punto_venta?: number
          tipo_comprobante?: string
          total: number
        }
        Update: {
          cae?: string | null
          cae_vencimiento?: string | null
          creado_en?: string
          cuit_receptor?: string | null
          id?: string
          numero?: number
          orden_id?: string
          punto_venta?: number
          tipo_comprobante?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "comprobante_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "orden"
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
      consentimiento: {
        Row: {
          aceptado_en: string
          id: number
          perfil_id: string
          version: string
        }
        Insert: {
          aceptado_en?: string
          id?: number
          perfil_id: string
          version: string
        }
        Update: {
          aceptado_en?: string
          id?: number
          perfil_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consentimiento_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimiento_version_fkey"
            columns: ["version"]
            isOneToOne: false
            referencedRelation: "politica_privacidad"
            referencedColumns: ["version"]
          },
        ]
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
          direccion: string | null
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
          direccion?: string | null
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
          direccion?: string | null
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
      conversacion: {
        Row: {
          asunto: string
          cerrada_en: string | null
          cliente_id: string
          creada_en: string
          id: string
          mascota_id: string | null
          ultimo_mensaje_en: string
        }
        Insert: {
          asunto: string
          cerrada_en?: string | null
          cliente_id: string
          creada_en?: string
          id?: string
          mascota_id?: string | null
          ultimo_mensaje_en?: string
        }
        Update: {
          asunto?: string
          cerrada_en?: string | null
          cliente_id?: string
          creada_en?: string
          id?: string
          mascota_id?: string | null
          ultimo_mensaje_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversacion_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversacion_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
        ]
      }
      disponibilidad: {
        Row: {
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id: string
          profesional_id: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id?: string
          profesional_id: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          dia_semana?: number
          hora_fin?: string
          hora_inicio?: string
          id?: string
          profesional_id?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disponibilidad_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesional"
            referencedColumns: ["id"]
          },
        ]
      }
      especialidad: {
        Row: {
          activa: boolean
          creado_en: string
          duracion_min: number
          id: string
          monto_sena: number | null
          nombre: string
          requiere_sena: boolean
        }
        Insert: {
          activa?: boolean
          creado_en?: string
          duracion_min?: number
          id?: string
          monto_sena?: number | null
          nombre: string
          requiere_sena?: boolean
        }
        Update: {
          activa?: boolean
          creado_en?: string
          duracion_min?: number
          id?: string
          monto_sena?: number | null
          nombre?: string
          requiere_sena?: boolean
        }
        Relationships: []
      }
      intento_publico: {
        Row: {
          acierto: boolean
          creado_en: string
          id: number
          ip: string
          origen: string
        }
        Insert: {
          acierto: boolean
          creado_en?: string
          id?: number
          ip: string
          origen: string
        }
        Update: {
          acierto?: boolean
          creado_en?: string
          id?: number
          ip?: string
          origen?: string
        }
        Relationships: []
      }
      internacion: {
        Row: {
          actualizado_en: string | null
          archivado_en: string | null
          creado_en: string
          diagnostico: string | null
          direccion: string | null
          egreso_en: string | null
          estado: Database["public"]["Enums"]["internacion_estado"]
          id: string
          indicaciones: string | null
          ingreso_en: string
          mascota_id: string
          motivo: string
          motivo_egreso: string | null
          orden_id: string
          profesional_id: string
          tipo: string
          ubicacion: string | null
        }
        Insert: {
          actualizado_en?: string | null
          archivado_en?: string | null
          creado_en?: string
          diagnostico?: string | null
          direccion?: string | null
          egreso_en?: string | null
          estado?: Database["public"]["Enums"]["internacion_estado"]
          id?: string
          indicaciones?: string | null
          ingreso_en?: string
          mascota_id: string
          motivo: string
          motivo_egreso?: string | null
          orden_id: string
          profesional_id?: string
          tipo?: string
          ubicacion?: string | null
        }
        Update: {
          actualizado_en?: string | null
          archivado_en?: string | null
          creado_en?: string
          diagnostico?: string | null
          direccion?: string | null
          egreso_en?: string | null
          estado?: Database["public"]["Enums"]["internacion_estado"]
          id?: string
          indicaciones?: string | null
          ingreso_en?: string
          mascota_id?: string
          motivo?: string
          motivo_egreso?: string | null
          orden_id?: string
          profesional_id?: string
          tipo?: string
          ubicacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internacion_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internacion_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "orden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internacion_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      internacion_estudio: {
        Row: {
          creado_en: string
          fecha: string
          id: string
          internacion_id: string
          mascota_id: string
          orden_item_id: string | null
          resultado: string | null
          solicitado_por: string
          tipo: string
        }
        Insert: {
          creado_en?: string
          fecha?: string
          id?: string
          internacion_id: string
          mascota_id: string
          orden_item_id?: string | null
          resultado?: string | null
          solicitado_por?: string
          tipo: string
        }
        Update: {
          creado_en?: string
          fecha?: string
          id?: string
          internacion_id?: string
          mascota_id?: string
          orden_item_id?: string | null
          resultado?: string | null
          solicitado_por?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "internacion_estudio_internacion_id_fkey"
            columns: ["internacion_id"]
            isOneToOne: false
            referencedRelation: "internacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internacion_estudio_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internacion_estudio_orden_item_id_fkey"
            columns: ["orden_item_id"]
            isOneToOne: false
            referencedRelation: "orden_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internacion_estudio_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      internacion_evolucion: {
        Row: {
          creado_en: string
          fecha: string
          id: string
          internacion_id: string
          nota: string
          profesional_id: string
          temperatura: number | null
        }
        Insert: {
          creado_en?: string
          fecha?: string
          id?: string
          internacion_id: string
          nota: string
          profesional_id?: string
          temperatura?: number | null
        }
        Update: {
          creado_en?: string
          fecha?: string
          id?: string
          internacion_id?: string
          nota?: string
          profesional_id?: string
          temperatura?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "internacion_evolucion_internacion_id_fkey"
            columns: ["internacion_id"]
            isOneToOne: false
            referencedRelation: "internacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internacion_evolucion_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      internacion_medicacion: {
        Row: {
          administrado_por: string
          cantidad: number | null
          creado_en: string
          descripcion: string
          dosis: string | null
          fecha: string
          id: string
          internacion_id: string
          orden_item_id: string | null
          producto_id: string | null
          via: string | null
        }
        Insert: {
          administrado_por?: string
          cantidad?: number | null
          creado_en?: string
          descripcion: string
          dosis?: string | null
          fecha?: string
          id?: string
          internacion_id: string
          orden_item_id?: string | null
          producto_id?: string | null
          via?: string | null
        }
        Update: {
          administrado_por?: string
          cantidad?: number | null
          creado_en?: string
          descripcion?: string
          dosis?: string | null
          fecha?: string
          id?: string
          internacion_id?: string
          orden_item_id?: string | null
          producto_id?: string | null
          via?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internacion_medicacion_administrado_por_fkey"
            columns: ["administrado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internacion_medicacion_internacion_id_fkey"
            columns: ["internacion_id"]
            isOneToOne: false
            referencedRelation: "internacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internacion_medicacion_orden_item_id_fkey"
            columns: ["orden_item_id"]
            isOneToOne: false
            referencedRelation: "orden_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internacion_medicacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internacion_medicacion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "stock_actual"
            referencedColumns: ["producto_id"]
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
      lote: {
        Row: {
          creado_en: string
          id: string
          numero: string
          producto_id: string
          vencimiento: string | null
        }
        Insert: {
          creado_en?: string
          id?: string
          numero: string
          producto_id: string
          vencimiento?: string | null
        }
        Update: {
          creado_en?: string
          id?: string
          numero?: string
          producto_id?: string
          vencimiento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "stock_actual"
            referencedColumns: ["producto_id"]
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
          descartado_en: string | null
          descartado_por: string | null
          descripcion: string
          desde: string
          dosis: string | null
          frecuencia_horas: number | null
          hasta: string | null
          id: string
          mascota_id: string
          motivo_descarte: string | null
          origen: Database["public"]["Enums"]["origen_dato"]
          recordar: boolean
          verificado_en: string | null
          verificado_por: string | null
        }
        Insert: {
          actualizado_en?: string | null
          cargado_por?: string
          creado_en?: string
          descartado_en?: string | null
          descartado_por?: string | null
          descripcion: string
          desde?: string
          dosis?: string | null
          frecuencia_horas?: number | null
          hasta?: string | null
          id?: string
          mascota_id: string
          motivo_descarte?: string | null
          origen?: Database["public"]["Enums"]["origen_dato"]
          recordar?: boolean
          verificado_en?: string | null
          verificado_por?: string | null
        }
        Update: {
          actualizado_en?: string | null
          cargado_por?: string
          creado_en?: string
          descartado_en?: string | null
          descartado_por?: string | null
          descripcion?: string
          desde?: string
          dosis?: string | null
          frecuencia_horas?: number | null
          hasta?: string | null
          id?: string
          mascota_id?: string
          motivo_descarte?: string | null
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
            foreignKeyName: "medicacion_en_curso_descartado_por_fkey"
            columns: ["descartado_por"]
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
      mensaje: {
        Row: {
          autor_id: string
          conversacion_id: string
          creado_en: string
          cuerpo: string
          de_la_clinica: boolean
          id: string
          leido_en: string | null
        }
        Insert: {
          autor_id?: string
          conversacion_id: string
          creado_en?: string
          cuerpo: string
          de_la_clinica: boolean
          id?: string
          leido_en?: string | null
        }
        Update: {
          autor_id?: string
          conversacion_id?: string
          creado_en?: string
          cuerpo?: string
          de_la_clinica?: boolean
          id?: string
          leido_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensaje_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensaje_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversacion"
            referencedColumns: ["id"]
          },
        ]
      }
      movimiento_caja: {
        Row: {
          concepto: string
          creado_en: string
          id: string
          medio: Database["public"]["Enums"]["medio_pago"]
          monto: number
          pago_id: string | null
          tipo: string
          turno_caja_id: string
          usuario_id: string
        }
        Insert: {
          concepto: string
          creado_en?: string
          id?: string
          medio: Database["public"]["Enums"]["medio_pago"]
          monto: number
          pago_id?: string | null
          tipo: string
          turno_caja_id: string
          usuario_id?: string
        }
        Update: {
          concepto?: string
          creado_en?: string
          id?: string
          medio?: Database["public"]["Enums"]["medio_pago"]
          monto?: number
          pago_id?: string | null
          tipo?: string
          turno_caja_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimiento_caja_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_caja_turno_caja_id_fkey"
            columns: ["turno_caja_id"]
            isOneToOne: false
            referencedRelation: "turno_caja"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_caja_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      movimiento_stock: {
        Row: {
          cantidad: number
          creado_en: string
          id: string
          lote_id: string | null
          mascota_id: string | null
          motivo: string | null
          orden_id: string | null
          producto_id: string
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          usuario_id: string
        }
        Insert: {
          cantidad: number
          creado_en?: string
          id?: string
          lote_id?: string | null
          mascota_id?: string | null
          motivo?: string | null
          orden_id?: string | null
          producto_id: string
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          usuario_id?: string
        }
        Update: {
          cantidad?: number
          creado_en?: string
          id?: string
          lote_id?: string | null
          mascota_id?: string | null
          motivo?: string | null
          orden_id?: string | null
          producto_id?: string
          tipo?: Database["public"]["Enums"]["tipo_movimiento"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimiento_stock_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_stock_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "stock_por_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "movimiento_stock_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimiento_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "stock_actual"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimiento_stock_usuario_id_fkey"
            columns: ["usuario_id"]
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
      orden: {
        Row: {
          actualizado_en: string | null
          canal: string
          cliente_id: string | null
          creado_en: string
          creado_por: string | null
          estado: Database["public"]["Enums"]["estado_orden"]
          id: string
          notas: string | null
          total: number
          turno_caja_id: string | null
        }
        Insert: {
          actualizado_en?: string | null
          canal?: string
          cliente_id?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_orden"]
          id?: string
          notas?: string | null
          total?: number
          turno_caja_id?: string | null
        }
        Update: {
          actualizado_en?: string | null
          canal?: string
          cliente_id?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_orden"]
          id?: string
          notas?: string | null
          total?: number
          turno_caja_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orden_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_turno_caja_id_fkey"
            columns: ["turno_caja_id"]
            isOneToOne: false
            referencedRelation: "turno_caja"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_item: {
        Row: {
          cantidad: number
          descripcion: string
          id: string
          orden_id: string
          precio_unitario: number
          producto_id: string | null
          subtotal: number
        }
        Insert: {
          cantidad: number
          descripcion: string
          id?: string
          orden_id: string
          precio_unitario: number
          producto_id?: string | null
          subtotal: number
        }
        Update: {
          cantidad?: number
          descripcion?: string
          id?: string
          orden_id?: string
          precio_unitario?: number
          producto_id?: string | null
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "orden_item_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "orden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_item_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_item_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      pago: {
        Row: {
          confirmado_en: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_pago"]
          id: string
          medio: Database["public"]["Enums"]["medio_pago"]
          monto: number
          mp_payment_id: string | null
          mp_preference_id: string | null
          orden_id: string | null
          payload_webhook: Json | null
          registrado_por: string | null
          turno_id: string | null
        }
        Insert: {
          confirmado_en?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_pago"]
          id?: string
          medio: Database["public"]["Enums"]["medio_pago"]
          monto: number
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          orden_id?: string | null
          payload_webhook?: Json | null
          registrado_por?: string | null
          turno_id?: string | null
        }
        Update: {
          confirmado_en?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_pago"]
          id?: string
          medio?: Database["public"]["Enums"]["medio_pago"]
          monto?: number
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          orden_id?: string | null
          payload_webhook?: Json | null
          registrado_por?: string | null
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pago_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "orden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turno"
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
          roles: Database["public"]["Enums"]["rol"][]
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
          roles?: Database["public"]["Enums"]["rol"][]
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
          roles?: Database["public"]["Enums"]["rol"][]
          telefono?: string | null
        }
        Relationships: []
      }
      peso_registro: {
        Row: {
          actualizado_en: string | null
          cargado_por: string
          creado_en: string
          descartado_en: string | null
          descartado_por: string | null
          fecha: string
          id: string
          mascota_id: string
          motivo_descarte: string | null
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
          descartado_en?: string | null
          descartado_por?: string | null
          fecha?: string
          id?: string
          mascota_id: string
          motivo_descarte?: string | null
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
          descartado_en?: string | null
          descartado_por?: string | null
          fecha?: string
          id?: string
          mascota_id?: string
          motivo_descarte?: string | null
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
            foreignKeyName: "peso_registro_descartado_por_fkey"
            columns: ["descartado_por"]
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
      politica_privacidad: {
        Row: {
          contenido: string
          publicada_en: string
          version: string
          vigente: boolean
        }
        Insert: {
          contenido: string
          publicada_en?: string
          version: string
          vigente?: boolean
        }
        Update: {
          contenido?: string
          publicada_en?: string
          version?: string
          vigente?: boolean
        }
        Relationships: []
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
      producto: {
        Row: {
          actualizado_en: string | null
          archivado_en: string | null
          categoria: string | null
          controla_lote: boolean
          creado_en: string
          descripcion: string | null
          id: string
          imagen_url: string | null
          nombre: string
          precio: number
          requiere_receta: boolean
          stock_minimo: number
          visible_en_tienda: boolean
        }
        Insert: {
          actualizado_en?: string | null
          archivado_en?: string | null
          categoria?: string | null
          controla_lote?: boolean
          creado_en?: string
          descripcion?: string | null
          id?: string
          imagen_url?: string | null
          nombre: string
          precio: number
          requiere_receta?: boolean
          stock_minimo?: number
          visible_en_tienda?: boolean
        }
        Update: {
          actualizado_en?: string | null
          archivado_en?: string | null
          categoria?: string | null
          controla_lote?: boolean
          creado_en?: string
          descripcion?: string | null
          id?: string
          imagen_url?: string | null
          nombre?: string
          precio?: number
          requiere_receta?: boolean
          stock_minimo?: number
          visible_en_tienda?: boolean
        }
        Relationships: []
      }
      profesional: {
        Row: {
          acepta_turnos: boolean
          color_agenda: string
          creado_en: string
          id: string
          matricula: string | null
          perfil_id: string
        }
        Insert: {
          acepta_turnos?: boolean
          color_agenda?: string
          creado_en?: string
          id?: string
          matricula?: string | null
          perfil_id: string
        }
        Update: {
          acepta_turnos?: boolean
          color_agenda?: string
          creado_en?: string
          id?: string
          matricula?: string | null
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profesional_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: true
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      promocion: {
        Row: {
          activa: boolean
          categoria: string | null
          creada_en: string
          creada_por: string | null
          desde: string
          hasta: string
          id: string
          producto_id: string | null
          tipo_descuento: string
          titulo: string
          valor: number
        }
        Insert: {
          activa?: boolean
          categoria?: string | null
          creada_en?: string
          creada_por?: string | null
          desde: string
          hasta: string
          id?: string
          producto_id?: string | null
          tipo_descuento: string
          titulo: string
          valor: number
        }
        Update: {
          activa?: boolean
          categoria?: string | null
          creada_en?: string
          creada_por?: string | null
          desde?: string
          hasta?: string
          id?: string
          producto_id?: string | null
          tipo_descuento?: string
          titulo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "promocion_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promocion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promocion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "stock_actual"
            referencedColumns: ["producto_id"]
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
      receta: {
        Row: {
          anulada_en: string | null
          codigo: string
          consulta_id: string | null
          creado_en: string
          diagnostico: string | null
          dispensada_en: string | null
          emitida_en: string
          estado: Database["public"]["Enums"]["estado_receta"]
          id: string
          indicaciones: string | null
          mascota_id: string
          motivo_anulacion: string | null
          profesional_id: string
          vence_el: string
        }
        Insert: {
          anulada_en?: string | null
          codigo?: string
          consulta_id?: string | null
          creado_en?: string
          diagnostico?: string | null
          dispensada_en?: string | null
          emitida_en?: string
          estado?: Database["public"]["Enums"]["estado_receta"]
          id?: string
          indicaciones?: string | null
          mascota_id: string
          motivo_anulacion?: string | null
          profesional_id?: string
          vence_el: string
        }
        Update: {
          anulada_en?: string | null
          codigo?: string
          consulta_id?: string | null
          creado_en?: string
          diagnostico?: string | null
          dispensada_en?: string | null
          emitida_en?: string
          estado?: Database["public"]["Enums"]["estado_receta"]
          id?: string
          indicaciones?: string | null
          mascota_id?: string
          motivo_anulacion?: string | null
          profesional_id?: string
          vence_el?: string
        }
        Relationships: [
          {
            foreignKeyName: "receta_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consulta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receta_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receta_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      receta_item: {
        Row: {
          cantidad: string
          cronico: boolean
          descripcion: string
          dosis: string
          duracion: string | null
          id: string
          orden: number
          producto_id: string | null
          receta_id: string
        }
        Insert: {
          cantidad: string
          cronico?: boolean
          descripcion: string
          dosis: string
          duracion?: string | null
          id?: string
          orden?: number
          producto_id?: string | null
          receta_id: string
        }
        Update: {
          cantidad?: string
          cronico?: boolean
          descripcion?: string
          dosis?: string
          duracion?: string | null
          id?: string
          orden?: number
          producto_id?: string | null
          receta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receta_item_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receta_item_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "stock_actual"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "receta_item_receta_id_fkey"
            columns: ["receta_id"]
            isOneToOne: false
            referencedRelation: "receta"
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
      reserva_stock: {
        Row: {
          cantidad: number
          creado_en: string
          id: string
          liberada_en: string | null
          orden_id: string
          producto_id: string
          vence_en: string
        }
        Insert: {
          cantidad: number
          creado_en?: string
          id?: string
          liberada_en?: string | null
          orden_id: string
          producto_id: string
          vence_en?: string
        }
        Update: {
          cantidad?: number
          creado_en?: string
          id?: string
          liberada_en?: string | null
          orden_id?: string
          producto_id?: string
          vence_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserva_stock_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "orden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      solicitud_reposicion: {
        Row: {
          estado: Database["public"]["Enums"]["estado_solicitud_receta"]
          id: string
          mascota_id: string
          nota_respuesta: string | null
          nota_tutor: string | null
          receta_item_id: string
          receta_nueva_id: string | null
          resuelto_en: string | null
          resuelto_por: string | null
          solicitado_en: string
          solicitado_por: string
        }
        Insert: {
          estado?: Database["public"]["Enums"]["estado_solicitud_receta"]
          id?: string
          mascota_id: string
          nota_respuesta?: string | null
          nota_tutor?: string | null
          receta_item_id: string
          receta_nueva_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          solicitado_en?: string
          solicitado_por?: string
        }
        Update: {
          estado?: Database["public"]["Enums"]["estado_solicitud_receta"]
          id?: string
          mascota_id?: string
          nota_respuesta?: string | null
          nota_tutor?: string | null
          receta_item_id?: string
          receta_nueva_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          solicitado_en?: string
          solicitado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitud_reposicion_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_reposicion_receta_item_id_fkey"
            columns: ["receta_item_id"]
            isOneToOne: false
            referencedRelation: "receta_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_reposicion_receta_nueva_id_fkey"
            columns: ["receta_nueva_id"]
            isOneToOne: false
            referencedRelation: "receta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_reposicion_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_reposicion_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      turno: {
        Row: {
          actualizado_en: string | null
          cancelado_en: string | null
          cancelado_por: string | null
          creado_en: string
          especialidad_id: string
          estado: Database["public"]["Enums"]["estado_turno"]
          fin: string
          id: string
          inicio: string
          mascota_id: string
          motivo: string | null
          notas_internas: string | null
          profesional_id: string
          solicitado_por: string
        }
        Insert: {
          actualizado_en?: string | null
          cancelado_en?: string | null
          cancelado_por?: string | null
          creado_en?: string
          especialidad_id: string
          estado?: Database["public"]["Enums"]["estado_turno"]
          fin: string
          id?: string
          inicio: string
          mascota_id: string
          motivo?: string | null
          notas_internas?: string | null
          profesional_id: string
          solicitado_por?: string
        }
        Update: {
          actualizado_en?: string | null
          cancelado_en?: string | null
          cancelado_por?: string | null
          creado_en?: string
          especialidad_id?: string
          estado?: Database["public"]["Enums"]["estado_turno"]
          fin?: string
          id?: string
          inicio?: string
          mascota_id?: string
          motivo?: string | null
          notas_internas?: string | null
          profesional_id?: string
          solicitado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "turno_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_especialidad_id_fkey"
            columns: ["especialidad_id"]
            isOneToOne: false
            referencedRelation: "especialidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_mascota_id_fkey"
            columns: ["mascota_id"]
            isOneToOne: false
            referencedRelation: "mascota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      turno_caja: {
        Row: {
          abierto_en: string
          abierto_por: string
          cerrado_en: string | null
          cerrado_por: string | null
          diferencia: number | null
          id: string
          monto_calculado: number | null
          monto_declarado: number | null
          monto_inicial: number
          notas: string | null
        }
        Insert: {
          abierto_en?: string
          abierto_por?: string
          cerrado_en?: string | null
          cerrado_por?: string | null
          diferencia?: number | null
          id?: string
          monto_calculado?: number | null
          monto_declarado?: number | null
          monto_inicial?: number
          notas?: string | null
        }
        Update: {
          abierto_en?: string
          abierto_por?: string
          cerrado_en?: string | null
          cerrado_por?: string | null
          diferencia?: number | null
          id?: string
          monto_calculado?: number | null
          monto_declarado?: number | null
          monto_inicial?: number
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "turno_caja_abierto_por_fkey"
            columns: ["abierto_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_caja_cerrado_por_fkey"
            columns: ["cerrado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      stock_actual: {
        Row: {
          bajo_minimo: boolean | null
          cantidad: number | null
          categoria: string | null
          controla_lote: boolean | null
          imagen_url: string | null
          nombre: string | null
          precio: number | null
          producto_id: string | null
          requiere_receta: boolean | null
          stock_minimo: number | null
          visible_en_tienda: boolean | null
        }
        Relationships: []
      }
      stock_por_lote: {
        Row: {
          cantidad: number | null
          lote_id: string | null
          numero: string | null
          por_vencer: boolean | null
          producto: string | null
          producto_id: string | null
          vencido: boolean | null
          vencimiento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "stock_actual"
            referencedColumns: ["producto_id"]
          },
        ]
      }
    }
    Functions: {
      _internacion_agregar_item: {
        Args: {
          p_cantidad?: number
          p_concepto: string
          p_monto: number
          p_orden_id: string
        }
        Returns: string
      }
      abrir_caja: {
        Args: { p_monto_inicial?: number }
        Returns: {
          abierto_en: string
          abierto_por: string
          cerrado_en: string | null
          cerrado_por: string | null
          diferencia: number | null
          id: string
          monto_calculado: number | null
          monto_declarado: number | null
          monto_inicial: number
          notas: string | null
        }
        SetofOptions: {
          from: "*"
          to: "turno_caja"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      abrir_conversacion: {
        Args: {
          p_asunto: string
          p_cliente_id?: string
          p_mascota_id?: string
          p_mensaje: string
        }
        Returns: {
          asunto: string
          cerrada_en: string | null
          cliente_id: string
          creada_en: string
          id: string
          mascota_id: string | null
          ultimo_mensaje_en: string
        }
        SetofOptions: {
          from: "*"
          to: "conversacion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      aceptar_politica: {
        Args: never
        Returns: {
          aceptado_en: string
          id: number
          perfil_id: string
          version: string
        }
        SetofOptions: {
          from: "*"
          to: "consentimiento"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      actualizar_datos_tutor: {
        Args: {
          p_apellido: string
          p_dni?: string
          p_nombre: string
          p_perfil_id: string
          p_telefono?: string
        }
        Returns: {
          activo: boolean
          actualizado_en: string | null
          apellido: string
          archivado_en: string | null
          creado_en: string
          dni: string | null
          email: string
          id: string
          nombre: string
          roles: Database["public"]["Enums"]["rol"][]
          telefono: string | null
        }
        SetofOptions: {
          from: "*"
          to: "perfil"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      actualizar_internacion: {
        Args: {
          p_diagnostico?: string
          p_direccion?: string
          p_id: string
          p_indicaciones?: string
          p_ubicacion?: string
        }
        Returns: {
          actualizado_en: string | null
          archivado_en: string | null
          creado_en: string
          diagnostico: string | null
          direccion: string | null
          egreso_en: string | null
          estado: Database["public"]["Enums"]["internacion_estado"]
          id: string
          indicaciones: string | null
          ingreso_en: string
          mascota_id: string
          motivo: string
          motivo_egreso: string | null
          orden_id: string
          profesional_id: string
          tipo: string
          ubicacion: string | null
        }
        SetofOptions: {
          from: "*"
          to: "internacion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      actualizar_resultado_estudio: {
        Args: { p_estudio_id: string; p_resultado: string }
        Returns: {
          creado_en: string
          fecha: string
          id: string
          internacion_id: string
          mascota_id: string
          orden_item_id: string | null
          resultado: string | null
          solicitado_por: string
          tipo: string
        }
        SetofOptions: {
          from: "*"
          to: "internacion_estudio"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      agenda_dia: {
        Args: { p_fecha: string; p_profesional_id?: string }
        Returns: {
          color_agenda: string
          especie: Database["public"]["Enums"]["especie"]
          estado: Database["public"]["Enums"]["estado_turno"]
          fin: string
          id: string
          inicio: string
          mascota_id: string
          mascota_nombre: string
          motivo: string
          notas_internas: string
          profesional: string
          profesional_id: string
          tutor_nombre: string
          tutor_telefono: string
        }[]
      }
      agenda_rango: {
        Args: { p_desde: string; p_hasta: string; p_profesional_id?: string }
        Returns: {
          color_agenda: string
          dia: string
          especie: Database["public"]["Enums"]["especie"]
          estado: Database["public"]["Enums"]["estado_turno"]
          fin: string
          id: string
          inicio: string
          mascota_id: string
          mascota_nombre: string
          motivo: string
          notas_internas: string
          profesional: string
          profesional_id: string
          tutor_nombre: string
          tutor_telefono: string
        }[]
      }
      agregar_cargo_internacion: {
        Args: {
          p_cantidad?: number
          p_concepto: string
          p_internacion_id: string
          p_monto: number
        }
        Returns: {
          cantidad: number
          descripcion: string
          id: string
          orden_id: string
          precio_unitario: number
          producto_id: string | null
          subtotal: number
        }
        SetofOptions: {
          from: "*"
          to: "orden_item"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      alertas_inventario: {
        Args: never
        Returns: {
          cantidad: number
          detalle: string
          producto: string
          producto_id: string
          tipo: string
        }[]
      }
      anular_receta: {
        Args: { p_motivo: string; p_receta_id: string }
        Returns: {
          anulada_en: string | null
          codigo: string
          consulta_id: string | null
          creado_en: string
          diagnostico: string | null
          dispensada_en: string | null
          emitida_en: string
          estado: Database["public"]["Enums"]["estado_receta"]
          id: string
          indicaciones: string | null
          mascota_id: string
          motivo_anulacion: string | null
          profesional_id: string
          vence_el: string
        }
        SetofOptions: {
          from: "*"
          to: "receta"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archivar_mascota: { Args: { p_mascota_id: string }; Returns: undefined }
      avisar_hallazgo: {
        Args: { p_contacto?: string; p_mensaje: string; p_token: string }
        Returns: undefined
      }
      bandeja_conversaciones: {
        Args: { p_cerradas?: boolean }
        Returns: {
          asunto: string
          cerrada_en: string
          cliente: string
          cliente_id: string
          espera_respuesta: boolean
          id: string
          mascota: string
          mascota_id: string
          sin_leer: number
          telefono: string
          ultimo_mensaje: string
          ultimo_mensaje_en: string
        }[]
      }
      borrar_campana: { Args: { p_campana_id: string }; Returns: undefined }
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
      cambiar_estado_turno: {
        Args: {
          p_estado: Database["public"]["Enums"]["estado_turno"]
          p_turno_id: string
        }
        Returns: undefined
      }
      cambiar_roles: {
        Args: {
          p_perfil_id: string
          p_roles: Database["public"]["Enums"]["rol"][]
        }
        Returns: {
          activo: boolean
          actualizado_en: string | null
          apellido: string
          archivado_en: string | null
          creado_en: string
          dni: string | null
          email: string
          id: string
          nombre: string
          roles: Database["public"]["Enums"]["rol"][]
          telefono: string | null
        }
        SetofOptions: {
          from: "*"
          to: "perfil"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancelar_campana: {
        Args: { p_campana_id: string }
        Returns: {
          creada_en: string
          creada_por: string
          cuerpo: string
          destinatarios: number | null
          enviada_en: string | null
          estado: Database["public"]["Enums"]["estado_campana"]
          id: string
          segmento: Json
          titulo: string
          url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "campana"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancelar_orden: { Args: { p_orden_id: string }; Returns: undefined }
      cancelar_turno: { Args: { p_turno_id: string }; Returns: undefined }
      catalogo_tienda: {
        Args: never
        Returns: {
          categoria: string
          descripcion: string
          disponible: number
          id: string
          imagen_url: string
          nombre: string
          precio: number
          precio_promocional: number
          promocion_titulo: string
        }[]
      }
      cerrar_caja: {
        Args: { p_monto_declarado: number; p_notas?: string }
        Returns: {
          abierto_en: string
          abierto_por: string
          cerrado_en: string | null
          cerrado_por: string | null
          diferencia: number | null
          id: string
          monto_calculado: number | null
          monto_declarado: number | null
          monto_inicial: number
          notas: string | null
        }
        SetofOptions: {
          from: "*"
          to: "turno_caja"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cerrar_campana: { Args: { p_campana_id: string }; Returns: undefined }
      cerrar_internacion: {
        Args: { p_internacion_id: string; p_motivo_egreso?: string }
        Returns: {
          pagado: number
          saldo: number
          total: number
        }[]
      }
      confirmar_pago_online: {
        Args: {
          p_monto: number
          p_mp_payment_id: string
          p_orden_id: string
          p_payload?: Json
        }
        Returns: undefined
      }
      confirmar_pedido_local: {
        Args: {
          p_medio: Database["public"]["Enums"]["medio_pago"]
          p_orden_id: string
        }
        Returns: undefined
      }
      contactos_del_paciente: {
        Args: { p_mascota_id: string }
        Returns: {
          apellido: string
          direccion: string
          dni: string
          email: string
          id: string
          nombre: string
          perfil_id: string
          registrado: boolean
          rol_tutor: Database["public"]["Enums"]["rol_tutor"]
          telefono: string
        }[]
      }
      crear_campana: {
        Args: {
          p_cuerpo: string
          p_segmento?: Json
          p_titulo: string
          p_url?: string
        }
        Returns: {
          creada_en: string
          creada_por: string
          cuerpo: string
          destinatarios: number | null
          enviada_en: string | null
          estado: Database["public"]["Enums"]["estado_campana"]
          id: string
          segmento: Json
          titulo: string
          url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "campana"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      crear_internacion: {
        Args: {
          p_diagnostico?: string
          p_direccion?: string
          p_indicaciones?: string
          p_mascota_id: string
          p_motivo: string
          p_tipo?: string
          p_ubicacion?: string
        }
        Returns: {
          actualizado_en: string | null
          archivado_en: string | null
          creado_en: string
          diagnostico: string | null
          direccion: string | null
          egreso_en: string | null
          estado: Database["public"]["Enums"]["internacion_estado"]
          id: string
          indicaciones: string | null
          ingreso_en: string
          mascota_id: string
          motivo: string
          motivo_egreso: string | null
          orden_id: string
          profesional_id: string
          tipo: string
          ubicacion: string | null
        }
        SetofOptions: {
          from: "*"
          to: "internacion"
          isOneToOne: true
          isSetofReturn: false
        }
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
      crear_orden_online: {
        Args: { p_items: Json }
        Returns: {
          actualizado_en: string | null
          canal: string
          cliente_id: string | null
          creado_en: string
          creado_por: string | null
          estado: Database["public"]["Enums"]["estado_orden"]
          id: string
          notas: string | null
          total: number
          turno_caja_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orden"
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
      descartar_registro: {
        Args: { p_id: string; p_motivo: string; p_tabla: string }
        Returns: undefined
      }
      destinatarios_campana: {
        Args: { p_campana_id: string }
        Returns: {
          auth_key: string
          endpoint: string
          p256dh: string
          perfil_id: string
          sub_id: string
        }[]
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
      emitir_receta: {
        Args: {
          p_consulta_id?: string
          p_diagnostico?: string
          p_indicaciones?: string
          p_items: Json
          p_mascota_id: string
          p_vence_el: string
        }
        Returns: {
          anulada_en: string | null
          codigo: string
          consulta_id: string | null
          creado_en: string
          diagnostico: string | null
          dispensada_en: string | null
          emitida_en: string
          estado: Database["public"]["Enums"]["estado_receta"]
          id: string
          indicaciones: string | null
          mascota_id: string
          motivo_anulacion: string | null
          profesional_id: string
          vence_el: string
        }
        SetofOptions: {
          from: "*"
          to: "receta"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      es_administrador: { Args: never; Returns: boolean }
      es_personal_clinica: { Args: never; Returns: boolean }
      es_titular_de: { Args: { p_mascota_id: string }; Returns: boolean }
      es_tutor_de: { Args: { p_mascota_id: string }; Returns: boolean }
      es_veterinario: { Args: never; Returns: boolean }
      flujo_caja_mensual: {
        Args: { p_meses?: number }
        Returns: {
          efectivo: number
          egresos: number
          ingresos: number
          mes: string
          movimientos: number
          neto: number
          otros_medios: number
        }[]
      }
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
      historial_cajas: {
        Args: { p_limite?: number }
        Returns: {
          abierto_en: string
          abierto_por: string
          cerrado_en: string
          cerrado_por: string
          diferencia: number
          egresos: number
          id: string
          ingresos: number
          monto_calculado: number
          monto_declarado: number
          monto_inicial: number
          notas: string
          ventas: number
        }[]
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
      internaciones_activas: {
        Args: { p_tipo?: string }
        Returns: {
          direccion: string
          especie: Database["public"]["Enums"]["especie"]
          id: string
          ingreso_en: string
          mascota: string
          mascota_id: string
          motivo: string
          profesional: string
          saldo: number
          tipo: string
          total_cargos: number
          total_pagado: number
          ubicacion: string
        }[]
      }
      internaciones_con_saldo: {
        Args: { p_tipo?: string }
        Returns: {
          egreso_en: string
          especie: Database["public"]["Enums"]["especie"]
          id: string
          mascota: string
          mascota_id: string
          profesional: string
          saldo: number
          tipo: string
          total_cargos: number
          total_pagado: number
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
      lanzar_campana: {
        Args: { p_campana_id: string }
        Returns: {
          creada_en: string
          creada_por: string
          cuerpo: string
          destinatarios: number | null
          enviada_en: string | null
          estado: Database["public"]["Enums"]["estado_campana"]
          id: string
          segmento: Json
          titulo: string
          url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "campana"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      limpiar_intentos_publicos: { Args: never; Returns: number }
      linea_de_tiempo: {
        Args: { p_antes_de?: string; p_limite?: number; p_mascota_id: string }
        Returns: {
          detalle: string
          fecha: string
          momento: string
          origen: Database["public"]["Enums"]["origen_dato"]
          origen_id: string
          tipo: Database["public"]["Enums"]["tipo_evento_salud"]
          titulo: string
        }[]
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
          roles: Database["public"]["Enums"]["rol"][]
          soy_yo: boolean
        }[]
      }
      marcar_conversacion_leida: {
        Args: { p_conversacion_id: string }
        Returns: number
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
      marcar_receta_dispensada: {
        Args: { p_receta_id: string }
        Returns: {
          anulada_en: string | null
          codigo: string
          consulta_id: string | null
          creado_en: string
          diagnostico: string | null
          dispensada_en: string | null
          emitida_en: string
          estado: Database["public"]["Enums"]["estado_receta"]
          id: string
          indicaciones: string | null
          mascota_id: string
          motivo_anulacion: string | null
          profesional_id: string
          vence_el: string
        }
        SetofOptions: {
          from: "*"
          to: "receta"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mascota_id_del_path: { Args: { p_name: string }; Returns: string }
      mascota_por_qr: {
        Args: { p_token: string }
        Returns: {
          clinica_logo: string
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
      metricas_profesionales: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: {
          atendidos: number
          ausentes: number
          cancelados: number
          consultas: number
          profesional: string
          profesional_id: string
        }[]
      }
      metricas_resumen: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: Json
      }
      metricas_turnos: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: {
          atendidos: number
          ausentes: number
          cancelados: number
          confirmados: number
          dia: string
          solicitados: number
        }[]
      }
      metricas_ventas: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: Json
      }
      pacientes_inactivos: {
        Args: { p_meses?: number }
        Returns: {
          email: string
          especie: Database["public"]["Enums"]["especie"]
          mascota: string
          mascota_id: string
          meses_sin_venir: number
          telefono: string
          tutor: string
          ultima_atencion: string
        }[]
      }
      perfiles_del_segmento: {
        Args: { p_segmento: Json }
        Returns: {
          apellido: string
          email: string
          mascotas: string
          nombre: string
          perfil_id: string
        }[]
      }
      politica_pendiente: { Args: never; Returns: Json }
      precio_con_promocion: {
        Args: { p_categoria: string; p_precio: number; p_producto_id: string }
        Returns: {
          precio_final: number
          titulo_promocion: string
        }[]
      }
      previsualizar_campana: { Args: { p_segmento: Json }; Returns: Json }
      profesionales_disponibles: {
        Args: never
        Returns: {
          apellido: string
          color_agenda: string
          id: string
          matricula: string
          nombre: string
        }[]
      }
      publicar_politica: {
        Args: { p_contenido: string; p_version: string }
        Returns: {
          contenido: string
          publicada_en: string
          version: string
          vigente: boolean
        }
        SetofOptions: {
          from: "*"
          to: "politica_privacidad"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      receta_para_imprimir: { Args: { p_receta_id: string }; Returns: Json }
      registrar_estudio_internacion: {
        Args: {
          p_cargo_concepto?: string
          p_cargo_monto?: number
          p_internacion_id: string
          p_resultado?: string
          p_tipo: string
        }
        Returns: {
          creado_en: string
          fecha: string
          id: string
          internacion_id: string
          mascota_id: string
          orden_item_id: string | null
          resultado: string | null
          solicitado_por: string
          tipo: string
        }
        SetofOptions: {
          from: "*"
          to: "internacion_estudio"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_evolucion_internacion: {
        Args: {
          p_internacion_id: string
          p_nota: string
          p_temperatura?: number
        }
        Returns: {
          creado_en: string
          fecha: string
          id: string
          internacion_id: string
          nota: string
          profesional_id: string
          temperatura: number | null
        }
        SetofOptions: {
          from: "*"
          to: "internacion_evolucion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_intento_publico: {
        Args: { p_acierto: boolean; p_limite?: number; p_origen: string }
        Returns: boolean
      }
      registrar_medicacion_internacion: {
        Args: {
          p_cargo_concepto?: string
          p_cargo_monto?: number
          p_descripcion: string
          p_dosis?: string
          p_internacion_id: string
          p_producto_id?: string
          p_unidades?: number
          p_via?: string
        }
        Returns: {
          administrado_por: string
          cantidad: number | null
          creado_en: string
          descripcion: string
          dosis: string | null
          fecha: string
          id: string
          internacion_id: string
          orden_item_id: string | null
          producto_id: string | null
          via: string | null
        }
        SetofOptions: {
          from: "*"
          to: "internacion_medicacion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_movimiento: {
        Args: {
          p_cantidad: number
          p_lote_id?: string
          p_mascota_id?: string
          p_motivo?: string
          p_orden_id?: string
          p_producto_id: string
          p_tipo: Database["public"]["Enums"]["tipo_movimiento"]
        }
        Returns: {
          cantidad: number
          creado_en: string
          id: string
          lote_id: string | null
          mascota_id: string | null
          motivo: string | null
          orden_id: string | null
          producto_id: string
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          usuario_id: string
        }
        SetofOptions: {
          from: "*"
          to: "movimiento_stock"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_movimiento_caja: {
        Args: {
          p_concepto: string
          p_medio: Database["public"]["Enums"]["medio_pago"]
          p_monto: number
          p_tipo: string
        }
        Returns: {
          concepto: string
          creado_en: string
          id: string
          medio: Database["public"]["Enums"]["medio_pago"]
          monto: number
          pago_id: string | null
          tipo: string
          turno_caja_id: string
          usuario_id: string
        }
        SetofOptions: {
          from: "*"
          to: "movimiento_caja"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_pago_internacion: {
        Args: {
          p_internacion_id: string
          p_medio: Database["public"]["Enums"]["medio_pago"]
          p_monto: number
        }
        Returns: {
          confirmado_en: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_pago"]
          id: string
          medio: Database["public"]["Enums"]["medio_pago"]
          monto: number
          mp_payment_id: string | null
          mp_preference_id: string | null
          orden_id: string | null
          payload_webhook: Json | null
          registrado_por: string | null
          turno_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pago"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reposiciones_pendientes: {
        Args: never
        Returns: {
          dosis: string
          especie: Database["public"]["Enums"]["especie"]
          id: string
          mascota: string
          mascota_id: string
          medicamento: string
          nota_tutor: string
          receta_codigo: string
          receta_id: string
          receta_vence_el: string
          solicitado_en: string
          solicitante: string
        }[]
      }
      resolver_reposicion: {
        Args: {
          p_aprobar: boolean
          p_nota?: string
          p_receta_nueva_id?: string
          p_solicitud_id: string
        }
        Returns: {
          estado: Database["public"]["Enums"]["estado_solicitud_receta"]
          id: string
          mascota_id: string
          nota_respuesta: string | null
          nota_tutor: string | null
          receta_item_id: string
          receta_nueva_id: string | null
          resuelto_en: string | null
          resuelto_por: string | null
          solicitado_en: string
          solicitado_por: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitud_reposicion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restaurar_registro: {
        Args: { p_id: string; p_tabla: string }
        Returns: undefined
      }
      resumen_caja: {
        Args: never
        Returns: {
          abierta_en: string
          caja_id: string
          efectivo: number
          egresos: number
          esperado_cajon: number
          monto_inicial: number
          otros_medios: number
          ventas: number
        }[]
      }
      resumen_internacion: {
        Args: { p_internacion_id: string }
        Returns: {
          diagnostico: string
          direccion: string
          egreso_en: string
          especie: Database["public"]["Enums"]["especie"]
          estado: Database["public"]["Enums"]["internacion_estado"]
          id: string
          indicaciones: string
          ingreso_en: string
          mascota: string
          mascota_id: string
          motivo: string
          motivo_egreso: string
          n_estudios: number
          n_evoluciones: number
          n_medicacion: number
          orden_id: string
          profesional: string
          saldo: number
          tipo: string
          total_cargos: number
          total_pagado: number
          ubicacion: string
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
      roles_actuales: {
        Args: never
        Returns: Database["public"]["Enums"]["rol"][]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slots_disponibles: {
        Args: {
          p_duracion_min?: number
          p_especialidad_id?: string
          p_fecha: string
          p_profesional_id: string
        }
        Returns: {
          fin: string
          inicio: string
        }[]
      }
      solicitar_reposicion: {
        Args: { p_nota?: string; p_receta_item_id: string }
        Returns: {
          estado: Database["public"]["Enums"]["estado_solicitud_receta"]
          id: string
          mascota_id: string
          nota_respuesta: string | null
          nota_tutor: string | null
          receta_item_id: string
          receta_nueva_id: string | null
          resuelto_en: string | null
          resuelto_por: string | null
          solicitado_en: string
          solicitado_por: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitud_reposicion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      solicitar_turno: {
        Args: {
          p_especialidad_id: string
          p_inicio: string
          p_mascota_id: string
          p_motivo?: string
          p_profesional_id: string
        }
        Returns: {
          actualizado_en: string | null
          cancelado_en: string | null
          cancelado_por: string | null
          creado_en: string
          especialidad_id: string
          estado: Database["public"]["Enums"]["estado_turno"]
          fin: string
          id: string
          inicio: string
          mascota_id: string
          motivo: string | null
          notas_internas: string | null
          profesional_id: string
          solicitado_por: string
        }
        SetofOptions: {
          from: "*"
          to: "turno"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stock_disponible: { Args: { p_producto_id: string }; Returns: number }
      tiene_rol: {
        Args: { p_rol: Database["public"]["Enums"]["rol"] }
        Returns: boolean
      }
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
      vender_mostrador: {
        Args: {
          p_cliente_id?: string
          p_items: Json
          p_medio: Database["public"]["Enums"]["medio_pago"]
          p_notas?: string
        }
        Returns: {
          actualizado_en: string | null
          canal: string
          cliente_id: string | null
          creado_en: string
          creado_por: string | null
          estado: Database["public"]["Enums"]["estado_orden"]
          id: string
          notas: string | null
          total: number
          turno_caja_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orden"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verificar_receta: { Args: { p_codigo: string }; Returns: Json }
      verificar_registro: {
        Args: { p_id: string; p_tabla: string }
        Returns: undefined
      }
    }
    Enums: {
      especie: "perro" | "gato" | "ave" | "roedor" | "reptil" | "otro"
      estado_campana: "borrador" | "enviando" | "enviada" | "cancelada"
      estado_orden:
        | "borrador"
        | "pendiente_pago"
        | "pagada"
        | "entregada"
        | "cancelada"
      estado_pago: "pendiente" | "aprobado" | "rechazado" | "devuelto"
      estado_receta: "vigente" | "dispensada" | "anulada"
      estado_recordatorio: "pendiente" | "enviado" | "cancelado" | "fallido"
      estado_solicitud_receta: "pendiente" | "aprobada" | "rechazada"
      estado_turno:
        | "solicitado"
        | "confirmado"
        | "en_curso"
        | "atendido"
        | "cancelado"
        | "ausente"
      internacion_estado: "activa" | "cerrada"
      medio_pago:
        | "efectivo"
        | "debito"
        | "credito"
        | "transferencia"
        | "mercadopago"
        | "cuenta_corriente"
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
      tipo_evento_salud:
        | "consulta"
        | "aplicacion"
        | "peso"
        | "antecedente"
        | "medicacion"
        | "receta"
        | "turno"
      tipo_movimiento:
        | "ingreso"
        | "venta"
        | "uso_clinico"
        | "ajuste"
        | "vencimiento"
        | "devolucion"
      tipo_notificacion:
        | "vacuna"
        | "desparasitacion"
        | "medicacion"
        | "turno"
        | "hallazgo"
        | "campana"
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
      estado_campana: ["borrador", "enviando", "enviada", "cancelada"],
      estado_orden: [
        "borrador",
        "pendiente_pago",
        "pagada",
        "entregada",
        "cancelada",
      ],
      estado_pago: ["pendiente", "aprobado", "rechazado", "devuelto"],
      estado_receta: ["vigente", "dispensada", "anulada"],
      estado_recordatorio: ["pendiente", "enviado", "cancelado", "fallido"],
      estado_solicitud_receta: ["pendiente", "aprobada", "rechazada"],
      estado_turno: [
        "solicitado",
        "confirmado",
        "en_curso",
        "atendido",
        "cancelado",
        "ausente",
      ],
      internacion_estado: ["activa", "cerrada"],
      medio_pago: [
        "efectivo",
        "debito",
        "credito",
        "transferencia",
        "mercadopago",
        "cuenta_corriente",
      ],
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
      tipo_evento_salud: [
        "consulta",
        "aplicacion",
        "peso",
        "antecedente",
        "medicacion",
        "receta",
        "turno",
      ],
      tipo_movimiento: [
        "ingreso",
        "venta",
        "uso_clinico",
        "ajuste",
        "vencimiento",
        "devolucion",
      ],
      tipo_notificacion: [
        "vacuna",
        "desparasitacion",
        "medicacion",
        "turno",
        "hallazgo",
        "campana",
      ],
    },
  },
} as const

