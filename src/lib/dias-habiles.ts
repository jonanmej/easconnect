// Días hábiles y feriados de El Salvador.
// Lunes–Viernes son días hábiles, excepto feriados oficiales.

function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Caché de feriados personalizados por año. Se llena desde el hook
 * `useFeriados` (cliente) o desde una consulta puntual (servidor). Cuando hay
 * un valor para el año, éste sustituye a la lista fija por defecto; conserva
 * la compatibilidad síncrona de las funciones de este módulo.
 */
const feriadosCache = new Map<number, Set<string>>();

export function setFeriadosCache(year: number, fechas: Set<string>): void {
  feriadosCache.set(year, new Set(fechas));
}

export function hasFeriadosCache(year: number): boolean {
  return feriadosCache.has(year);
}

export function clearFeriadosCache(year?: number): void {
  if (year == null) feriadosCache.clear();
  else feriadosCache.delete(year);
}

/** Feriados oficiales de El Salvador para el año dado (YYYY-MM-DD). */
export function feriadosSV(year: number): Set<string> {
  const override = feriadosCache.get(year);
  if (override) return override;
  const set = new Set<string>();
  set.add(`${year}-01-01`); // Año Nuevo
  set.add(`${year}-05-01`); // Día del Trabajo
  set.add(`${year}-05-10`); // Día de la Madre
  set.add(`${year}-06-17`); // Día del Padre
  // Fiestas Agostinas: a nivel nacional solo el 6 de agosto es feriado.
  set.add(`${year}-08-06`);
  set.add(`${year}-09-15`); // Independencia
  set.add(`${year}-11-02`); // Día de los Difuntos
  set.add(`${year}-12-25`); // Navidad
  // Semana Santa: Jueves, Viernes y Sábado Santo.
  const easter = easterSunday(year);
  for (let offset = -3; offset <= -1; offset++) {
    const d = new Date(easter);
    d.setDate(d.getDate() + offset);
    set.add(ymd(d));
  }
  return set;
}

/** ¿Es día no laborable en El Salvador? (sábado, domingo o feriado). */
export function esNoLaborableSV(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return true;
  return feriadosSV(date.getFullYear()).has(ymd(date));
}

/** Fecha "ahora" en zona horaria de El Salvador. */
export function ahoraSV(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/El_Salvador" }));
}

/** Convierte un ISO/string a Date en zona horaria de El Salvador. */
export function fechaEnSV(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  return new Date(d.toLocaleString("en-US", { timeZone: "America/El_Salvador" }));
}

/** ¿Es no laborable (sábado, domingo o feriado SV) el instante dado, evaluado en zona SV? */
export function esNoLaborableSVFromISO(value: string | Date): boolean {
  return esNoLaborableSV(fechaEnSV(value));
}

/** Etiqueta legible del motivo de no laborabilidad, o null si es hábil. */
export function motivoNoLaborableSV(value: string | Date): string | null {
  const d = fechaEnSV(value);
  const dow = d.getDay();
  if (dow === 0) return "domingo";
  if (dow === 6) return "sábado";
  if (feriadosSV(d.getFullYear()).has(ymd(d))) return "feriado";
  return null;
}

/** Siguiente día hábil (>= start si include=true, > start si false). */
export function siguienteDiaHabilSV(start: Date, include = false): Date {
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  if (!include) d.setDate(d.getDate() + 1);
  while (esNoLaborableSV(d)) d.setDate(d.getDate() + 1);
  return d;
}

/** Día hábil anterior (< start). */
export function diaHabilAnteriorSV(start: Date): Date {
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  while (esNoLaborableSV(d)) d.setDate(d.getDate() - 1);
  return d;
}

/** Número de días hábiles entre dos fechas [start, end] inclusive. */
export function diasHabilesEntreSV(startMs: number, endMs: number): number {
  if (endMs < startMs) return 0;
  const s = new Date(startMs); s.setHours(0, 0, 0, 0);
  const e = new Date(endMs); e.setHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    if (!esNoLaborableSV(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Formatea una fecha para mostrar en español SV. */
export function formatearDiaHabilSV(d: Date): string {
  return d.toLocaleDateString("es-SV", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}