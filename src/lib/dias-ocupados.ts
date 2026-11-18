import { esNoLaborableSV } from "@/lib/dias-habiles";

/** Configuración única de zona horaria y expansión de días de una OT. */
export const APP_TIMEZONE = "America/El_Salvador";

export type CriterioHoy = "dias_laborables" | "dias_corridos";

export type OpcionesDia = {
  timeZone?: string;
  criterio?: CriterioHoy;
};

export type DiaMovido = {
  fecha_original: string;
  fecha_movida: string;
};

export type TrabajoDias = {
  fecha_programada: string | Date;
  duracion_dias?: number | null;
  excepciones_dia?: DiaMovido[] | null;
};

/** Clave de día (YYYY-MM-DD) del instante dado en la zona horaria indicada. */
export function diaKeyTZ(value: string | Date, timeZone: string = APP_TIMEZONE): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

function keyFromLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Expande una duración desde una fecha local YYYY-MM-DD y aplica los días
 * movidos. El día de inicio siempre cuenta, incluso si es fin de semana o
 * feriado; los siguientes saltan los no laborables cuando el criterio es
 * `dias_laborables`.
 */
export function diasOcupadosDesdeClave(
  fechaInicio: string,
  duracionDias?: number | null,
  excepciones: DiaMovido[] | null = [],
  criterio: CriterioHoy = "dias_laborables",
): string[] {
  const dur = Math.max(1, Number(duracionDias ?? 1));
  const cursor = dateFromKey(fechaInicio);
  const base: string[] = [];
  let guard = 0;
  while (base.length < dur && guard < dur + 400) {
    guard++;
    if (base.length === 0 || criterio === "dias_corridos" || !esNoLaborableSV(cursor)) {
      base.push(keyFromLocalDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const movidos = new Map((excepciones ?? []).map((e) => [e.fecha_original, e.fecha_movida]));
  return base.map((fecha) => movidos.get(fecha) ?? fecha);
}

/** Días que realmente ocupa una OT, con inicio evaluado en la zona de la app. */
export function diasOcupadosTrabajo(t: TrabajoDias, opts: OpcionesDia = {}): string[] {
  return diasOcupadosDesdeClave(
    diaKeyTZ(t.fecha_programada, opts.timeZone ?? APP_TIMEZONE),
    t.duracion_dias,
    t.excepciones_dia,
    opts.criterio ?? "dias_laborables",
  );
}
