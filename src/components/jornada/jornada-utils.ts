import { type ModalidadPago } from "@/lib/nomina";
import type { NominaPersona } from "@/lib/pdf/NominaDoc";


export type ExtrasResumen = {
  limite_diario: number;
  desde: string;
  hasta: string;
  dias: {
    id: string; fecha: string; tecnico_id: string; colaborador: string;
    horas_efectivas: number; horas_ordinarias: number; horas_extras: number;
    horas_descanso: number; es_descanso: boolean; motivo_descanso: string | null; abierta: boolean;
  }[];
  personal: {
    tecnico_id: string; colaborador: string; dias: number;
    horas_efectivas: number; horas_ordinarias: number; horas_extras: number;
    horas_descanso: number; dias_con_extras: number; dias_descanso: number;
  }[];
  totales: { horas_efectivas: number; horas_ordinarias: number; horas_extras: number; horas_descanso: number };
};

export type NominaResumen = {
  desde: string;
  hasta: string;
  personal: NominaPersona[];
  totales: {
    horas_totales: number; horas_extra_diurnas: number; horas_extra_nocturnas: number;
    horas_descanso: number; horas_feriado: number;
    pago_ordinario: number; pago_extras: number; pago_descanso: number; pago_feriado: number;
    total_a_pagar: number;
  };
  sin_salario: string[];
};

export type SalarioFila = {
  user_id: string; colaborador: string; salario_mensual: number; notas: string | null;
  modalidad?: ModalidadPago; pago_diario: number;
};


export const TZ = "America/El_Salvador";

export function hoyISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
export function primerDiaMesISO(): string {
  const hoy = hoyISO();
  return `${hoy.slice(0, 7)}-01`;
}
export function fmtHora(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-SV", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}
/** ISO → valor para <input type="datetime-local"> en hora de El Salvador. */
export function isoALocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
/** El Salvador es UTC-6 todo el año (sin horario de verano). */
export function localAIso(v: string): string | null {
  if (!v) return null;
  return new Date(`${v}:00-06:00`).toISOString();
}
export function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export type Fila = {
  id: string;
  fecha: string;
  tecnico_id: string;
  tecnico_nombre: string;
  hora_inicio: string;
  hora_fin: string | null;
  almuerzo_inicio: string | null;
  almuerzo_fin: string | null;
  almuerzo_excedido: boolean;
  almuerzo_min: number;
  total_min: number;
  horas_efectivas: number;
  notas: string | null;
};
