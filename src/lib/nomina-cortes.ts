/**
 * Cortes de pago (El Salvador, uso interno de EA Service Connect).
 *
 * - Colaboradores con **salario mensual**: el corte es por quincena
 *   (del 1 al 15 y del 16 al último día del mes).
 * - Colaboradores con **pago por día (proyecto)**: el corte es semanal,
 *   de lunes a viernes, y se paga el mismo viernes. Solo entran los días
 *   con marcación (si no fueron convocados, no hay pago esa semana).
 */
import type { ModalidadPago } from "@/lib/nomina";

export type TipoCorte = "mes" | "quincena" | "semana";

export type CorteNomina = {
  clave: string;
  tipo: TipoCorte;
  label: string;
  desde: string;
  hasta: string;
  /** Modalidades de contratación que se pagan en este corte. */
  modalidades: ModalidadPago[];
  /** Fecha en que se hace efectivo el pago (YYYY-MM-DD). */
  pago: string;
};

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const isoDate = (d: Date) => iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());

/** Día y mes legibles de una fecha YYYY-MM-DD. */
export function diaMesCorto(fecha: string): string {
  const [, m, d] = fecha.split("-");
  return `${Number(d)} ${MESES_CORTOS[Number(m) - 1]}`;
}

export function ultimoDiaMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Las dos quincenas del mes (colaboradores con salario mensual). */
export function quincenasDelMes(anio: number, mes: number): CorteNomina[] {
  const fin = ultimoDiaMes(anio, mes);
  return [
    {
      clave: "q1", tipo: "quincena", label: "1ª quincena",
      desde: iso(anio, mes, 1), hasta: iso(anio, mes, 15),
      modalidades: ["mensual"], pago: iso(anio, mes, 15),
    },
    {
      clave: "q2", tipo: "quincena", label: "2ª quincena",
      desde: iso(anio, mes, 16), hasta: iso(anio, mes, fin),
      modalidades: ["mensual"], pago: iso(anio, mes, fin),
    },
  ];
}

/**
 * Semanas de pago del mes (colaboradores con pago por día). Cada semana va de
 * lunes a viernes y se paga ese viernes; se incluyen todos los viernes que
 * caen dentro del mes, aunque el lunes pertenezca al mes anterior.
 */
export function semanasDelMes(anio: number, mes: number): CorteNomina[] {
  const out: CorteNomina[] = [];
  const fin = ultimoDiaMes(anio, mes);
  for (let d = 1; d <= fin; d++) {
    const fecha = new Date(Date.UTC(anio, mes - 1, d));
    if (fecha.getUTCDay() !== 5) continue; // solo viernes
    const lunes = new Date(fecha);
    lunes.setUTCDate(lunes.getUTCDate() - 4);
    const desde = isoDate(lunes);
    const hasta = isoDate(fecha);
    out.push({
      clave: `sem-${hasta}`, tipo: "semana",
      label: `Semana ${diaMesCorto(desde)} – ${diaMesCorto(hasta)}`,
      desde, hasta, modalidades: ["diario"], pago: hasta,
    });
  }
  return out;
}

/** Todos los cortes de pago del mes, en orden de pago. */
export function cortesDelMes(anio: number, mes: number): CorteNomina[] {
  return [...quincenasDelMes(anio, mes), ...semanasDelMes(anio, mes)];
}

/** Corte del mes completo (planilla consolidada, todas las modalidades). */
export function corteMesCompleto(anio: number, mes: number): CorteNomina {
  const fin = ultimoDiaMes(anio, mes);
  return {
    clave: "mes", tipo: "mes", label: "Mes completo",
    desde: iso(anio, mes, 1), hasta: iso(anio, mes, fin),
    modalidades: ["mensual", "diario"], pago: iso(anio, mes, fin),
  };
}

/** Resuelve un corte a partir de su clave. Lanza si la clave no existe. */
export function resolverCorte(anio: number, mes: number, clave: string): CorteNomina {
  if (!clave || clave === "mes") return corteMesCompleto(anio, mes);
  const encontrado = cortesDelMes(anio, mes).find((c) => c.clave === clave);
  if (!encontrado) throw new Error(`El corte de pago "${clave}" no corresponde al mes seleccionado.`);
  return encontrado;
}

export const NOTA_LEGAL_CORTES =
  "Cortes de pago: el personal con salario mensual se paga por quincena (del 1 al 15 y del 16 al cierre del mes); " +
  "el personal contratado por proyecto (pago por día) se paga cada viernes por la semana de lunes a viernes, " +
  "únicamente por los días con marcación de convocatoria.";
