import { diasOcupadosTrabajo, type DiaMovido } from "@/lib/dias-ocupados";

export type TrabajoDisponibilidad = {
  fecha_inicio: string;
  duracion_dias: number | null;
  propio: boolean | null;
  folio: string | null;
  servicio: string | null;
  nombre_trabajo: string | null;
  planta_nombre: string | null;
  estado: string | null;
  excepciones_dia?: DiaMovido[] | null;
};

export type AsignacionDisponibilidad = {
  planta_nombre: string;
  folio: string;
  servicio: string;
  propio: boolean;
  estado: string | null;
};

function addDaysStr(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Convierte las filas enmascaradas de disponibilidad_calendario en un registro
 * por día. Es la misma expansión laborable que usa Programación y su PDF.
 */
export function construirDisponibilidad(
  trabajos: TrabajoDisponibilidad[],
  desde: string,
  hasta: string,
): Array<{ fecha: string; ocupada: boolean; asignaciones: AsignacionDisponibilidad[] }> {
  const ocupados = new Set<string>();
  const asignacionesPorDia = new Map<string, AsignacionDisponibilidad[]>();

  for (const t of trabajos) {
    const propio = !!t.propio;
    const plantaNombre = t.planta_nombre ?? "Ocupado/Reservado";
    const folio = t.folio ?? "";
    const servicio = t.servicio ?? "";
    const nombreTrabajo = String(t.nombre_trabajo ?? "").trim();
    const servicioLabel = nombreTrabajo && servicio
      ? `${servicio} — ${nombreTrabajo}`
      : nombreTrabajo || servicio;
    const dias = diasOcupadosTrabajo({
      fecha_programada: t.fecha_inicio,
      duracion_dias: t.duracion_dias,
      excepciones_dia: t.excepciones_dia ?? [],
    });

    for (const fecha of dias) {
      // La base amplía deliberadamente la selección; la respuesta se limita
      // exactamente al rango solicitado.
      if (fecha < desde || fecha > hasta) continue;
      ocupados.add(fecha);
      if (!asignacionesPorDia.has(fecha)) asignacionesPorDia.set(fecha, []);
      asignacionesPorDia.get(fecha)!.push({
        planta_nombre: plantaNombre,
        folio,
        servicio: servicioLabel,
        propio,
        estado: t.estado ?? null,
      });
    }
  }

  const result: Array<{ fecha: string; ocupada: boolean; asignaciones: AsignacionDisponibilidad[] }> = [];
  let actual = desde;
  while (actual <= hasta) {
    result.push({
      fecha: actual,
      ocupada: ocupados.has(actual),
      asignaciones: asignacionesPorDia.get(actual) ?? [],
    });
    actual = addDaysStr(actual, 1);
  }
  return result;
}
