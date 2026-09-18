/**
 * Cálculo de pago de nómina conforme al Código de Trabajo de El Salvador.
 *
 * Bases utilizadas:
 * - Salario diario  = salario mensual / 30 días.
 * - Hora ordinaria  = salario diario / 8 horas.
 * - Jornada nocturna: de las 19:00 a las 06:00 (recargo del 25 %).
 * - Hora extra diurna: recargo del 100 % (se paga al doble).
 * - Hora extra nocturna: recargo del 100 % sobre la hora nocturna.
 * - Día de descanso semanal (domingo): recargo del 50 %.
 * - Día de asueto (feriado): recargo del 100 % (pago doble).
 *
 * El almuerzo registrado no se cuenta como tiempo trabajado.
 */

export const HORAS_JORNADA_ORDINARIA = 8;
export const DIAS_MES_NOMINA = 30;
/** La jornada nocturna corre de 19:00 a 06:00 (hora de El Salvador). */
export const NOCTURNO_INICIO_HORA = 19;
export const NOCTURNO_FIN_HORA = 6;
/** El Salvador es UTC-6 todo el año (sin horario de verano). */
const OFFSET_SV_MIN = -6 * 60;

export type TipoDiaNomina = "habil" | "descanso" | "feriado";

export type CategoriaHora =
  | "ord_diurna"
  | "ord_nocturna"
  | "extra_diurna"
  | "extra_nocturna";

/** Multiplicadores sobre la hora ordinaria, por tipo de día. */
export const FACTORES_NOMINA: Record<TipoDiaNomina, Record<CategoriaHora, number>> = {
  habil: { ord_diurna: 1, ord_nocturna: 1.25, extra_diurna: 2, extra_nocturna: 2.5 },
  descanso: { ord_diurna: 1.5, ord_nocturna: 1.75, extra_diurna: 2.5, extra_nocturna: 3 },
  feriado: { ord_diurna: 2, ord_nocturna: 2.25, extra_diurna: 4, extra_nocturna: 4.5 },
};

export const ETIQUETAS_CATEGORIA: Record<CategoriaHora, string> = {
  ord_diurna: "Ordinarias diurnas",
  ord_nocturna: "Ordinarias nocturnas",
  extra_diurna: "Extras diurnas",
  extra_nocturna: "Extras nocturnas",
};

export const ETIQUETAS_TIPO_DIA: Record<TipoDiaNomina, string> = {
  habil: "Día hábil",
  descanso: "Día de descanso (domingo)",
  feriado: "Día de asueto (feriado)",
};

export type DesgloseHoras = Record<CategoriaHora, number>;

export function desgloseVacio(): DesgloseHoras {
  return { ord_diurna: 0, ord_nocturna: 0, extra_diurna: 0, extra_nocturna: 0 };
}

export function sumarDesglose(a: DesgloseHoras, b: DesgloseHoras): DesgloseHoras {
  return {
    ord_diurna: a.ord_diurna + b.ord_diurna,
    ord_nocturna: a.ord_nocturna + b.ord_nocturna,
    extra_diurna: a.extra_diurna + b.extra_diurna,
    extra_nocturna: a.extra_nocturna + b.extra_nocturna,
  };
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

function esNocturna(ms: number): boolean {
  const h = new Date(ms + OFFSET_SV_MIN * 60000).getUTCHours();
  return h >= NOCTURNO_INICIO_HORA || h < NOCTURNO_FIN_HORA;
}

/**
 * Reparte el tiempo trabajado (descontando el almuerzo) en horas ordinarias y
 * extras, separando la franja diurna de la nocturna. El reparto es cronológico:
 * las primeras 8 horas efectivas son ordinarias, el resto son extras.
 */
export function desglosarJornada(j: {
  hora_inicio?: string | null;
  hora_fin?: string | null;
  almuerzo_inicio?: string | null;
  almuerzo_fin?: string | null;
}): DesgloseHoras {
  const out = desgloseVacio();
  if (!j.hora_inicio || !j.hora_fin) return out;
  const ini = new Date(j.hora_inicio).getTime();
  const fin = new Date(j.hora_fin).getTime();
  if (!Number.isFinite(ini) || !Number.isFinite(fin) || fin <= ini) return out;

  const almIni = j.almuerzo_inicio ? new Date(j.almuerzo_inicio).getTime() : null;
  const almFin = j.almuerzo_fin ? new Date(j.almuerzo_fin).getTime() : null;
  const enAlmuerzo = (ms: number) =>
    almIni !== null && almFin !== null && ms >= almIni && ms < almFin;

  const PASO_MIN = 1;
  const paso = PASO_MIN * 60000;
  const limiteOrdMin = HORAS_JORNADA_ORDINARIA * 60;
  let efectivos = 0;

  for (let t = ini; t < fin; t += paso) {
    if (enAlmuerzo(t)) continue;
    const nocturna = esNocturna(t);
    const extra = efectivos >= limiteOrdMin;
    const key: CategoriaHora = extra
      ? nocturna ? "extra_nocturna" : "extra_diurna"
      : nocturna ? "ord_nocturna" : "ord_diurna";
    out[key] += PASO_MIN / 60;
    efectivos += PASO_MIN;
  }

  return {
    ord_diurna: r2(out.ord_diurna),
    ord_nocturna: r2(out.ord_nocturna),
    extra_diurna: r2(out.extra_diurna),
    extra_nocturna: r2(out.extra_nocturna),
  };
}

/** Valor de la hora ordinaria a partir del salario mensual. */
export function valorHoraOrdinaria(salarioMensual: number): number {
  if (!salarioMensual || salarioMensual <= 0) return 0;
  return salarioMensual / DIAS_MES_NOMINA / HORAS_JORNADA_ORDINARIA;
}

/** Pago de un desglose de horas según el tipo de día. */
export function pagoDesglose(
  desglose: DesgloseHoras,
  tipoDia: TipoDiaNomina,
  valorHora: number,
): Record<CategoriaHora, number> & { total: number } {
  const f = FACTORES_NOMINA[tipoDia];
  const montos = {
    ord_diurna: desglose.ord_diurna * f.ord_diurna * valorHora,
    ord_nocturna: desglose.ord_nocturna * f.ord_nocturna * valorHora,
    extra_diurna: desglose.extra_diurna * f.extra_diurna * valorHora,
    extra_nocturna: desglose.extra_nocturna * f.extra_nocturna * valorHora,
  };
  return {
    ord_diurna: r2(montos.ord_diurna),
    ord_nocturna: r2(montos.ord_nocturna),
    extra_diurna: r2(montos.extra_diurna),
    extra_nocturna: r2(montos.extra_nocturna),
    total: r2(montos.ord_diurna + montos.ord_nocturna + montos.extra_diurna + montos.extra_nocturna),
  };
}

export function fmtUSD(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

export const NOTA_LEGAL_NOMINA =
  "Cálculo conforme al Código de Trabajo de El Salvador: hora ordinaria = salario mensual / 30 días / 8 horas; " +
  "jornada nocturna (19:00 a 06:00) con recargo del 25 %; hora extra diurna con recargo del 100 %; " +
  "hora extra nocturna con recargo del 100 % sobre la hora nocturna; día de descanso semanal con recargo del 50 %; " +
  "día de asueto con recargo del 100 %. El tiempo de almuerzo no se cuenta como tiempo trabajado.";
