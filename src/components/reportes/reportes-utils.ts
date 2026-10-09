


export type R = {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  planta_id: string | null;
  planta_nombre: string | null;
  periodo: string;
  titulo: string;
  insight_resumen: string | null;
  estado: "borrador" | "enviado" | "aprobado" | "rechazado";
  model_used: string | null;
  created_at: string;
  desde?: string | null;
  hasta?: string | null;
  version?: number | null;
  enviado_por?: string | null;
  aprobado_por?: string | null;
  rechazado_por?: string | null;
  motivo_rechazo?: string | null;
  fecha_emision?: string | null;
  codigo_documento?: string | null;
  version_label?: string | null;
  revision_ia_pendiente?: boolean;
  revision_ia_detalle?: { cifras_sin_respaldo?: string[] } | null;
};

/**
 * Calcula el alcance temporal de un reporte: "dia" cuando cubre una sola
 * fecha SV (o el periodo legacy es un día puntual) y "rango" cuando abarca
 * varios días. Devuelve null si no es determinable.
 */
export function scopeDeReporte(r: R): { tipo: "dia" | "rango"; dias: number; etiqueta: string } | null {
  const tz = "America/El_Salvador";
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  let d1: Date | null = null;
  let d2: Date | null = null;
  if (r.desde && r.hasta) {
    d1 = new Date(r.desde);
    d2 = new Date(r.hasta);
  } else if (r.periodo) {
    const m = /^(\d{4}-\d{2}-\d{2})$/.exec(r.periodo.trim());
    if (m) {
      d1 = new Date(`${m[1]}T00:00:00`);
      d2 = new Date(`${m[1]}T23:59:59`);
    }
  }
  if (!d1 || !d2 || isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  const s1 = fmt(d1);
  const s2 = fmt(d2);
  if (s1 === s2) {
    return { tipo: "dia", dias: 1, etiqueta: `Diario · ${d1.toLocaleDateString("es-SV", { timeZone: tz, day: "2-digit", month: "short" })}` };
  }
  const ms = new Date(s2).getTime() - new Date(s1).getTime();
  const dias = Math.max(2, Math.round(ms / 86400000) + 1);
  return {
    tipo: "rango",
    dias,
    etiqueta: `Rango · ${dias} días (${d1.toLocaleDateString("es-SV", { timeZone: tz, day: "2-digit", month: "short" })} → ${d2.toLocaleDateString("es-SV", { timeZone: tz, day: "2-digit", month: "short" })})`,
  };
}
