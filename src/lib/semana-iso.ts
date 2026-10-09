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
