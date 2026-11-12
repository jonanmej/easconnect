import { trabajoActivoEnDia } from "@/lib/hoy-config";

type Asignacion = {
  tecnico_id?: string | null;
  tecnicos_ids?: string[];
  fecha_programada: string;
  duracion_dias?: number | null;
  excepciones_dia?: Array<{ fecha_original: string; fecha_movida: string }> | null;
  estado: string;
  pausada_at?: string | null;
};

export function asignacionesDeHoy<T extends Asignacion>(trabajos: T[], tecnicoId: string | undefined, dia: string): T[] {
  if (!tecnicoId) return [];
  return trabajos.filter((t) =>
    (Array.isArray(t.tecnicos_ids) ? t.tecnicos_ids.includes(tecnicoId) : t.tecnico_id === tecnicoId)
    && (t.estado === "programado" || t.estado === "en_progreso")
    && !t.pausada_at
    && trabajoActivoEnDia(t, dia),
  );
}