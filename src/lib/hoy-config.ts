import { esNoLaborableSV } from "@/lib/dias-habiles";

/**
 * Configuración única de zona horaria y criterio de "hoy" para toda la app.
 * Dashboard (admin/supervisor) y Programación deben usar SIEMPRE estas
 * utilidades para decidir qué OT está activa en un día dado; así ambos
 * módulos coinciden en todo momento.
 */
export const APP_TIMEZONE = "America/El_Salvador";

/**
 * - `dias_laborables`: la duración de la OT se cuenta solo en días L-V
 *   hábiles (excluye sábados, domingos y feriados). Es el criterio que usa
 *   la vista de Programación.
 * - `dias_corridos`: la duración se cuenta en días calendario consecutivos.
 */
export type CriterioHoy = "dias_laborables" | "dias_corridos";
export const CRITERIO_HOY: CriterioHoy = "dias_laborables";

export type OpcionesDia = {
  timeZone?: string;
  criterio?: CriterioHoy;
};

/** Clave de día (YYYY-MM-DD) del instante dado, evaluado en la zona horaria de la app. */
export function diaKeyTZ(value: string | Date, timeZone: string = APP_TIMEZONE): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Clave de día de "hoy" en la zona horaria de la app. */
export function hoyKeyTZ(timeZone: string = APP_TIMEZONE): string {
  return diaKeyTZ(new Date(), timeZone);
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

function keyFromLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type TrabajoDias = {
  fecha_programada: string | Date;
  duracion_dias?: number | null;
  excepciones_dia?: Array<{ fecha_original: string; fecha_movida: string }> | null;
};

/**
 * Días (YYYY-MM-DD) que realmente ocupa una OT: expande la duración según el
 * criterio configurado y aplica las excepciones de día (reprogramaciones
 * puntuales). Reproduce exactamente la expansión de la vista Programación.
 */
export function diasOcupadosTrabajo(t: TrabajoDias, opts: OpcionesDia = {}): string[] {
  const timeZone = opts.timeZone ?? APP_TIMEZONE;
  const criterio = opts.criterio ?? CRITERIO_HOY;
  const dur = Math.max(1, Number(t.duracion_dias ?? 1));
  const cursor = dateFromKey(diaKeyTZ(t.fecha_programada, timeZone));
  const base: string[] = [];
  let guard = 0;
  while (base.length < dur && guard < dur + 400) {
    guard++;
    // El día de inicio se respeta siempre (emergencias en feriado o fin de
    // semana); solo los días siguientes saltan los no laborables.
    if (base.length === 0 || criterio === "dias_corridos" || !esNoLaborableSV(cursor)) {
      base.push(keyFromLocalDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const excs = new Map((t.excepciones_dia ?? []).map((e) => [e.fecha_original, e.fecha_movida]));
  return base.map((k) => excs.get(k) ?? k);
}

/** ¿La OT está activa (en ejecución) en el día indicado? Considera inicio y fin real. */
export function trabajoActivoEnDia(t: TrabajoDias, diaKey: string, opts: OpcionesDia = {}): boolean {
  return diasOcupadosTrabajo(t, opts).includes(diaKey);
}

/** ¿La OT está activa hoy, según la zona horaria y el criterio configurados? */
export function trabajoActivoHoy(t: TrabajoDias, opts: OpcionesDia = {}): boolean {
  return trabajoActivoEnDia(t, hoyKeyTZ(opts.timeZone ?? APP_TIMEZONE), opts);
}
