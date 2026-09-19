import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mapa tabla → claves de TanStack Query a invalidar cuando cambia una fila.
 * RLS ya filtra qué filas recibe cada rol; aquí solo decidimos qué refrescar.
 * Las claves parciales (prefijos) invalidan cualquier variante con extras.
 */
const TABLE_TO_KEYS: Record<string, string[][]> = {
  trabajos: [
    ["trabajos"], ["mis-trabajos"], ["terreno-trabajos"],
    ["trabajos-sla"], ["dashboard-stats"], ["dashboard-series"],
    ["alertas-sidebar"], ["cumplimiento-anual"], ["disponibilidad"],
    ["trabajos-con-recursos"], ["asignaciones-log"],
  ],
  contratos_servicio: [["cumplimiento-anual"], ["contratos"], ["trabajos"]],
  trabajo_reportes: [["reportes"], ["reporte"], ["reporte-auditoria"], ["dashboard-stats"], ["agua-por-planta"]],
  trabajo_reportes_diarios: [["reportes-diarios"], ["reportes"], ["dashboard-stats"], ["agua-por-planta"]],
  trabajo_reportes_pdf: [["reportes"], ["reporte"], ["trabajo-reportes-pdf"]],
  trabajo_evidencias: [["evidencias"], ["reportes-diarios"], ["dashboard-stats"]],
  trabajo_recursos: [["trabajo-recursos"], ["trabajos-con-recursos"]],
  trabajo_aprobaciones: [["trabajos"], ["reportes"], ["reporte"]],
  notificaciones_usuario: [["mis-notificaciones"]],
  jornadas_laborales: [["jornada-hoy"], ["jornadas"]],
  inventario_items: [["inventario"], ["alertas-sidebar"], ["dashboard-stats"]],
  inventario_movimientos: [["inventario"]],
  equipos: [["equipos"], ["dashboard-stats"], ["alertas-sidebar"]],
  solicitudes_visita: [["solicitudes"], ["alertas-sidebar"]],
  mantenimientos: [["mantenimientos"]],
};

// Añadimos feriados fuera del literal para no romper el tipado estricto
// del resto de las claves.
(TABLE_TO_KEYS as Record<string, string[][]>).feriados = [
  ["feriados"], ["feriados-activos"],
];

/**
 * Suscripción global a cambios en las tablas compartidas. Se monta una sola
 * vez en el layout _authenticated. RLS controla qué filas emite Postgres a
 * cada suscriptor, así que la jerarquía existente se preserva.
 */
export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const tables = Object.keys(TABLE_TO_KEYS);
    const debounce: Record<string, ReturnType<typeof setTimeout> | null> = {};

    const channel = supabase.channel("app-sync");
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          // Coalesce ráfagas de cambios en la misma tabla dentro de 250ms.
          if (debounce[table]) clearTimeout(debounce[table]!);
          debounce[table] = setTimeout(() => {
            for (const key of TABLE_TO_KEYS[table]) {
              qc.invalidateQueries({ queryKey: key });
            }
            debounce[table] = null;
          }, 250);
        },
      );
    }
    channel.subscribe();

    return () => {
      Object.values(debounce).forEach((t) => t && clearTimeout(t));
      supabase.removeChannel(channel);
    };
  }, [qc]);
}