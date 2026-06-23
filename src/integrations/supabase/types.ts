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
      clientes: {
        Row: {
          capacidad: string | null
          contacto: string | null
          created_at: string
          estado: Database["public"]["Enums"]["cliente_estado"]
          id: string
          nombre: string
          rut: string | null
          updated_at: string
        }
        Insert: {
          capacidad?: string | null
          contacto?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["cliente_estado"]
          id?: string
          nombre: string
          rut?: string | null
          updated_at?: string
        }
        Update: {
          capacidad?: string | null
          contacto?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["cliente_estado"]
          id?: string
          nombre?: string
          rut?: string | null
          updated_at?: string
        }
        Relationships: []
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
      inventario_items: {
        Row: {
          categoria: Database["public"]["Enums"]["inventario_categoria"]
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
        ]
      }
      mantenimientos: {
        Row: {
          created_at: string
          equipo_id: string
          estado: Database["public"]["Enums"]["mantenimiento_estado"]
          fecha: string
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
          nombre: string
          notificaciones_completado: boolean
          paneles: number
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
          nombre: string
          notificaciones_completado?: boolean
          paneles?: number
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
          nombre?: string
          notificaciones_completado?: boolean
          paneles?: number
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
          cliente_id: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
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
      reportes: {
        Row: {
          cliente_id: string
          contenido_markdown: string
          created_at: string
          enviado_a: string | null
          enviado_at: string | null
          estado: Database["public"]["Enums"]["reporte_estado"]
          generado_por: string | null
          id: string
          insight_resumen: string | null
          model_used: string | null
          periodo: string
          planta_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          cliente_id: string
          contenido_markdown: string
          created_at?: string
          enviado_a?: string | null
          enviado_at?: string | null
          estado?: Database["public"]["Enums"]["reporte_estado"]
          generado_por?: string | null
          id?: string
          insight_resumen?: string | null
          model_used?: string | null
          periodo: string
          planta_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          contenido_markdown?: string
          created_at?: string
          enviado_a?: string | null
          enviado_at?: string | null
          estado?: Database["public"]["Enums"]["reporte_estado"]
          generado_por?: string | null
          id?: string
          insight_resumen?: string | null
          model_used?: string | null
          periodo?: string
          planta_id?: string | null
          titulo?: string
          updated_at?: string
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
        ]
      }
      trabajo_evidencias: {
        Row: {
          created_at: string
          descripcion: string | null
          id: string
          storage_path: string
          subido_por: string | null
          trabajo_id: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          id?: string
          storage_path: string
          subido_por?: string | null
          trabajo_id: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          id?: string
          storage_path?: string
          subido_por?: string | null
          trabajo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabajo_evidencias_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajos: {
        Row: {
          created_at: string
          duracion_dias: number
          equipo_id: string | null
          estado: Database["public"]["Enums"]["trabajo_estado"]
          fecha_programada: string
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
          created_at?: string
          duracion_dias?: number
          equipo_id?: string | null
          estado?: Database["public"]["Enums"]["trabajo_estado"]
          fecha_programada: string
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
          created_at?: string
          duracion_dias?: number
          equipo_id?: string | null
          estado?: Database["public"]["Enums"]["trabajo_estado"]
          fecha_programada?: string
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
      [_ in never]: never
    }
    Functions: {
      current_cliente_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      inventario_categoria: "insumo" | "repuesto" | "herramienta" | "epp"
      mantenimiento_estado:
        | "programado"
        | "pendiente"
        | "completado"
        | "cancelado"
      mantenimiento_tipo: "preventivo" | "correctivo" | "predictivo"
      movimiento_tipo: "ingreso" | "salida" | "ajuste"
      reporte_estado: "borrador" | "enviado"
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
      inventario_categoria: ["insumo", "repuesto", "herramienta", "epp"],
      mantenimiento_estado: [
        "programado",
        "pendiente",
        "completado",
        "cancelado",
      ],
      mantenimiento_tipo: ["preventivo", "correctivo", "predictivo"],
      movimiento_tipo: ["ingreso", "salida", "ajuste"],
      reporte_estado: ["borrador", "enviado"],
      trabajo_estado: ["programado", "en_progreso", "completado", "cancelado"],
    },
  },
} as const
