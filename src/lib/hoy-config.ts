import {
  APP_TIMEZONE,
  diaKeyTZ,
  diasOcupadosTrabajo,
  type OpcionesDia,
  type TrabajoDias,
} from "@/lib/dias-ocupados";

export { APP_TIMEZONE, diaKeyTZ, diasOcupadosTrabajo } from "@/lib/dias-ocupados";
export type { CriterioHoy, OpcionesDia, TrabajoDias } from "@/lib/dias-ocupados";

/**
 * - `dias_laborables`: la duración de la OT se cuenta solo en días L-V
 *   hábiles (excluye sábados, domingos y feriados). Es el criterio que usa
 *   la vista de Programación.
 * - `dias_corridos`: la duración se cuenta en días calendario consecutivos.
 */
export const CRITERIO_HOY: import("@/lib/dias-ocupados").CriterioHoy = "dias_laborables";

/** Clave de día de "hoy" en la zona horaria de la app. */
export function hoyKeyTZ(timeZone: string = APP_TIMEZONE): string {
  return diaKeyTZ(new Date(), timeZone);
}

/** ¿La OT está activa (en ejecución) en el día indicado? Considera inicio y fin real. */
export function trabajoActivoEnDia(t: TrabajoDias, diaKey: string, opts: OpcionesDia = {}): boolean {
  return diasOcupadosTrabajo(t, opts).includes(diaKey);
}

/** ¿La OT está activa hoy, según la zona horaria y el criterio configurados? */
export function trabajoActivoHoy(t: TrabajoDias, opts: OpcionesDia = {}): boolean {
  return trabajoActivoEnDia(t, hoyKeyTZ(opts.timeZone ?? APP_TIMEZONE), opts);
}
