/**
 * Etiquetas de mes independientes de la zona horaria del navegador.
 * Se basan solo en (año, mes) del calendario, nunca en conversiones de hora.
 */
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/** month: 0–11 */
export function nombreMes(month: number): string {
  return MESES[((month % 12) + 12) % 12];
}

/** "enero de 2026" */
export function nombreMesAnio(year: number, month: number): string {
  return `${nombreMes(month)} de ${year}`;
}

/** A partir de un Date de calendario local (cursor de la vista). */
export function nombreMesDe(d: Date): string {
  return nombreMes(d.getMonth());
}
export function nombreMesAnioDe(d: Date): string {
  return nombreMesAnio(d.getFullYear(), d.getMonth());
}
