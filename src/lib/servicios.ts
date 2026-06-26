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
