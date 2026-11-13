/**
 * Número de semana ISO 8601 (lunes inicia la semana; la semana 1 contiene el
 * primer jueves del año). Única fuente para calendarios y PDFs.
 */
export function isoWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((+x - +yearStart) / 86400000 + 1) / 7);
}

/** Igual que isoWeek pero a partir de una fecha "YYYY-MM-DD". */
export function isoWeekFromISODate(s: string): number {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return isoWeek(new Date(y!, (m ?? 1) - 1, d ?? 1));
}

/** Fecha "YYYY-MM-DD" de un instante en la zona America/El_Salvador. */
export function fechaKeySV(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
}

/**
 * Instante (UTC) del lunes 00:00 hora de El Salvador de la semana ISO que
 * contiene `d`. El Salvador no tiene horario de verano (UTC−6 fijo).
 */
export function inicioSemanaSV(d: Date): Date {
  const [y, m, day] = fechaKeySV(d).split("-").map(Number);
  const x = new Date(Date.UTC(y!, m! - 1, day!, 6));
  const dow = (x.getUTCDay() + 6) % 7; // 0 = lunes
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}
