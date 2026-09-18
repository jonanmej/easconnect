/**
 * Descuentos de ley de El Salvador aplicados a la planilla de pago mensual.
 *
 * - ISSS (salud, cuota del trabajador): 3 % sobre el salario, con tope de
 *   cotización de US$1,000.00 (descuento máximo de US$30.00).
 * - AFP (pensiones, cuota del trabajador): 7.25 % sobre el salario, con tope
 *   de cotización de US$7,398.24.
 * - Renta (ISR): tabla mensual de retención vigente, aplicada sobre la renta
 *   gravable = bruto − ISSS − AFP.
 */

export const ISSS_PORCENTAJE = 0.03;
export const ISSS_TOPE_BASE = 1000;
export const AFP_PORCENTAJE = 0.0725;
export const AFP_TOPE_BASE = 7398.24;

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Tabla mensual de retención de ISR (El Salvador). */
export const TRAMOS_RENTA = [
  { desde: 0, hasta: 472.0, porcentaje: 0, sobre: 0, cuota: 0 },
  { desde: 472.01, hasta: 895.24, porcentaje: 0.1, sobre: 472.0, cuota: 17.67 },
  { desde: 895.25, hasta: 2038.1, porcentaje: 0.2, sobre: 895.24, cuota: 60.0 },
  { desde: 2038.11, hasta: Infinity, porcentaje: 0.3, sobre: 2038.1, cuota: 288.57 },
] as const;

export function calcularIsss(bruto: number): number {
  if (!bruto || bruto <= 0) return 0;
  return r2(Math.min(bruto, ISSS_TOPE_BASE) * ISSS_PORCENTAJE);
}

export function calcularAfp(bruto: number): number {
  if (!bruto || bruto <= 0) return 0;
  return r2(Math.min(bruto, AFP_TOPE_BASE) * AFP_PORCENTAJE);
}

/** Retención de renta sobre la renta gravable mensual. */
export function calcularRenta(gravable: number): number {
  if (!gravable || gravable <= 0) return 0;
  const tramo = TRAMOS_RENTA.find((t) => gravable >= t.desde && gravable <= t.hasta) ?? TRAMOS_RENTA[3];
  if (tramo.porcentaje === 0) return 0;
  return r2(Math.max(0, gravable - tramo.sobre) * tramo.porcentaje + tramo.cuota);
}

export type DescuentosLey = {
  total_bruto: number;
  isss: number;
  afp: number;
  renta_gravable: number;
  renta: number;
  otros_descuentos: number;
  total_descuentos: number;
  total_neto: number;
};

/** Calcula ISSS, AFP, renta y el neto a pagar de un monto bruto mensual. */
export function calcularDescuentos(bruto: number, otros = 0): DescuentosLey {
  const total_bruto = r2(bruto);
  const isss = calcularIsss(total_bruto);
  const afp = calcularAfp(total_bruto);
  const renta_gravable = r2(Math.max(0, total_bruto - isss - afp));
  const renta = calcularRenta(renta_gravable);
  const otros_descuentos = r2(Math.max(0, otros));
  const total_descuentos = r2(isss + afp + renta + otros_descuentos);
  return {
    total_bruto,
    isss,
    afp,
    renta_gravable,
    renta,
    otros_descuentos,
    total_descuentos,
    total_neto: r2(Math.max(0, total_bruto - total_descuentos)),
  };
}

export const NOTA_LEGAL_DESCUENTOS =
  "Descuentos de ley de El Salvador: ISSS 3 % del salario con tope de cotización de US$1,000.00 " +
  "(máximo US$30.00); AFP 7.25 % con tope de cotización de US$7,398.24; renta (ISR) según la tabla " +
  "mensual de retención aplicada sobre el bruto menos ISSS y AFP. El neto es el pago después de estos descuentos.";
