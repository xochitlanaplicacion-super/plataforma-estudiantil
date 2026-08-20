export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      abonos_pago: {
        Row: {
          created_at: string
          fecha: string
          id: string
          monto: number
          notas: string | null
          pago_alumno_id: string
          recibo: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          monto: number
          notas?: string | null
          pago_alumno_id: string
          recibo?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          monto?: number
          notas?: string | null
          pago_alumno_id?: string
          recibo?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abonos_pago_pago_alumno_id_fkey"
            columns: ["pago_alumno_id"]
            isOneToOne: false
            referencedRelation: "pagos_alumno"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abonos_pago_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      acreditaciones_alumnos: {
        Row: {
          alumno_id: string | null
          calificacion_numerica: number | null
          created_at: string | null
          curp: string
          estatus: string
          etapas_evaluacion: Json | null
          fecha_expedicion: string | null
          folio_identificacion: string | null
          id: string
          nivel: string | null
          nombres: string | null
          perfil: string | null
          primer_apellido: string | null
          puntaje_total: number | null
          resultado_final: string | null
          segundo_apellido: string | null
          tenant_id: string
          visto_por_alumno: boolean | null
        }
        Insert: {
          alumno_id?: string | null
          calificacion_numerica?: number | null
          created_at?: string | null
          curp: string
          estatus: string
          etapas_evaluacion?: Json | null
          fecha_expedicion?: string | null
          folio_identificacion?: string | null
          id?: string
          nivel?: string | null
          nombres?: string | null
          perfil?: string | null
          primer_apellido?: string | null
          puntaje_total?: number | null
          resultado_final?: string | null
          segundo_apellido?: string | null
          tenant_id: string
          visto_por_alumno?: boolean | null
        }
        Update: {
          alumno_id?: string | null
          calificacion_numerica?: number | null
          created_at?: string | null
          curp?: string
          estatus?: string
          etapas_evaluacion?: Json | null
          fecha_expedicion?: string | null
          folio_identificacion?: string | null
          id?: string
          nivel?: string | null
          nombres?: string | null
          perfil?: string | null
          primer_apellido?: string | null
          puntaje_total?: number | null
          resultado_final?: string | null
          segundo_apellido?: string | null
          tenant_id?: string
          visto_por_alumno?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "acreditaciones_alumnos_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acreditaciones_alumnos_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acreditaciones_alumnos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agrupaciones_profesor: {
        Row: {
          asignaciones_ids: Json
          created_at: string | null
          id: string
          nombre: string
          profesor_id: string | null
          tenant_id: string
        }
        Insert: {
          asignaciones_ids: Json
          created_at?: string | null
          id?: string
          nombre: string
          profesor_id?: string | null
          tenant_id: string
        }
        Update: {
          asignaciones_ids?: Json
          created_at?: string | null
          id?: string
          nombre?: string
          profesor_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agrupaciones_profesor_profesor_id_fkey"
            columns: ["profesor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agrupaciones_profesor_profesor_id_fkey"
            columns: ["profesor_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agrupaciones_profesor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_alumno_daily_messages: {
        Row: {
          alumno_id: string
          created_at: string | null
          fecha: string
          id: string
          message_count: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          alumno_id: string
          created_at?: string | null
          fecha: string
          id?: string
          message_count?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          alumno_id?: string
          created_at?: string | null
          fecha?: string
          id?: string
          message_count?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_alumno_daily_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_daily_web_searches: {
        Row: {
          created_at: string | null
          fecha: string
          id: string
          profesor_id: string
          search_count: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fecha?: string
          id?: string
          profesor_id: string
          search_count?: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fecha?: string
          id?: string
          profesor_id?: string
          search_count?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_daily_web_searches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_red_list_alerts: {
        Row: {
          fecha_chat: string
          fecha_deteccion: string | null
          id: string
          motivo: string
          session_id: string
          session_name: string | null
          tenant_id: string
          user_id: string
          user_name: string | null
          user_type: string
        }
        Insert: {
          fecha_chat: string
          fecha_deteccion?: string | null
          id?: string
          motivo: string
          session_id: string
          session_name?: string | null
          tenant_id: string
          user_id: string
          user_name?: string | null
          user_type: string
        }
        Update: {
          fecha_chat?: string
          fecha_deteccion?: string | null
          id?: string
          motivo?: string
          session_id?: string
          session_name?: string | null
          tenant_id?: string
          user_id?: string
          user_name?: string | null
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_red_list_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_session_categories: {
        Row: {
          categoria: string
          id: string
          last_analyzed_at: string | null
          session_id: string
          session_name: string | null
          tenant_id: string
          user_id: string
          user_type: string
        }
        Insert: {
          categoria: string
          id?: string
          last_analyzed_at?: string | null
          session_id: string
          session_name?: string | null
          tenant_id: string
          user_id: string
          user_type: string
        }
        Update: {
          categoria?: string
          id?: string
          last_analyzed_at?: string | null
          session_id?: string
          session_name?: string | null
          tenant_id?: string
          user_id?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_session_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_token_usage: {
        Row: {
          clase_tema: string
          completion_tokens: number
          created_at: string | null
          estimated_cost_usd: number | null
          id: string
          model_used: string
          prompt_tokens: number
          tenant_id: string
          tipo_peticion: string
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          clase_tema: string
          completion_tokens: number
          created_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          model_used: string
          prompt_tokens: number
          tenant_id: string
          tipo_peticion: string
          total_tokens: number
          user_id?: string | null
        }
        Update: {
          clase_tema?: string
          completion_tokens?: number
          created_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          model_used?: string
          prompt_tokens?: number
          tenant_id?: string
          tipo_peticion?: string
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_token_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          chat_session_id: string | null
          costo_usd: number
          created_at: string
          id: string
          modelo_usado: string
          profesor_id: string
          tenant_id: string
          tokens_entrada: number
          tokens_salida: number
        }
        Insert: {
          chat_session_id?: string | null
          costo_usd?: number
          created_at?: string
          id?: string
          modelo_usado: string
          profesor_id: string
          tenant_id: string
          tokens_entrada?: number
          tokens_salida?: number
        }
        Update: {
          chat_session_id?: string | null
          costo_usd?: number
          created_at?: string
          id?: string
          modelo_usado?: string
          profesor_id?: string
          tenant_id?: string
          tokens_entrada?: number
          tokens_salida?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "profesor_chat_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alumno_chat_history: {
        Row: {
          alumno_id: string
          created_at: string
          id: string
          messages: Json
          session_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alumno_id: string
          created_at?: string
          id?: string
          messages?: Json
          session_name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          created_at?: string
          id?: string
          messages?: Json
          session_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumno_chat_history_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumno_chat_history_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumno_chat_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      asignaciones_profesor: {
        Row: {
          activo: boolean | null
          carrera_id: string | null
          created_at: string | null
          grado_id: string | null
          grupo_id: string | null
          id: string
          materia_id: string | null
          nivel_id: string | null
          profesor_id: string | null
          tenant_id: string
        }
        Insert: {
          activo?: boolean | null
          carrera_id?: string | null
          created_at?: string | null
          grado_id?: string | null
          grupo_id?: string | null
          id?: string
          materia_id?: string | null
          nivel_id?: string | null
          profesor_id?: string | null
          tenant_id: string
        }
        Update: {
          activo?: boolean | null
          carrera_id?: string | null
          created_at?: string | null
          grado_id?: string | null
          grupo_id?: string | null
          id?: string
          materia_id?: string | null
          nivel_id?: string | null
          profesor_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asignaciones_profesor_carrera_id_fkey"
            columns: ["carrera_id"]
            isOneToOne: false
            referencedRelation: "carreras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_profesor_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_profesor_nivel_id_fkey"
            columns: ["nivel_id"]
            isOneToOne: false
            referencedRelation: "niveles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_profesor_profesor_id_fkey"
            columns: ["profesor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_profesor_profesor_id_fkey"
            columns: ["profesor_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_profesor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_asignaciones_profesor_grupo"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      aspirantes: {
        Row: {
          apellidos: string
          carrera_id: string | null
          created_at: string
          curp: string
          email: string
          estatus: string | null
          fecha_nacimiento: string | null
          genero: string | null
          id: string
          is_archived: boolean | null
          nivel: string
          nombre: string
          notas: string | null
          telefono: string
          tenant_id: string
        }
        Insert: {
          apellidos: string
          carrera_id?: string | null
          created_at?: string
          curp: string
          email: string
          estatus?: string | null
          fecha_nacimiento?: string | null
          genero?: string | null
          id?: string
          is_archived?: boolean | null
          nivel: string
          nombre: string
          notas?: string | null
          telefono: string
          tenant_id: string
        }
        Update: {
          apellidos?: string
          carrera_id?: string | null
          created_at?: string
          curp?: string
          email?: string
          estatus?: string | null
          fecha_nacimiento?: string | null
          genero?: string | null
          id?: string
          is_archived?: boolean | null
          nivel?: string
          nombre?: string
          notas?: string | null
          telefono?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aspirantes_carrera_id_fkey"
            columns: ["carrera_id"]
            isOneToOne: false
            referencedRelation: "carreras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aspirantes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          accion: string
          created_at: string | null
          detalles: Json | null
          entidad: string
          entidad_id: string | null
          id: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          accion: string
          created_at?: string | null
          detalles?: Json | null
          entidad: string
          entidad_id?: string | null
          id?: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          accion?: string
          created_at?: string | null
          detalles?: Json | null
          entidad?: string
          entidad_id?: string | null
          id?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
        ]
      }
      carreras: {
        Row: {
          activo: boolean | null
          clave: string | null
          created_at: string | null
          id: string
          nivel_id: string | null
          nombre: string
          tenant_id: string
        }
        Insert: {
          activo?: boolean | null
          clave?: string | null
          created_at?: string | null
          id?: string
          nivel_id?: string | null
          nombre: string
          tenant_id: string
        }
        Update: {
          activo?: boolean | null
          clave?: string | null
          created_at?: string | null
          id?: string
          nivel_id?: string | null
          nombre?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carreras_nivel_id_fkey"
            columns: ["nivel_id"]
            isOneToOne: false
            referencedRelation: "niveles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carreras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      config_credenciales: {
        Row: {
          color_panel_izquierdo: string | null
          color_primario: string | null
          color_secundario: string | null
          color_texto_primario: string | null
          color_texto_secundario: string | null
          firma_director_url: string | null
          fuente_principal: string | null
          fuente_secundaria: string | null
          id: string
          logo_escala: number | null
          logo_x: number | null
          logo_y: number | null
          panel_diseno: string | null
          reverso_imagen_url: string | null
          reverso_texto_legal: string | null
          sello_institucion_url: string | null
          tenant_id: string
          trama_escala: number | null
          trama_imagen_url: string | null
          trama_opacidad: number | null
          trama_rotacion: number | null
          trama_tipo: string | null
          updated_at: string | null
        }
        Insert: {
          color_panel_izquierdo?: string | null
          color_primario?: string | null
          color_secundario?: string | null
          color_texto_primario?: string | null
          color_texto_secundario?: string | null
          firma_director_url?: string | null
          fuente_principal?: string | null
          fuente_secundaria?: string | null
          id?: string
          logo_escala?: number | null
          logo_x?: number | null
          logo_y?: number | null
          panel_diseno?: string | null
          reverso_imagen_url?: string | null
          reverso_texto_legal?: string | null
          sello_institucion_url?: string | null
          tenant_id: string
          trama_escala?: number | null
          trama_imagen_url?: string | null
          trama_opacidad?: number | null
          trama_rotacion?: number | null
          trama_tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          color_panel_izquierdo?: string | null
          color_primario?: string | null
          color_secundario?: string | null
          color_texto_primario?: string | null
          color_texto_secundario?: string | null
          firma_director_url?: string | null
          fuente_principal?: string | null
          fuente_secundaria?: string | null
          id?: string
          logo_escala?: number | null
          logo_x?: number | null
          logo_y?: number | null
          panel_diseno?: string | null
          reverso_imagen_url?: string | null
          reverso_texto_legal?: string | null
          sello_institucion_url?: string | null
          tenant_id?: string
          trama_escala?: number | null
          trama_imagen_url?: string | null
          trama_opacidad?: number | null
          trama_rotacion?: number | null
          trama_tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "config_credenciales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      config_cuotas_servicio: {
        Row: {
          limite_total: number | null
          servicio: string
          tenant_id: string
          updated_at: string | null
          usados: number | null
        }
        Insert: {
          limite_total?: number | null
          servicio: string
          tenant_id: string
          updated_at?: string | null
          usados?: number | null
        }
        Update: {
          limite_total?: number | null
          servicio?: string
          tenant_id?: string
          updated_at?: string | null
          usados?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "config_cuotas_servicio_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_sistema: {
        Row: {
          codigo_matricula: string | null
          color_primario: string | null
          color_secundario: string | null
          correo_contacto: string
          direccion: string | null
          favicon_url: string | null
          horarios_atencion: Json
          id: number
          landing_config: Json | null
          logo_dark_url: string | null
          logo_url: string | null
          modo_tema_login: string | null
          niveles_nombres: Json | null
          nombre_completo: string | null
          nombre_corto: string | null
          nombre_ia: string | null
          siglas: string | null
          sitio_web: string | null
          slogan: string | null
          smtp_from_name: string | null
          smtp_host: string | null
          smtp_password: string | null
          smtp_port: number | null
          smtp_user: string | null
          telefono_contacto: string
          tema_fijo_index: number | null
          temas_login: Json | null
          tenant_id: string
          updated_at: string | null
          url_plataforma: string | null
        }
        Insert: {
          codigo_matricula?: string | null
          color_primario?: string | null
          color_secundario?: string | null
          correo_contacto?: string
          direccion?: string | null
          favicon_url?: string | null
          horarios_atencion?: Json
          id?: number
          landing_config?: Json | null
          logo_dark_url?: string | null
          logo_url?: string | null
          modo_tema_login?: string | null
          niveles_nombres?: Json | null
          nombre_completo?: string | null
          nombre_corto?: string | null
          nombre_ia?: string | null
          siglas?: string | null
          sitio_web?: string | null
          slogan?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          telefono_contacto?: string
          tema_fijo_index?: number | null
          temas_login?: Json | null
          tenant_id: string
          updated_at?: string | null
          url_plataforma?: string | null
        }
        Update: {
          codigo_matricula?: string | null
          color_primario?: string | null
          color_secundario?: string | null
          correo_contacto?: string
          direccion?: string | null
          favicon_url?: string | null
          horarios_atencion?: Json
          id?: number
          landing_config?: Json | null
          logo_dark_url?: string | null
          logo_url?: string | null
          modo_tema_login?: string | null
          niveles_nombres?: Json | null
          nombre_completo?: string | null
          nombre_corto?: string | null
          nombre_ia?: string | null
          siglas?: string | null
          sitio_web?: string | null
          slogan?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          telefono_contacto?: string
          tema_fijo_index?: number | null
          temas_login?: Json | null
          tenant_id?: string
          updated_at?: string | null
          url_plataforma?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_sistema_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credenciales_autorizadas: {
        Row: {
          alumno_id: string
          autorizado: boolean | null
          autorizado_por: string | null
          created_at: string | null
          id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          alumno_id: string
          autorizado?: boolean | null
          autorizado_por?: string | null
          created_at?: string | null
          id?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          alumno_id?: string
          autorizado?: boolean | null
          autorizado_por?: string | null
          created_at?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credenciales_autorizadas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credenciales_autorizadas_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: true
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credenciales_autorizadas_autorizado_por_fkey"
            columns: ["autorizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credenciales_autorizadas_autorizado_por_fkey"
            columns: ["autorizado_por"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credenciales_autorizadas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ejercicios: {
        Row: {
          contenido: Json | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          fecha_entrega: string | null
          id: string
          orden: number | null
          publicado: boolean | null
          sync_id: string | null
          tema_id: string | null
          tenant_id: string
          tipo: string | null
          titulo: string
          updated_at: string | null
          visible: boolean | null
        }
        Insert: {
          contenido?: Json | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          fecha_entrega?: string | null
          id?: string
          orden?: number | null
          publicado?: boolean | null
          sync_id?: string | null
          tema_id?: string | null
          tenant_id: string
          tipo?: string | null
          titulo: string
          updated_at?: string | null
          visible?: boolean | null
        }
        Update: {
          contenido?: Json | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          fecha_entrega?: string | null
          id?: string
          orden?: number | null
          publicado?: boolean | null
          sync_id?: string | null
          tema_id?: string | null
          tenant_id?: string
          tipo?: string | null
          titulo?: string
          updated_at?: string | null
          visible?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ejercicios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ejercicios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ejercicios_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ejercicios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      encuesta_opciones: {
        Row: {
          created_at: string
          encuesta_id: string
          id: string
          posicion: number
          tenant_id: string
          texto: string
        }
        Insert: {
          created_at?: string
          encuesta_id: string
          id?: string
          posicion: number
          tenant_id: string
          texto: string
        }
        Update: {
          created_at?: string
          encuesta_id?: string
          id?: string
          posicion?: number
          tenant_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "encuesta_opciones_encuesta_tenant_fkey"
            columns: ["encuesta_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "encuestas"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "encuesta_opciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      encuesta_votos: {
        Row: {
          created_at: string
          encuesta_id: string
          id: string
          opcion_id: string
          tenant_id: string
          updated_at: string
          votante_id: string
        }
        Insert: {
          created_at?: string
          encuesta_id: string
          id?: string
          opcion_id: string
          tenant_id: string
          updated_at?: string
          votante_id: string
        }
        Update: {
          created_at?: string
          encuesta_id?: string
          id?: string
          opcion_id?: string
          tenant_id?: string
          updated_at?: string
          votante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "encuesta_votos_encuesta_tenant_fkey"
            columns: ["encuesta_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "encuestas"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "encuesta_votos_opcion_encuesta_tenant_fkey"
            columns: ["opcion_id", "encuesta_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "encuesta_opciones"
            referencedColumns: ["id", "encuesta_id", "tenant_id"]
          },
          {
            foreignKeyName: "encuesta_votos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encuesta_votos_votante_tenant_fkey"
            columns: ["votante_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      encuestas: {
        Row: {
          activa: boolean
          audiencia: string
          cierra_en: string | null
          creador_id: string
          created_at: string
          descripcion: string | null
          grupo_id: string | null
          id: string
          tenant_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          audiencia: string
          cierra_en?: string | null
          creador_id: string
          created_at?: string
          descripcion?: string | null
          grupo_id?: string | null
          id?: string
          tenant_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          audiencia?: string
          cierra_en?: string | null
          creador_id?: string
          created_at?: string
          descripcion?: string | null
          grupo_id?: string | null
          id?: string
          tenant_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "encuestas_creador_tenant_fkey"
            columns: ["creador_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "encuestas_grupo_tenant_fkey"
            columns: ["grupo_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "encuestas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fechas_evaluacion: {
        Row: {
          created_at: string
          created_by: string | null
          descripcion: string | null
          fecha_evaluacion: string
          grupo_id: string
          id: string
          materia_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          fecha_evaluacion: string
          grupo_id: string
          id?: string
          materia_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          fecha_evaluacion?: string
          grupo_id?: string
          id?: string
          materia_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechas_evaluacion_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechas_evaluacion_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechas_evaluacion_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechas_evaluacion_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechas_evaluacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grados: {
        Row: {
          activo: boolean | null
          carrera_id: string | null
          created_at: string | null
          id: string
          nombre: string
          orden: number | null
          tenant_id: string
        }
        Insert: {
          activo?: boolean | null
          carrera_id?: string | null
          created_at?: string | null
          id?: string
          nombre: string
          orden?: number | null
          tenant_id: string
        }
        Update: {
          activo?: boolean | null
          carrera_id?: string | null
          created_at?: string | null
          id?: string
          nombre?: string
          orden?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grados_carrera_id_fkey"
            columns: ["carrera_id"]
            isOneToOne: false
            referencedRelation: "carreras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grados_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_materias: {
        Row: {
          activo: boolean | null
          created_at: string | null
          grupo_id: string | null
          id: string
          materia_id: string | null
          tenant_id: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          grupo_id?: string | null
          id?: string
          materia_id?: string | null
          tenant_id: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          grupo_id?: string | null
          id?: string
          materia_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupo_materias_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_materias_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_materias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos: {
        Row: {
          activo: boolean | null
          carrera_id: string | null
          created_at: string | null
          grado_id: string | null
          id: string
          nombre: string
          tenant_id: string
          turno: string | null
        }
        Insert: {
          activo?: boolean | null
          carrera_id?: string | null
          created_at?: string | null
          grado_id?: string | null
          id?: string
          nombre: string
          tenant_id: string
          turno?: string | null
        }
        Update: {
          activo?: boolean | null
          carrera_id?: string | null
          created_at?: string | null
          grado_id?: string | null
          id?: string
          nombre?: string
          tenant_id?: string
          turno?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grupos_carrera_id_fkey"
            columns: ["carrera_id"]
            isOneToOne: false
            referencedRelation: "carreras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_grado_id_fkey"
            columns: ["grado_id"]
            isOneToOne: false
            referencedRelation: "grados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inscripciones_alumno: {
        Row: {
          activo: boolean | null
          alumno_id: string | null
          carrera_id: string | null
          created_at: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          grado_id: string | null
          grupo_id: string | null
          id: string
          nivel_id: string | null
          tenant_id: string
        }
        Insert: {
          activo?: boolean | null
          alumno_id?: string | null
          carrera_id?: string | null
          created_at?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          grado_id?: string | null
          grupo_id?: string | null
          id?: string
          nivel_id?: string | null
          tenant_id: string
        }
        Update: {
          activo?: boolean | null
          alumno_id?: string | null
          carrera_id?: string | null
          created_at?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          grado_id?: string | null
          grupo_id?: string | null
          id?: string
          nivel_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inscripciones_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_alumno_carrera_id_fkey"
            columns: ["carrera_id"]
            isOneToOne: false
            referencedRelation: "carreras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_alumno_grado_id_fkey"
            columns: ["grado_id"]
            isOneToOne: false
            referencedRelation: "grados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_alumno_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_alumno_nivel_id_fkey"
            columns: ["nivel_id"]
            isOneToOne: false
            referencedRelation: "niveles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inscripciones_alumno_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_apoyo: {
        Row: {
          archivo_url: string
          carreras_ids: string[] | null
          categoria: string | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          id: string
          nivel_id: string
          publicado: boolean | null
          sync_id: string | null
          tamano_bytes: number | null
          tenant_id: string
          tipo_archivo: string
          titulo: string
        }
        Insert: {
          archivo_url: string
          carreras_ids?: string[] | null
          categoria?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nivel_id: string
          publicado?: boolean | null
          sync_id?: string | null
          tamano_bytes?: number | null
          tenant_id: string
          tipo_archivo: string
          titulo: string
        }
        Update: {
          archivo_url?: string
          carreras_ids?: string[] | null
          categoria?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nivel_id?: string
          publicado?: boolean | null
          sync_id?: string | null
          tamano_bytes?: number | null
          tenant_id?: string
          tipo_archivo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_apoyo_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_apoyo_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_apoyo_nivel_id_fkey"
            columns: ["nivel_id"]
            isOneToOne: false
            referencedRelation: "niveles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_apoyo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      materias: {
        Row: {
          activo: boolean | null
          carrera_id: string | null
          clave: string | null
          created_at: string | null
          descripcion: string | null
          grado_id: string | null
          id: string
          nombre: string
          tenant_id: string
        }
        Insert: {
          activo?: boolean | null
          carrera_id?: string | null
          clave?: string | null
          created_at?: string | null
          descripcion?: string | null
          grado_id?: string | null
          id?: string
          nombre: string
          tenant_id: string
        }
        Update: {
          activo?: boolean | null
          carrera_id?: string | null
          clave?: string | null
          created_at?: string | null
          descripcion?: string | null
          grado_id?: string | null
          id?: string
          nombre?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materias_carrera_id_fkey"
            columns: ["carrera_id"]
            isOneToOne: false
            referencedRelation: "carreras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materias_grado_id_fkey"
            columns: ["grado_id"]
            isOneToOne: false
            referencedRelation: "grados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes_acreditacion: {
        Row: {
          contenido: string
          created_at: string | null
          id: string
          tenant_id: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          contenido: string
          created_at?: string | null
          id?: string
          tenant_id: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          contenido?: string
          created_at?: string | null
          id?: string
          tenant_id?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_acreditacion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes_clases: {
        Row: {
          contenido: string
          created_at: string | null
          destinatario_id: string | null
          grupo_id: string | null
          id: string
          leido: boolean | null
          materia_id: string | null
          remitente_id: string
          tenant_id: string
          tipo_mensaje: string
        }
        Insert: {
          contenido: string
          created_at?: string | null
          destinatario_id?: string | null
          grupo_id?: string | null
          id?: string
          leido?: boolean | null
          materia_id?: string | null
          remitente_id: string
          tenant_id: string
          tipo_mensaje?: string
        }
        Update: {
          contenido?: string
          created_at?: string | null
          destinatario_id?: string | null
          grupo_id?: string | null
          id?: string
          leido?: boolean | null
          materia_id?: string | null
          remitente_id?: string
          tenant_id?: string
          tipo_mensaje?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_clases_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_clases_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_clases_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_clases_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_clases_remitente_id_fkey"
            columns: ["remitente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_clases_remitente_id_fkey"
            columns: ["remitente_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_clases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes_clases_vistos: {
        Row: {
          id: string
          mensaje_id: string
          tenant_id: string
          usuario_id: string
          visto_en: string | null
        }
        Insert: {
          id?: string
          mensaje_id: string
          tenant_id: string
          usuario_id: string
          visto_en?: string | null
        }
        Update: {
          id?: string
          mensaje_id?: string
          tenant_id?: string
          usuario_id?: string
          visto_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_clases_vistos_mensaje_id_fkey"
            columns: ["mensaje_id"]
            isOneToOne: false
            referencedRelation: "mensajes_clases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_clases_vistos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_clases_vistos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_clases_vistos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes_contacto: {
        Row: {
          created_at: string
          email: string
          estatus: string | null
          id: string
          mensaje: string | null
          nombre: string
          notas: string | null
          telefono: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          estatus?: string | null
          id?: string
          mensaje?: string | null
          nombre: string
          notas?: string | null
          telefono: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          estatus?: string | null
          id?: string
          mensaje?: string | null
          nombre?: string
          notas?: string | null
          telefono?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_contacto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes_internos: {
        Row: {
          contenido: string
          created_at: string | null
          destinatario_id: string | null
          destino_id: string | null
          id: string
          leido: boolean | null
          remitente_id: string
          tenant_id: string
          tipo_destino: string
        }
        Insert: {
          contenido: string
          created_at?: string | null
          destinatario_id?: string | null
          destino_id?: string | null
          id?: string
          leido?: boolean | null
          remitente_id: string
          tenant_id: string
          tipo_destino?: string
        }
        Update: {
          contenido?: string
          created_at?: string | null
          destinatario_id?: string | null
          destino_id?: string | null
          id?: string
          leido?: boolean | null
          remitente_id?: string
          tenant_id?: string
          tipo_destino?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_internos_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_internos_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_internos_remitente_id_fkey"
            columns: ["remitente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_internos_remitente_id_fkey"
            columns: ["remitente_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_internos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes_vistos: {
        Row: {
          id: string
          mensaje_id: string
          tenant_id: string
          usuario_id: string
          visto_en: string | null
        }
        Insert: {
          id?: string
          mensaje_id: string
          tenant_id: string
          usuario_id: string
          visto_en?: string | null
        }
        Update: {
          id?: string
          mensaje_id?: string
          tenant_id?: string
          usuario_id?: string
          visto_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_vistos_mensaje_id_fkey"
            columns: ["mensaje_id"]
            isOneToOne: false
            referencedRelation: "mensajes_internos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_vistos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_vistos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_vistos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
        ]
      }
      niveles: {
        Row: {
          activo: boolean | null
          created_at: string | null
          descripcion: string | null
          id: string
          imagen_bienvenida_url: string | null
          imagen_correo_url: string | null
          nombre: string
          tenant_id: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: string
          imagen_bienvenida_url?: string | null
          imagen_correo_url?: string | null
          nombre: string
          tenant_id: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: string
          imagen_bienvenida_url?: string | null
          imagen_correo_url?: string | null
          nombre?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "niveles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones: {
        Row: {
          alumno_id: string
          created_at: string
          cuerpo: string
          id: string
          leida: boolean
          tenant_id: string
          tipo: string
          titulo: string
        }
        Insert: {
          alumno_id: string
          created_at?: string
          cuerpo: string
          id?: string
          leida?: boolean
          tenant_id: string
          tipo?: string
          titulo: string
        }
        Update: {
          alumno_id?: string
          created_at?: string
          cuerpo?: string
          id?: string
          leida?: boolean
          tenant_id?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pago_de_servicios: {
        Row: {
          bloquear_acceso_usuarios: boolean
          duracion_dias: number
          estado: string | null
          fecha_inicio: string | null
          ia_habilitada: boolean
          id: number
          mensaje_bloqueo: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bloquear_acceso_usuarios?: boolean
          duracion_dias?: number
          estado?: string | null
          fecha_inicio?: string | null
          ia_habilitada?: boolean
          id?: number
          mensaje_bloqueo?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bloquear_acceso_usuarios?: boolean
          duracion_dias?: number
          estado?: string | null
          fecha_inicio?: string | null
          ia_habilitada?: boolean
          id?: number
          mensaje_bloqueo?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pago_de_servicios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_alumno: {
        Row: {
          alumno_id: string
          created_at: string
          estatus: string
          fecha_pago: string | null
          id: string
          monto_pagado: number | null
          notas: string | null
          plan_pago_id: string
          recibo: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alumno_id: string
          created_at?: string
          estatus?: string
          fecha_pago?: string | null
          id?: string
          monto_pagado?: number | null
          notas?: string | null
          plan_pago_id: string
          recibo?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alumno_id?: string
          created_at?: string
          estatus?: string
          fecha_pago?: string | null
          id?: string
          monto_pagado?: number | null
          notas?: string | null
          plan_pago_id?: string
          recibo?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_alumno_plan_pago_id_fkey"
            columns: ["plan_pago_id"]
            isOneToOne: false
            referencedRelation: "plan_pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_alumno_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_pagos: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          monto: number | null
          nombre_concepto: string
          orden: number
          programa: string
          tenant_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          monto?: number | null
          nombre_concepto: string
          orden?: number
          programa: string
          tenant_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          monto?: number | null
          nombre_concepto?: string
          orden?: number
          programa?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_pagos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          activo: boolean
          created_at: string
          user_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          user_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_audit: {
        Row: {
          accion: string
          actor_user_id: string | null
          created_at: string
          detalles: Json
          id: string
          tenant_id: string | null
        }
        Insert: {
          accion: string
          actor_user_id?: string | null
          created_at?: string
          detalles?: Json
          id?: string
          tenant_id?: string | null
        }
        Update: {
          accion?: string
          actor_user_id?: string | null
          created_at?: string
          detalles?: Json
          id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profesor_chat_history: {
        Row: {
          created_at: string
          id: string
          messages: Json
          profesor_id: string
          session_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          profesor_id: string
          session_name?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          profesor_id?: string
          session_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profesor_chat_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          apellidos: string
          carrera_id: string | null
          created_at: string | null
          curp: string
          doc_acta_nacimiento: boolean | null
          doc_certificado_estudios: boolean | null
          doc_curp: boolean | null
          doc_ine: boolean | null
          email: string
          estatus: string | null
          fecha_expiracion: string | null
          fecha_inicio: string | null
          fecha_nacimiento: string | null
          foto_perfil: string | null
          genero: string | null
          grupo_id: string | null
          id: string
          matricula: string | null
          nombre: string
          numero_empleado: string | null
          rol: string
          telefono: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          apellidos: string
          carrera_id?: string | null
          created_at?: string | null
          curp: string
          doc_acta_nacimiento?: boolean | null
          doc_certificado_estudios?: boolean | null
          doc_curp?: boolean | null
          doc_ine?: boolean | null
          email: string
          estatus?: string | null
          fecha_expiracion?: string | null
          fecha_inicio?: string | null
          fecha_nacimiento?: string | null
          foto_perfil?: string | null
          genero?: string | null
          grupo_id?: string | null
          id: string
          matricula?: string | null
          nombre: string
          numero_empleado?: string | null
          rol: string
          telefono?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          apellidos?: string
          carrera_id?: string | null
          created_at?: string | null
          curp?: string
          doc_acta_nacimiento?: boolean | null
          doc_certificado_estudios?: boolean | null
          doc_curp?: boolean | null
          doc_ine?: boolean | null
          email?: string
          estatus?: string | null
          fecha_expiracion?: string | null
          fecha_inicio?: string | null
          fecha_nacimiento?: string | null
          foto_perfil?: string | null
          genero?: string | null
          grupo_id?: string | null
          id?: string
          matricula?: string | null
          nombre?: string
          numero_empleado?: string | null
          rol?: string
          telefono?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_carrera_id_fkey"
            columns: ["carrera_id"]
            isOneToOne: false
            referencedRelation: "carreras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recursos: {
        Row: {
          archivo_url: string | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          enlace_url: string | null
          fecha_expiracion: string | null
          fecha_publicacion: string | null
          id: string
          publicado: boolean | null
          tema_id: string | null
          tenant_id: string
          tipo: string | null
          titulo: string
          visible: boolean | null
        }
        Insert: {
          archivo_url?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          enlace_url?: string | null
          fecha_expiracion?: string | null
          fecha_publicacion?: string | null
          id?: string
          publicado?: boolean | null
          tema_id?: string | null
          tenant_id: string
          tipo?: string | null
          titulo: string
          visible?: boolean | null
        }
        Update: {
          archivo_url?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          enlace_url?: string | null
          fecha_expiracion?: string | null
          fecha_publicacion?: string | null
          id?: string
          publicado?: boolean | null
          tema_id?: string | null
          tenant_id?: string
          tipo?: string | null
          titulo?: string
          visible?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "recursos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recursos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recursos_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recursos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          archivo_url: string | null
          created_at: string | null
          created_by: string | null
          file_path: string | null
          id: string
          sync_id: string | null
          tema_id: string | null
          tenant_id: string
          tipo: string | null
          titulo: string | null
        }
        Insert: {
          archivo_url?: string | null
          created_at?: string | null
          created_by?: string | null
          file_path?: string | null
          id?: string
          sync_id?: string | null
          tema_id?: string | null
          tenant_id: string
          tipo?: string | null
          titulo?: string | null
        }
        Update: {
          archivo_url?: string | null
          created_at?: string | null
          created_by?: string | null
          file_path?: string | null
          id?: string
          sync_id?: string | null
          tema_id?: string | null
          tenant_id?: string
          tipo?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      resultados_ejercicios: {
        Row: {
          aciertos: number | null
          alumno_id: string
          archivo_nombre: string | null
          archivo_path: string | null
          archivo_url: string | null
          bloqueado: boolean | null
          caduca_el: string | null
          calificacion: number | null
          calificacion_manual: number | null
          ejercicio_id: string
          estado: string | null
          fecha_completado: string | null
          historico_intentos: Json | null
          id: string
          intentos: number | null
          primer_envio_en: string | null
          suma_calificaciones: number | null
          tenant_id: string
          total_preguntas: number | null
        }
        Insert: {
          aciertos?: number | null
          alumno_id: string
          archivo_nombre?: string | null
          archivo_path?: string | null
          archivo_url?: string | null
          bloqueado?: boolean | null
          caduca_el?: string | null
          calificacion?: number | null
          calificacion_manual?: number | null
          ejercicio_id: string
          estado?: string | null
          fecha_completado?: string | null
          historico_intentos?: Json | null
          id?: string
          intentos?: number | null
          primer_envio_en?: string | null
          suma_calificaciones?: number | null
          tenant_id: string
          total_preguntas?: number | null
        }
        Update: {
          aciertos?: number | null
          alumno_id?: string
          archivo_nombre?: string | null
          archivo_path?: string | null
          archivo_url?: string | null
          bloqueado?: boolean | null
          caduca_el?: string | null
          calificacion?: number | null
          calificacion_manual?: number | null
          ejercicio_id?: string
          estado?: string | null
          fecha_completado?: string | null
          historico_intentos?: Json | null
          id?: string
          intentos?: number | null
          primer_envio_en?: string | null
          suma_calificaciones?: number | null
          tenant_id?: string
          total_preguntas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "resultados_ejercicios_ejercicio_id_fkey"
            columns: ["ejercicio_id"]
            isOneToOne: false
            referencedRelation: "ejercicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resultados_ejercicios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      slides: {
        Row: {
          contenido: string | null
          created_at: string | null
          created_by: string | null
          estilo: string | null
          id: string
          imagen_url: string | null
          orden: number | null
          sync_id: string | null
          tema_id: string | null
          tenant_id: string
          titulo: string | null
        }
        Insert: {
          contenido?: string | null
          created_at?: string | null
          created_by?: string | null
          estilo?: string | null
          id?: string
          imagen_url?: string | null
          orden?: number | null
          sync_id?: string | null
          tema_id?: string | null
          tenant_id: string
          titulo?: string | null
        }
        Update: {
          contenido?: string | null
          created_at?: string | null
          created_by?: string | null
          estilo?: string | null
          id?: string
          imagen_url?: string | null
          orden?: number | null
          sync_id?: string | null
          tema_id?: string | null
          tenant_id?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slides_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      temas: {
        Row: {
          contenido: string | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          id: string
          orden: number | null
          publicado: boolean | null
          sync_id: string | null
          tenant_id: string
          titulo: string
          unidad_id: string | null
          updated_at: string | null
          updated_by: string | null
          videos: Json | null
          visible: boolean | null
        }
        Insert: {
          contenido?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          orden?: number | null
          publicado?: boolean | null
          sync_id?: string | null
          tenant_id: string
          titulo: string
          unidad_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          videos?: Json | null
          visible?: boolean | null
        }
        Update: {
          contenido?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          orden?: number | null
          publicado?: boolean | null
          sync_id?: string | null
          tenant_id?: string
          titulo?: string
          unidad_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          videos?: Json | null
          visible?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "temas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          es_principal: boolean
          estado: string
          hostname: string
          id: string
          tenant_id: string
          updated_at: string
          verificado_at: string | null
        }
        Insert: {
          created_at?: string
          es_principal?: boolean
          estado?: string
          hostname: string
          id?: string
          tenant_id: string
          updated_at?: string
          verificado_at?: string | null
        }
        Update: {
          created_at?: string
          es_principal?: boolean
          estado?: string
          hostname?: string
          id?: string
          tenant_id?: string
          updated_at?: string
          verificado_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_provisioning: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          estado: string
          id: string
          idempotency_key: string
          initial_superuser_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          estado?: string
          id?: string
          idempotency_key?: string
          initial_superuser_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          estado?: string
          id?: string
          idempotency_key?: string
          initial_superuser_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_provisioning_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_smtp_settings: {
        Row: {
          activo: boolean
          smtp_from_name: string | null
          smtp_host: string
          smtp_password_secret_id: string | null
          smtp_port: number
          smtp_user: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activo?: boolean
          smtp_from_name?: string | null
          smtp_host?: string
          smtp_password_secret_id?: string | null
          smtp_port?: number
          smtp_user?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activo?: boolean
          smtp_from_name?: string | null
          smtp_host?: string
          smtp_password_secret_id?: string | null
          smtp_port?: number
          smtp_user?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_smtp_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          estado: string
          id: string
          initial_superuser_id: string | null
          nombre: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estado?: string
          id?: string
          initial_superuser_id?: string | null
          nombre: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estado?: string
          id?: string
          initial_superuser_id?: string | null
          nombre?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      unidades: {
        Row: {
          activo: boolean | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          id: string
          materia_id: string | null
          orden: number | null
          sync_id: string | null
          tenant_id: string
          titulo: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          materia_id?: string | null
          orden?: number | null
          sync_id?: string | null
          tenant_id: string
          titulo: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          materia_id?: string | null
          orden?: number | null
          sync_id?: string | null
          tenant_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      video_progreso_alumno: {
        Row: {
          alumno_id: string
          completado: boolean | null
          created_at: string | null
          duracion_total: number | null
          id: string
          progreso_segundos: number | null
          tema_id: string
          tenant_id: string
          ultimo_visto: string | null
          updated_at: string | null
          video_url: string
        }
        Insert: {
          alumno_id: string
          completado?: boolean | null
          created_at?: string | null
          duracion_total?: number | null
          id?: string
          progreso_segundos?: number | null
          tema_id: string
          tenant_id: string
          ultimo_visto?: string | null
          updated_at?: string | null
          video_url: string
        }
        Update: {
          alumno_id?: string
          completado?: boolean | null
          created_at?: string | null
          duracion_total?: number | null
          id?: string
          progreso_segundos?: number | null
          tema_id?: string
          tenant_id?: string
          ultimo_visto?: string | null
          updated_at?: string | null
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_progreso_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_progreso_alumno_alumno_id_fkey"
            columns: ["alumno_id"]
            isOneToOne: false
            referencedRelation: "vista_alumnos_inscritos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_progreso_alumno_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_progreso_alumno_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ai_category_summary: {
        Row: {
          categoria: string | null
          conteo: number | null
          user_type: string | null
        }
        Relationships: []
      }
      vista_alumnos_inscritos: {
        Row: {
          apellidos: string | null
          carrera: string | null
          curp: string | null
          email: string | null
          fecha_expiracion: string | null
          grado: string | null
          grupo: string | null
          id: string | null
          matricula: string | null
          nivel: string | null
          nombre: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      actualizar_encuesta: {
        Args: {
          p_activa: boolean
          p_audiencia: string
          p_cierra_en: string
          p_descripcion: string
          p_encuesta_id: string
          p_grupo_id: string
          p_opciones: string[]
          p_titulo: string
        }
        Returns: boolean
      }
      consumir_cuota_servicio: {
        Args: { p_servicio: string }
        Returns: {
          cuota_excedida: boolean
          limite: number
          usados_nuevo: number
        }[]
      }
      crear_encuesta: {
        Args: {
          p_audiencia: string
          p_cierra_en?: string
          p_descripcion: string
          p_grupo_id: string
          p_opciones: string[]
          p_titulo: string
        }
        Returns: string
      }
      eliminar_encuesta: { Args: { p_encuesta_id: string }; Returns: boolean }
      generar_folio_recibo: { Args: { prefijo: string }; Returns: string }
      get_active_storage_urls: {
        Args: { bucket_name: string }
        Returns: {
          matched_content: string
        }[]
      }
      get_auth_role: { Args: never; Returns: string }
      get_tenant_smtp_for_service: {
        Args: { p_tenant_id: string }
        Returns: {
          activo: boolean
          smtp_from_name: string
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_user: string
        }[]
      }
      is_admin_or_super: { Args: never; Returns: boolean }
      replace_tenant_domain_for_service: {
        Args: { p_domain_id: string; p_hostname: string; p_tenant_id: string }
        Returns: string
      }
      seed_pagos_alumnos_activos: { Args: never; Returns: string }
      set_primary_tenant_domain_for_service: {
        Args: { p_domain_id: string; p_tenant_id: string }
        Returns: string
      }
      set_tenant_smtp_for_service: {
        Args: {
          p_smtp_from_name: string
          p_smtp_host: string
          p_smtp_password: string
          p_smtp_port: number
          p_smtp_user: string
          p_tenant_id: string
          p_updated_by: string
        }
        Returns: undefined
      }
      update_profile: {
        Args: {
          p_apellidos: string
          p_curp: string
          p_matricula: string
          p_nombre: string
          p_numero_empleado: string
          p_telefono: string
          p_user_id: string
        }
        Returns: boolean
      }
      votar_encuesta: {
        Args: { p_encuesta_id: string; p_opcion_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
