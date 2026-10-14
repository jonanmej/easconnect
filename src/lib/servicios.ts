export const SERVICIOS_OT = [
  "Mantenimiento Preventivo",
  "Mantenimiento Correctivo",
  "Mantenimiento Menor",
  "Mantenimiento Medio",
  "Mantenimiento Mayor",
  "Mantenimiento de motores",
  "Instalación Fotovoltaica",
  "Limpieza Robotizada",
  "Servicio Técnico de Drone",
  "Desmantelamiento de paneles solares",
  "Mantenimiento de transformador eléctrico",
  "Capacitación",
  "Visita técnica",
  "Falla",
  "Emergencia",
  "Inspección",
] as const;

/**
 * Catálogo cerrado de servicios contratables (orden fijo definido por negocio).
 * Falla / Emergencia / Inspección NO son contratables (son eventos no recurrentes).
 */
export const SERVICIOS_CONTRATO = [
  "Instalación Fotovoltaica",
  "Limpieza Robotizada",
  "Mantenimiento Menor",
  "Mantenimiento Medio",
  "Mantenimiento Mayor",
  "Mantenimiento de transformador eléctrico",
  "Servicio Técnico de Drone",
  "Capacitación",
  "Visita técnica",
] as const;

export const SERVICIOS_NO_CONTRATABLES = ["Falla", "Emergencia", "Inspección"] as const;

/**
 * Etiqueta de una OT: nombre específico del trabajo si existe, si no el
 * servicio del catálogo. Usar en pantallas, calendarios, PDFs y datos de IA.
 */
export function etiquetaTrabajo(t: { servicio?: string | null; nombre_trabajo?: string | null }): string {
  const nombre = String(t.nombre_trabajo ?? "").trim();
  const servicio = String(t.servicio ?? "").trim();
  if (nombre && servicio) return `${servicio} — ${nombre}`;
  return nombre || servicio || "—";
}
