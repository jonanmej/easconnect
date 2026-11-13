/**
 * Cumplimiento del cronograma: completados a tiempo / actividades vencidas × 100.
 * Vencida = fecha_programada + max(1, duracion_dias) días <= ahora, en estado
 * completado/programado/en_progreso. A tiempo = completado con
 * fecha_completado <= ese límite. Sin vencidas → 100% (0/0).
 */
export interface TrabajoCronograma {
  fecha_programada: string;
  fecha_completado?: string | null;
  duracion_dias?: number | null;
  estado: string;
}

export function calcularCumplimientoCronograma(
  ts: TrabajoCronograma[],
  ahora: number = Date.now(),
): { pct: number; num: number; den: number } {
  const limite = (t: TrabajoCronograma) =>
    new Date(t.fecha_programada).getTime() + Math.max(1, Number(t.duracion_dias ?? 1)) * 86400000;
  const vencidas = ts.filter(
    (t) => limite(t) <= ahora && (t.estado === "completado" || t.estado === "programado" || t.estado === "en_progreso"),
  );
  if (vencidas.length === 0) return { pct: 100, num: 0, den: 0 };
  const aTiempo = vencidas.filter(
    (t) => t.estado === "completado" && !!t.fecha_completado && new Date(t.fecha_completado).getTime() <= limite(t),
  ).length;
  return { pct: Math.round((aTiempo / vencidas.length) * 100), num: aTiempo, den: vencidas.length };
}
