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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auditoria_log: {
        Row: {
          accion: string
          actor: string | null
          antes: Json | null
          despues: Json | null
          entidad: string
          entidad_id: string | null
          id: string
          ts: string
        }
        Insert: {
          accion: string
          actor?: string | null
          antes?: Json | null
          despues?: Json | null
          entidad: string
          entidad_id?: string | null
          id?: string
          ts?: string
        }
        Update: {
          accion?: string
          actor?: string | null
          antes?: Json | null
          despues?: Json | null
          entidad?: string
          entidad_id?: string | null
          id?: string
          ts?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          capacidad: string | null
          color_acento: string | null
          contacto: string | null
          contrato_om: boolean
          created_at: string
          cuota_correctivos: number
          cuota_limpiezas: number
          cuota_mayores: number
          cuota_medios: number
          cuota_menores: number
          cuota_preventivos: number
          email: string | null
          estado: Database["public"]["Enums"]["cliente_estado"]
          id: string
          nombre: string
          rut: string | null
          solo_capacitacion: boolean
          telefono: string | null
          updated_at: string
        }
        Insert: {
          capacidad?: string | null
          color_acento?: string | null
          contacto?: string | null
          contrato_om?: boolean
          created_at?: string
          cuota_correctivos?: number
          cuota_limpiezas?: number
          cuota_mayores?: number
          cuota_medios?: number
          cuota_menores?: number
          cuota_preventivos?: number
          email?: string | null
          estado?: Database["public"]["Enums"]["cliente_estado"]
          id?: string
          nombre: string
          rut?: string | null
          solo_capacitacion?: boolean
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          capacidad?: string | null
          color_acento?: string | null
          contacto?: string | null
          contrato_om?: boolean
          created_at?: string
          cuota_correctivos?: number
          cuota_limpiezas?: number
          cuota_mayores?: number
          cuota_medios?: number
          cuota_menores?: number
          cuota_preventivos?: number
          email?: string | null
          estado?: Database["public"]["Enums"]["cliente_estado"]
          id?: string
          nombre?: string
          rut?: string | null
          solo_capacitacion?: boolean
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contratos_servicio: {
        Row: {
          activo: boolean
          anio: number
          cantidad_anual: number
          created_at: string
          duracion_dias_default: number
          fecha_inicio: string
          id: string
          planta_id: string
          servicio: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          anio?: number
          cantidad_anual: number
          created_at?: string
          duracion_dias_default?: number
          fecha_inicio?: string
          id?: string
          planta_id: string
          servicio: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          anio?: number
          cantidad_anual?: number
          created_at?: string
          duracion_dias_default?: number
          fecha_inicio?: string
          id?: string
          planta_id?: string
          servicio?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratos_servicio_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
        ]
      }
      equipos: {
        Row: {
          codigo: string
          created_at: string
          estado: Database["public"]["Enums"]["equipo_estado"]
          id: string
          nombre: string
          planta_id: string | null
          salud: number | null
          tipo: string
          ubicacion: string | null
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          estado?: Database["public"]["Enums"]["equipo_estado"]
          id?: string
          nombre: string
          planta_id?: string | null
          salud?: number | null
          tipo: string
          ubicacion?: string | null
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["equipo_estado"]
          id?: string
          nombre?: string
          planta_id?: string | null
          salud?: number | null
          tipo?: string
          ubicacion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipos_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados: {
        Row: {
          activo: boolean
          anio: number
          created_at: string
          fecha: string
          id: string
          nombre: string
          tipo: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activo?: boolean
          anio: number
          created_at?: string
          fecha: string
          id?: string
          nombre: string
          tipo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activo?: boolean
          anio?: number
          created_at?: string
          fecha?: string
          id?: string
          nombre?: string
          tipo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      inventario_items: {
        Row: {
          categoria: Database["public"]["Enums"]["inventario_categoria"]
          costo_promedio: number
          created_at: string
          id: string
          nombre: string
          sku: string
          stock_actual: number
          stock_minimo: number
          ubicacion: string | null
          unidad: string
          updated_at: string
        }
        Insert: {
          categoria: Database["public"]["Enums"]["inventario_categoria"]
          costo_promedio?: number
          created_at?: string
          id?: string
          nombre: string
          sku: string
          stock_actual?: number
          stock_minimo?: number
          ubicacion?: string | null
          unidad?: string
          updated_at?: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["inventario_categoria"]
          costo_promedio?: number
          created_at?: string
          id?: string
          nombre?: string
          sku?: string
          stock_actual?: number
          stock_minimo?: number
          ubicacion?: string | null
          unidad?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventario_movimientos: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          item_id: string
          motivo: string | null
          realizado_por: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
          trabajo_id: string | null
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          item_id: string
          motivo?: string | null
          realizado_por?: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
          trabajo_id?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          item_id?: string
          motivo?: string | null
          realizado_por?: string | null
          tipo?: Database["public"]["Enums"]["movimiento_tipo"]
          trabajo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_movimientos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventario_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_movimientos_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_movimientos_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      jornadas_laborales: {
        Row: {
          almuerzo_excedido: boolean
          almuerzo_fin: string | null
          almuerzo_inicio: string | null
          created_at: string
          fecha: string
          hora_fin: string | null
          hora_inicio: string
          id: string
          notas: string | null
          tecnico_id: string
          updated_at: string
        }
        Insert: {
          almuerzo_excedido?: boolean
          almuerzo_fin?: string | null
          almuerzo_inicio?: string | null
          created_at?: string
          fecha?: string
          hora_fin?: string | null
          hora_inicio?: string
          id?: string
          notas?: string | null
          tecnico_id: string
          updated_at?: string
        }
        Update: {
          almuerzo_excedido?: boolean
          almuerzo_fin?: string | null
          almuerzo_inicio?: string | null
          created_at?: string
          fecha?: string
          hora_fin?: string | null
          hora_inicio?: string
          id?: string
          notas?: string | null
          tecnico_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      mantenimientos: {
        Row: {
          created_at: string
          equipo_id: string
          estado: Database["public"]["Enums"]["mantenimiento_estado"]
          fecha: string
          fecha_fin: string | null
          fecha_inicio: string | null
          horas: number
          id: string
          notas: string | null
          tecnico_id: string | null
          tipo: Database["public"]["Enums"]["mantenimiento_tipo"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          equipo_id: string
          estado?: Database["public"]["Enums"]["mantenimiento_estado"]
          fecha: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          horas?: number
          id?: string
          notas?: string | null
          tecnico_id?: string | null
          tipo: Database["public"]["Enums"]["mantenimiento_tipo"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          equipo_id?: string
          estado?: Database["public"]["Enums"]["mantenimiento_estado"]
          fecha?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          horas?: number
          id?: string
          notas?: string | null
          tecnico_id?: string | null
          tipo?: Database["public"]["Enums"]["mantenimiento_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mantenimientos_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones_log: {
        Row: {
          asunto: string
          cliente_id: string | null
          destinatario: string
          enviado_at: string
          enviado_por: string | null
          error_mensaje: string | null
          estado: string
          gmail_message_id: string | null
          id: string
          planta_id: string | null
          reporte_id: string | null
          tipo: string
          trabajo_id: string | null
        }
        Insert: {
          asunto: string
          cliente_id?: string | null
          destinatario: string
          enviado_at?: string
          enviado_por?: string | null
          error_mensaje?: string | null
          estado: string
          gmail_message_id?: string | null
          id?: string
          planta_id?: string | null
          reporte_id?: string | null
          tipo: string
          trabajo_id?: string | null
        }
        Update: {
          asunto?: string
          cliente_id?: string | null
          destinatario?: string
          enviado_at?: string
          enviado_por?: string | null
          error_mensaje?: string | null
          estado?: string
          gmail_message_id?: string | null
          id?: string
          planta_id?: string | null
          reporte_id?: string | null
          tipo?: string
          trabajo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_log_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_log_reporte_id_fkey"
            columns: ["reporte_id"]
            isOneToOne: false
            referencedRelation: "reportes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_log_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_log_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones_usuario: {
        Row: {
          created_at: string
          id: string
          leida_at: string | null
          mensaje: string
          tipo: string
          titulo: string
          trabajo_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          leida_at?: string | null
          mensaje: string
          tipo: string
          titulo: string
          trabajo_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          leida_at?: string | null
          mensaje?: string
          tipo?: string
          titulo?: string
          trabajo_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_usuario_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_usuario_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_compra_estados_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          estado_anterior: Database["public"]["Enums"]["oc_estado"] | null
          estado_nuevo: Database["public"]["Enums"]["oc_estado"]
          id: string
          notas: string | null
          orden_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          estado_anterior?: Database["public"]["Enums"]["oc_estado"] | null
          estado_nuevo: Database["public"]["Enums"]["oc_estado"]
          id?: string
          notas?: string | null
          orden_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          estado_anterior?: Database["public"]["Enums"]["oc_estado"] | null
          estado_nuevo?: Database["public"]["Enums"]["oc_estado"]
          id?: string
          notas?: string | null
          orden_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orden_compra_estados_log_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_compra_items: {
        Row: {
          cantidad_pedida: number
          cantidad_recibida: number
          categoria: string | null
          created_at: string
          id: string
          item_id: string | null
          nombre: string
          orden_id: string
          precio_unitario: number | null
          proveedor: string | null
          sku_texto: string | null
          unidad: string
        }
        Insert: {
          cantidad_pedida: number
          cantidad_recibida?: number
          categoria?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          nombre: string
          orden_id: string
          precio_unitario?: number | null
          proveedor?: string | null
          sku_texto?: string | null
          unidad?: string
        }
        Update: {
          cantidad_pedida?: number
          cantidad_recibida?: number
          categoria?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          nombre?: string
          orden_id?: string
          precio_unitario?: number | null
          proveedor?: string | null
          sku_texto?: string | null
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "orden_compra_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventario_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_compra_items_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_compra_recepcion_items: {
        Row: {
          cantidad: number
          costo_unitario: number
          created_at: string
          id: string
          impuesto_pct: number
          item_id: string | null
          moneda: string
          orden_item_id: string
          precio_esperado: number | null
          recepcion_id: string
          variacion_motivo: string | null
        }
        Insert: {
          cantidad: number
          costo_unitario?: number
          created_at?: string
          id?: string
          impuesto_pct?: number
          item_id?: string | null
          moneda?: string
          orden_item_id: string
          precio_esperado?: number | null
          recepcion_id: string
          variacion_motivo?: string | null
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          created_at?: string
          id?: string
          impuesto_pct?: number
          item_id?: string | null
          moneda?: string
          orden_item_id?: string
          precio_esperado?: number | null
          recepcion_id?: string
          variacion_motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orden_compra_recepcion_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventario_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_compra_recepcion_items_orden_item_id_fkey"
            columns: ["orden_item_id"]
            isOneToOne: false
            referencedRelation: "orden_compra_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_compra_recepcion_items_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "orden_compra_recepciones"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_compra_recepciones: {
        Row: {
          id: string
          notas: string | null
          orden_id: string
          recibido_at: string
          recibido_por: string | null
          recibido_por_nombre: string | null
        }
        Insert: {
          id?: string
          notas?: string | null
          orden_id: string
          recibido_at?: string
          recibido_por?: string | null
          recibido_por_nombre?: string | null
        }
        Update: {
          id?: string
          notas?: string | null
          orden_id?: string
          recibido_at?: string
          recibido_por?: string | null
          recibido_por_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orden_compra_recepciones_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_compra_variaciones: {
        Row: {
          created_at: string
          id: string
          motivo: string | null
          orden_id: string
          recepcion_item_id: string
          registrado_por: string | null
          tipo: string
          valor_esperado: string | null
          valor_recibido: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          motivo?: string | null
          orden_id: string
          recepcion_item_id: string
          registrado_por?: string | null
          tipo: string
          valor_esperado?: string | null
          valor_recibido?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          motivo?: string | null
          orden_id?: string
          recepcion_item_id?: string
          registrado_por?: string | null
          tipo?: string
          valor_esperado?: string | null
          valor_recibido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orden_compra_variaciones_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_compra_variaciones_recepcion_item_id_fkey"
            columns: ["recepcion_item_id"]
            isOneToOne: false
            referencedRelation: "orden_compra_recepcion_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_compra: {
        Row: {
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["oc_estado"]
          fecha_cancelada: string | null
          fecha_emision: string
          fecha_enviada: string | null
          fecha_recibida: string | null
          folio: string
          id: string
          impuesto_pct: number
          moneda: string
          notas: string | null
          proveedores: Json
          solicitante: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["oc_estado"]
          fecha_cancelada?: string | null
          fecha_emision?: string
          fecha_enviada?: string | null
          fecha_recibida?: string | null
          folio: string
          id?: string
          impuesto_pct?: number
          moneda?: string
          notas?: string | null
          proveedores?: Json
          solicitante?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["oc_estado"]
          fecha_cancelada?: string | null
          fecha_emision?: string
          fecha_enviada?: string | null
          fecha_recibida?: string | null
          folio?: string
          id?: string
          impuesto_pct?: number
          moneda?: string
          notas?: string | null
          proveedores?: Json
          solicitante?: string
          updated_at?: string
        }
        Relationships: []
      }
      password_reset_solicitudes: {
        Row: {
          atendida_at: string | null
          atendida_por: string | null
          created_at: string
          email: string
          estado: string
          expira_at: string
          id: string
          ip: string | null
          mensaje: string | null
          notas_admin: string | null
          reenviado_at: string | null
          reenvios: number
        }
        Insert: {
          atendida_at?: string | null
          atendida_por?: string | null
          created_at?: string
          email: string
          estado?: string
          expira_at?: string
          id?: string
          ip?: string | null
          mensaje?: string | null
          notas_admin?: string | null
          reenviado_at?: string | null
          reenvios?: number
        }
        Update: {
          atendida_at?: string | null
          atendida_por?: string | null
          created_at?: string
          email?: string
          estado?: string
          expira_at?: string
          id?: string
          ip?: string | null
          mensaje?: string | null
          notas_admin?: string | null
          reenviado_at?: string | null
          reenvios?: number
        }
        Relationships: []
      }
      planta_zonas: {
        Row: {
          activo: boolean
          color: string
          created_at: string
          created_by: string | null
          id: string
          nombre: string
          orden: number
          paneles_estimados: number
          planta_id: string
          poligono: Json
          updated_at: string
        }
        Insert: {
          activo?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nombre: string
          orden?: number
          paneles_estimados?: number
          planta_id: string
          poligono: Json
          updated_at?: string
        }
        Update: {
          activo?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nombre?: string
          orden?: number
          paneles_estimados?: number
          planta_id?: string
          poligono?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planta_zonas_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
        ]
      }
      plantas: {
        Row: {
          capacidad: string | null
          cliente_id: string
          created_at: string
          eficiencia: number | null
          email_notificaciones: string | null
          id: string
          latitud: number | null
          longitud: number | null
          nombre: string
          notificaciones_completado: boolean
          paneles: number
          sla_horas_resolucion: number | null
          sla_horas_respuesta: number | null
          ubicacion: string | null
          ultima_limpieza: string | null
          updated_at: string
        }
        Insert: {
          capacidad?: string | null
          cliente_id: string
          created_at?: string
          eficiencia?: number | null
          email_notificaciones?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          nombre: string
          notificaciones_completado?: boolean
          paneles?: number
          sla_horas_resolucion?: number | null
          sla_horas_respuesta?: number | null
          ubicacion?: string | null
          ultima_limpieza?: string | null
          updated_at?: string
        }
        Update: {
          capacidad?: string | null
          cliente_id?: string
          created_at?: string
          eficiencia?: number | null
          email_notificaciones?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          nombre?: string
          notificaciones_completado?: boolean
          paneles?: number
          sla_horas_resolucion?: number | null
          sla_horas_respuesta?: number | null
          ubicacion?: string | null
          ultima_limpieza?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plantas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          apellidos: string | null
          cargo: string | null
          cliente_id: string | null
          created_at: string
          debe_cambiar_password: boolean
          display_name: string | null
          id: string
          nombres: string | null
          perfil_completado: boolean
          reportes_periodo_pref: Json | null
          theme_preference: string
          updated_at: string
        }
        Insert: {
          apellidos?: string | null
          cargo?: string | null
          cliente_id?: string | null
          created_at?: string
          debe_cambiar_password?: boolean
          display_name?: string | null
          id: string
          nombres?: string | null
          perfil_completado?: boolean
          reportes_periodo_pref?: Json | null
          theme_preference?: string
          updated_at?: string
        }
        Update: {
          apellidos?: string | null
          cargo?: string | null
          cliente_id?: string | null
          created_at?: string
          debe_cambiar_password?: boolean
          display_name?: string | null
          id?: string
          nombres?: string | null
          perfil_completado?: boolean
          reportes_periodo_pref?: Json | null
          theme_preference?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cliente_fk"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      reporte_auditoria: {
        Row: {
          accion: string
          actor: string | null
          comentario: string | null
          created_at: string
          estado_anterior: string | null
          estado_nuevo: string | null
          id: string
          reporte_id: string
          snapshot: Json | null
          version: number | null
        }
        Insert: {
          accion: string
          actor?: string | null
          comentario?: string | null
          created_at?: string
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          reporte_id: string
          snapshot?: Json | null
          version?: number | null
        }
        Update: {
          accion?: string
          actor?: string | null
          comentario?: string | null
          created_at?: string
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: string
          reporte_id?: string
          snapshot?: Json | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reporte_auditoria_reporte_id_fkey"
            columns: ["reporte_id"]
            isOneToOne: false
            referencedRelation: "reportes"
            referencedColumns: ["id"]
          },
        ]
      }
      reporte_diario_zonas: {
        Row: {
          created_at: string
          estado: string
          id: string
          reporte_diario_id: string
          trabajo_id: string
          updated_at: string
          zona_id: string
        }
        Insert: {
          created_at?: string
          estado?: string
          id?: string
          reporte_diario_id: string
          trabajo_id: string
          updated_at?: string
          zona_id: string
        }
        Update: {
          created_at?: string
          estado?: string
          id?: string
          reporte_diario_id?: string
          trabajo_id?: string
          updated_at?: string
          zona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporte_diario_zonas_reporte_diario_id_fkey"
            columns: ["reporte_diario_id"]
            isOneToOne: false
            referencedRelation: "trabajo_reportes_diarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporte_diario_zonas_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporte_diario_zonas_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporte_diario_zonas_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "planta_zonas"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes: {
        Row: {
          aprobado_at: string | null
          aprobado_por: string | null
          cliente_id: string
          contenido_markdown: string
          created_at: string
          desde: string | null
          enviado_a: string | null
          enviado_at: string | null
          enviado_por: string | null
          estado: Database["public"]["Enums"]["reporte_estado"]
          generado_por: string | null
          hasta: string | null
          id: string
          insight_resumen: string | null
          model_used: string | null
          motivo_rechazo: string | null
          periodo: string
          planta_id: string | null
          rechazado_at: string | null
          rechazado_por: string | null
          reporte_padre_id: string | null
          titulo: string
          updated_at: string
          version: number
        }
        Insert: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          cliente_id: string
          contenido_markdown: string
          created_at?: string
          desde?: string | null
          enviado_a?: string | null
          enviado_at?: string | null
          enviado_por?: string | null
          estado?: Database["public"]["Enums"]["reporte_estado"]
          generado_por?: string | null
          hasta?: string | null
          id?: string
          insight_resumen?: string | null
          model_used?: string | null
          motivo_rechazo?: string | null
          periodo: string
          planta_id?: string | null
          rechazado_at?: string | null
          rechazado_por?: string | null
          reporte_padre_id?: string | null
          titulo: string
          updated_at?: string
          version?: number
        }
        Update: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          cliente_id?: string
          contenido_markdown?: string
          created_at?: string
          desde?: string | null
          enviado_a?: string | null
          enviado_at?: string | null
          enviado_por?: string | null
          estado?: Database["public"]["Enums"]["reporte_estado"]
          generado_por?: string | null
          hasta?: string | null
          id?: string
          insight_resumen?: string | null
          model_used?: string | null
          motivo_rechazo?: string | null
          periodo?: string
          planta_id?: string | null
          rechazado_at?: string | null
          rechazado_por?: string | null
          reporte_padre_id?: string | null
          titulo?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reportes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_reporte_padre_id_fkey"
            columns: ["reporte_padre_id"]
            isOneToOne: false
            referencedRelation: "reportes"
            referencedColumns: ["id"]
          },
        ]
      }
      role_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          performed_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          performed_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          performed_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          target_user_id?: string
        }
        Relationships: []
      }
      solicitudes_visita: {
        Row: {
          cliente_id: string
          created_at: string
          descripcion: string | null
          duracion_dias_estimada: number
          estado: string
          fecha_preferida: string
          id: string
          planta_id: string
          respuesta_supervisor: string | null
          solicitado_por: string
          tipo: string
          trabajo_id: string | null
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descripcion?: string | null
          duracion_dias_estimada?: number
          estado?: string
          fecha_preferida: string
          id?: string
          planta_id: string
          respuesta_supervisor?: string | null
          solicitado_por: string
          tipo: string
          trabajo_id?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descripcion?: string | null
          duracion_dias_estimada?: number
          estado?: string
          fecha_preferida?: string
          id?: string
          planta_id?: string
          respuesta_supervisor?: string | null
          solicitado_por?: string
          tipo?: string
          trabajo_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_visita_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_visita_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_visita_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_visita_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      trabajo_aprobaciones: {
        Row: {
          creado_por: string | null
          created_at: string
          expira_at: string
          firma_storage_path: string | null
          firmado_at: string | null
          firmante_nombre: string | null
          firmante_rut: string | null
          id: string
          ip: string | null
          token: string
          trabajo_id: string
          user_agent: string | null
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          expira_at?: string
          firma_storage_path?: string | null
          firmado_at?: string | null
          firmante_nombre?: string | null
          firmante_rut?: string | null
          id?: string
          ip?: string | null
          token: string
          trabajo_id: string
          user_agent?: string | null
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          expira_at?: string
          firma_storage_path?: string | null
          firmado_at?: string | null
          firmante_nombre?: string | null
          firmante_rut?: string | null
          id?: string
          ip?: string | null
          token?: string
          trabajo_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_aprobaciones_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_aprobaciones_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajo_asignaciones_log: {
        Row: {
          asignado_por: string | null
          created_at: string
          id: string
          motivo: string | null
          tecnico_anterior: string | null
          tecnico_nuevo: string | null
          trabajo_id: string
        }
        Insert: {
          asignado_por?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          tecnico_anterior?: string | null
          tecnico_nuevo?: string | null
          trabajo_id: string
        }
        Update: {
          asignado_por?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          tecnico_anterior?: string | null
          tecnico_nuevo?: string | null
          trabajo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_asignaciones_log_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_asignaciones_log_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajo_dia_excepciones: {
        Row: {
          created_at: string
          fecha_movida: string
          fecha_original: string
          id: string
          trabajo_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fecha_movida: string
          fecha_original: string
          id?: string
          trabajo_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fecha_movida?: string
          fecha_original?: string
          id?: string
          trabajo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_dia_excepciones_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_dia_excepciones_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajo_equipos: {
        Row: {
          created_at: string
          equipo_id: string
          id: string
          trabajo_id: string
        }
        Insert: {
          created_at?: string
          equipo_id: string
          id?: string
          trabajo_id: string
        }
        Update: {
          created_at?: string
          equipo_id?: string
          id?: string
          trabajo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_equipos_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_equipos_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_equipos_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajo_evidencias: {
        Row: {
          categoria: string
          created_at: string
          descripcion: string | null
          fecha: string | null
          id: string
          reporte_diario_id: string | null
          storage_path: string
          subido_por: string | null
          trabajo_id: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          descripcion?: string | null
          fecha?: string | null
          id?: string
          reporte_diario_id?: string | null
          storage_path: string
          subido_por?: string | null
          trabajo_id: string
        }
        Update: {
          categoria?: string
          created_at?: string
          descripcion?: string | null
          fecha?: string | null
          id?: string
          reporte_diario_id?: string | null
          storage_path?: string
          subido_por?: string | null
          trabajo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_evidencias_reporte_diario_id_fkey"
            columns: ["reporte_diario_id"]
            isOneToOne: false
            referencedRelation: "trabajo_reportes_diarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_evidencias_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_evidencias_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajo_recursos: {
        Row: {
          cantidad: number
          categoria: string
          created_at: string
          descripcion: string
          devuelto: boolean
          entregado: boolean
          equipo_id: string | null
          id: string
          item_id: string | null
          notas: string | null
          trabajo_id: string
          unidad: string | null
          updated_at: string
        }
        Insert: {
          cantidad?: number
          categoria: string
          created_at?: string
          descripcion: string
          devuelto?: boolean
          entregado?: boolean
          equipo_id?: string | null
          id?: string
          item_id?: string | null
          notas?: string | null
          trabajo_id: string
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          cantidad?: number
          categoria?: string
          created_at?: string
          descripcion?: string
          devuelto?: boolean
          entregado?: boolean
          equipo_id?: string | null
          id?: string
          item_id?: string | null
          notas?: string | null
          trabajo_id?: string
          unidad?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_recursos_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_recursos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventario_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_recursos_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_recursos_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajo_reportes: {
        Row: {
          agua_galones: number | null
          cliente_firma_url: string | null
          cliente_observaciones: string | null
          cliente_recibe_cargo: string | null
          cliente_recibe_nombre: string | null
          condiciones_sitio: string | null
          created_at: string
          hallazgos: string | null
          id: string
          materiales_usados: string | null
          mediciones: Json | null
          paneles_limpiados: number | null
          recomendaciones: string | null
          tecnico_firma_url: string | null
          tecnico_nombre: string | null
          trabajo_id: string
          trabajo_realizado: string | null
          updated_at: string
        }
        Insert: {
          agua_galones?: number | null
          cliente_firma_url?: string | null
          cliente_observaciones?: string | null
          cliente_recibe_cargo?: string | null
          cliente_recibe_nombre?: string | null
          condiciones_sitio?: string | null
          created_at?: string
          hallazgos?: string | null
          id?: string
          materiales_usados?: string | null
          mediciones?: Json | null
          paneles_limpiados?: number | null
          recomendaciones?: string | null
          tecnico_firma_url?: string | null
          tecnico_nombre?: string | null
          trabajo_id: string
          trabajo_realizado?: string | null
          updated_at?: string
        }
        Update: {
          agua_galones?: number | null
          cliente_firma_url?: string | null
          cliente_observaciones?: string | null
          cliente_recibe_cargo?: string | null
          cliente_recibe_nombre?: string | null
          condiciones_sitio?: string | null
          created_at?: string
          hallazgos?: string | null
          id?: string
          materiales_usados?: string | null
          mediciones?: Json | null
          paneles_limpiados?: number | null
          recomendaciones?: string | null
          tecnico_firma_url?: string | null
          tecnico_nombre?: string | null
          trabajo_id?: string
          trabajo_realizado?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_reportes_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: true
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_reportes_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: true
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajo_reportes_diarios: {
        Row: {
          agua_galones: number | null
          angulo_inclinacion: number | null
          avance_pct: number | null
          bloqueos: string | null
          clima: string | null
          created_at: string
          fecha: string
          hallazgos: string | null
          hora_fin: string | null
          hora_inicio: string | null
          horas_trabajadas: number | null
          id: string
          observaciones: string | null
          paneles_limpiados: number | null
          presion_agua_psi: number | null
          tds_ppm: number | null
          tecnico_id: string
          trabajo_id: string
          trabajo_realizado: string | null
          updated_at: string
          watts_panel: number | null
        }
        Insert: {
          agua_galones?: number | null
          angulo_inclinacion?: number | null
          avance_pct?: number | null
          bloqueos?: string | null
          clima?: string | null
          created_at?: string
          fecha?: string
          hallazgos?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          horas_trabajadas?: number | null
          id?: string
          observaciones?: string | null
          paneles_limpiados?: number | null
          presion_agua_psi?: number | null
          tds_ppm?: number | null
          tecnico_id: string
          trabajo_id: string
          trabajo_realizado?: string | null
          updated_at?: string
          watts_panel?: number | null
        }
        Update: {
          agua_galones?: number | null
          angulo_inclinacion?: number | null
          avance_pct?: number | null
          bloqueos?: string | null
          clima?: string | null
          created_at?: string
          fecha?: string
          hallazgos?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          horas_trabajadas?: number | null
          id?: string
          observaciones?: string | null
          paneles_limpiados?: number | null
          presion_agua_psi?: number | null
          tds_ppm?: number | null
          tecnico_id?: string
          trabajo_id?: string
          trabajo_realizado?: string | null
          updated_at?: string
          watts_panel?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_reportes_diarios_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_reportes_diarios_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajo_reportes_pdf: {
        Row: {
          created_at: string
          fecha: string
          id: string
          nombre_original: string | null
          notas: string | null
          storage_path: string
          subido_por: string
          tamanio_bytes: number | null
          trabajo_id: string
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          nombre_original?: string | null
          notas?: string | null
          storage_path: string
          subido_por: string
          tamanio_bytes?: number | null
          trabajo_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          nombre_original?: string | null
          notas?: string | null
          storage_path?: string
          subido_por?: string
          tamanio_bytes?: number | null
          trabajo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_reportes_pdf_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_reportes_pdf_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajo_tecnicos: {
        Row: {
          created_at: string
          created_by: string | null
          rol: string
          tecnico_id: string
          trabajo_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          rol?: string
          tecnico_id: string
          trabajo_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          rol?: string
          tecnico_id?: string
          trabajo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_tecnicos_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajo_tecnicos_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajos: {
        Row: {
          auto_generado: boolean
          avisos_enviados: Json
          ciclo_numero: number | null
          contrato_id: string | null
          created_at: string
          duracion_dias: number
          equipo_id: string | null
          estado: Database["public"]["Enums"]["trabajo_estado"]
          fecha_completado: string | null
          fecha_programada: string
          firma_storage_path: string | null
          firmado_at: string | null
          firmado_por: string | null
          firmado_rut: string | null
          folio: string
          id: string
          notas: string | null
          origen: string
          planta_id: string
          servicio: string
          tecnico_id: string | null
          updated_at: string
        }
        Insert: {
          auto_generado?: boolean
          avisos_enviados?: Json
          ciclo_numero?: number | null
          contrato_id?: string | null
          created_at?: string
          duracion_dias?: number
          equipo_id?: string | null
          estado?: Database["public"]["Enums"]["trabajo_estado"]
          fecha_completado?: string | null
          fecha_programada: string
          firma_storage_path?: string | null
          firmado_at?: string | null
          firmado_por?: string | null
          firmado_rut?: string | null
          folio?: string
          id?: string
          notas?: string | null
          origen?: string
          planta_id: string
          servicio: string
          tecnico_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_generado?: boolean
          avisos_enviados?: Json
          ciclo_numero?: number | null
          contrato_id?: string | null
          created_at?: string
          duracion_dias?: number
          equipo_id?: string | null
          estado?: Database["public"]["Enums"]["trabajo_estado"]
          fecha_completado?: string | null
          fecha_programada?: string
          firma_storage_path?: string | null
          firmado_at?: string | null
          firmado_por?: string | null
          firmado_rut?: string | null
          folio?: string
          id?: string
          notas?: string | null
          origen?: string
          planta_id?: string
          servicio?: string
          tecnico_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_servicio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajos_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajos_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      trabajos_sla: {
        Row: {
          cliente_id: string | null
          estado: Database["public"]["Enums"]["trabajo_estado"] | null
          estado_sla: string | null
          fecha_completado: string | null
          fecha_programada: string | null
          folio: string | null
          horas_transcurridas: number | null
          id: string | null
          planta_id: string | null
          servicio: string | null
          sla_horas_resolucion: number | null
          sla_horas_respuesta: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plantas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajos_planta_id_fkey"
            columns: ["planta_id"]
            isOneToOne: false
            referencedRelation: "plantas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      cambiar_estado_oc: {
        Args: {
          _notas?: string
          _nuevo_estado: Database["public"]["Enums"]["oc_estado"]
          _orden_id: string
        }
        Returns: undefined
      }
      contrato_cumplimiento: {
        Args: { _anio: number }
        Returns: {
          cantidad_anual: number
          cliente_id: string
          cliente_nombre: string
          completados: number
          contrato_id: string
          cumplimiento_pct: number
          fecha_inicio_real: string
          pendientes: number
          planta_id: string
          planta_nombre: string
          programados: number
          proxima_fecha: string
          servicio: string
        }[]
      }
      current_cliente_id: { Args: never; Returns: string }
      dashboard_kpis_v1: { Args: never; Returns: Json }
      editar_recepcion_item_oc: {
        Args: {
          _motivo: string
          _nueva_cantidad: number
          _nuevo_costo: number
          _recepcion_item_id: string
        }
        Returns: undefined
      }
      firmar_aprobacion: {
        Args: {
          _firma_storage_path: string
          _firmante_nombre: string
          _firmante_rut: string
          _ip: string
          _token: string
          _user_agent: string
        }
        Returns: {
          folio: string
          trabajo_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      registrar_recepcion_oc: {
        Args: {
          _lineas: Json
          _notas?: string
          _orden_id: string
          _recibido_por_nombre?: string
        }
        Returns: string
      }
      reset_operational_data: { Args: never; Returns: undefined }
      validar_token_aprobacion: {
        Args: { _token: string }
        Returns: {
          aprobacion_id: string
          cliente_nombre: string
          expira_at: string
          fecha_completado: string
          fecha_programada: string
          firmado_at: string
          folio: string
          notas: string
          planta_nombre: string
          servicio: string
          tecnico_nombre: string
          trabajo_id: string
        }[]
      }
      verificar_conflicto_tecnico: {
        Args: {
          _duracion_dias: number
          _excluir_trabajo_id?: string
          _fecha: string
          _tecnico_id: string
        }
        Returns: {
          duracion_dias: number
          fecha_programada: string
          folio: string
          id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "tecnico" | "cliente"
      cliente_estado: "activo" | "revision" | "pausado"
      equipo_estado:
        | "operativo"
        | "mantenimiento"
        | "disponible"
        | "fuera_servicio"
      inventario_categoria:
        | "insumo"
        | "repuesto"
        | "herramienta"
        | "epp"
        | "equipo"
        | "electrico"
        | "quimico"
      mantenimiento_estado:
        | "programado"
        | "pendiente"
        | "completado"
        | "cancelado"
      mantenimiento_tipo: "preventivo" | "correctivo" | "predictivo"
      movimiento_tipo: "ingreso" | "salida" | "ajuste"
      oc_estado: "borrador" | "enviada" | "parcial" | "recibida" | "cancelada"
      reporte_estado: "borrador" | "enviado" | "aprobado" | "rechazado"
      trabajo_estado: "programado" | "en_progreso" | "completado" | "cancelado"
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
    Enums: {
      app_role: ["admin", "supervisor", "tecnico", "cliente"],
      cliente_estado: ["activo", "revision", "pausado"],
      equipo_estado: [
        "operativo",
        "mantenimiento",
        "disponible",
        "fuera_servicio",
      ],
      inventario_categoria: [
        "insumo",
        "repuesto",
        "herramienta",
        "epp",
        "equipo",
        "electrico",
        "quimico",
      ],
      mantenimiento_estado: [
        "programado",
        "pendiente",
        "completado",
        "cancelado",
      ],
      mantenimiento_tipo: ["preventivo", "correctivo", "predictivo"],
      movimiento_tipo: ["ingreso", "salida", "ajuste"],
      oc_estado: ["borrador", "enviada", "parcial", "recibida", "cancelada"],
      reporte_estado: ["borrador", "enviado", "aprobado", "rechazado"],
      trabajo_estado: ["programado", "en_progreso", "completado", "cancelado"],
    },
  },
} as const
