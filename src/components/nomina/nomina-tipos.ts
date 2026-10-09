import { type ModalidadPago } from "@/lib/nomina";
import { type TipoCorte } from "@/lib/nomina-cortes";


export const TZ = "America/El_Salvador";
export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function hoySV() {
  const iso = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  return { anio: Number(iso.slice(0, 4)), mes: Number(iso.slice(5, 7)) };
}

export type PersonaCalc = {
  tecnico_id: string; colaborador: string; salario_mensual: number; valor_hora: number;
  modalidad?: ModalidadPago; pago_diario?: number;
  dias: number; sin_salario: boolean; horas_totales: number;
  horas_ord_diurnas: number; horas_ord_nocturnas: number;
  horas_extra_diurnas: number; horas_extra_nocturnas: number;
  horas_descanso: number; horas_feriado: number;
  pago_ordinario: number; pago_extras: number; pago_descanso: number; pago_feriado: number;
  total_a_pagar: number; total_bruto: number; isss: number; afp: number; renta: number;
  otros_descuentos: number; total_descuentos: number; total_neto: number;
};

export type CalcMes = {
  anio: number; mes: number; desde: string; hasta: string;
  personal: PersonaCalc[];
  totales: {
    horas_totales: number; horas_extra_diurnas: number; horas_extra_nocturnas: number;
    horas_descanso: number; horas_feriado: number;
    pago_ordinario: number; pago_extras: number; pago_descanso: number; pago_feriado: number;
    total_a_pagar: number; total_bruto: number; isss: number; afp: number; renta: number;
    otros_descuentos: number; total_descuentos: number; total_neto: number;
  };
  sin_salario: string[];
  periodo: { id: string; estado: string; notas: string | null; cerrado_at: string | null } | null;
  guardado: { user_id: string; otros_descuentos: number | string; notas: string | null }[];
  cortes: CorteCalc[];
};

export type CorteCalc = {
  clave: string; tipo: TipoCorte; label: string; desde: string; hasta: string; pago: string;
  modalidades: ModalidadPago[];
  colaboradores: number; dias: number;
  total_bruto: number; total_descuentos: number; total_neto: number;
  periodo: { id: string; estado: string } | null;
  personal?: Array<{ tecnico_id: string; colaborador: string; dias: number; total_bruto: number; total_neto: number }>;
};

export type SalarioFila = {
  user_id: string; colaborador: string; salario_mensual: number; notas: string | null;
  modalidad?: ModalidadPago; pago_diario: number;
};
