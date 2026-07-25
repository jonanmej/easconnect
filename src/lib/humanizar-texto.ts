// Convierte tokens crudos del dataset (nombres de campo estilo snake_case,
// enums como "en_progreso", etc.) en frases naturales en español para que
// los reportes ejecutivos no muestren identificadores de código.

const DICCIONARIO: Record<string, string> = {
  // Estados de trabajos / OT
  en_progreso: "en progreso",
  en_proceso: "en proceso",
  por_iniciar: "por iniciar",
  sin_iniciar: "sin iniciar",
  no_iniciado: "no iniciado",
  no_iniciada: "no iniciada",
  pendiente_revision: "pendiente de revisión",
  requiere_revision: "requiere revisión",

  // Métricas operativas
  paneles_limpiados: "paneles limpiados",
  paneles_limpiados_periodo: "paneles limpiados en el periodo",
  panels_limpiados: "paneles limpiados",
  horas_trabajadas: "horas trabajadas",
  horas_trabajadas_periodo: "horas trabajadas en el periodo",
  avance_pct: "porcentaje de avance",
  avance_porcentaje: "porcentaje de avance",
  watts_totales: "watts totales",
  watts_panel: "watts por panel",
  watts_por_panel: "watts por panel",
  tds_ppm: "TDS (ppm)",
  angulo_inclinacion: "ángulo de inclinación",
  presion_agua_psi: "presión de agua (PSI)",
  presion_agua: "presión de agua",
  agua_galones: "galones de agua",
  agua_galones_periodo: "galones de agua en el periodo",

  // Textos descriptivos
  trabajo_realizado: "trabajo realizado",
  condiciones_sitio: "condiciones del sitio",
  cliente_observaciones: "observaciones del cliente",
  observaciones_cliente: "observaciones del cliente",
  materiales_usados: "materiales utilizados",
  hallazgos_recomendaciones: "hallazgos y recomendaciones",
  reportes_diarios: "reportes diarios",
  reportes_tecnicos: "reportes técnicos",
  salud_promedio: "salud promedio",
};

function humanizarToken(raw: string): string {
  const key = raw.toLowerCase();
  if (DICCIONARIO[key]) return DICCIONARIO[key];
  // Fallback genérico: cambia guiones bajos por espacios manteniendo mayúsculas.
  return raw.replace(/_+/g, " ");
}

export function humanizarTexto(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);

  // 1) Reemplaza tokens snake_case (envueltos o no en comillas/backticks) por
  //    su equivalente natural.
  s = s.replace(/[`'"“”‘’]?\b([a-zA-ZáéíóúñÑ]+(?:_[a-zA-ZáéíóúñÑ0-9]+)+)\b[`'"“”‘’]?/g, (_m, token: string) => {
    return humanizarToken(token);
  });

  // 2) Elimina comillas simples que envuelven una sola palabra ya limpia
  //    (p.ej. 'hallazgos' → hallazgos), pero conserva comillas de citas largas.
  s = s.replace(/'([A-Za-zÁÉÍÓÚÑáéíóúñ0-9%°()·\- ]{1,40})'/g, (m, inner: string) => {
    return inner.trim().split(/\s+/).length <= 3 ? inner : m;
  });

  // 3) Colapsa espacios múltiples que puedan quedar.
  s = s.replace(/[ \t]{2,}/g, " ");

  // 4) Capitaliza la primera letra si el reemplazo la dejó en minúscula al
  //    inicio de una oración.
  s = s.replace(/(^|[.\n]\s+)([a-záéíóúñ])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());

  return s;
}

// Etiqueta legible para el estado de una OT / trabajo.
export function estadoLabel(estado: string | null | undefined): string {
  if (!estado) return "—";
  const s = String(estado).toLowerCase();
  const map: Record<string, string> = {
    completado: "Completado",
    completada: "Completada",
    cancelado: "Cancelado",
    cancelada: "Cancelada",
    en_progreso: "En progreso",
    en_proceso: "En proceso",
    programado: "Programado",
    programada: "Programada",
    pendiente: "Pendiente",
    borrador: "Borrador",
    parcial: "Parcial",
    recibida: "Recibida",
    enviada: "Enviada",
  };
  if (map[s]) return map[s];
  return humanizarTexto(s).replace(/^./, (c) => c.toUpperCase());
}