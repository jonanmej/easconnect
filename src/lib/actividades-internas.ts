/** Catálogo de tipos de actividad administrativa interna. */
export const TIPOS_ACTIVIDAD_INTERNA = [
  "Reunión interna",
  "Reunión con cliente",
  "Capacitación interna",
  "Trámite administrativo",
  "Auditoría / ISO",
  "Mantenimiento de taller",
  "Inventario / bodega",
  "Compras y proveedores",
  "Recursos humanos",
  "Facturación y cobros",
  "Viaje / traslado",
  "Otro",
] as const;

export const ESTADOS_ACTIVIDAD = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_curso", label: "En curso" },
  { value: "hecha", label: "Hecha" },
  { value: "cancelada", label: "Cancelada" },
] as const;

export const PRIORIDADES_ACTIVIDAD = [
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
] as const;

export function estadoActividadLabel(v?: string | null) {
  return ESTADOS_ACTIVIDAD.find((e) => e.value === v)?.label ?? "Pendiente";
}
export function prioridadActividadLabel(v?: string | null) {
  return PRIORIDADES_ACTIVIDAD.find((e) => e.value === v)?.label ?? "Media";
}
