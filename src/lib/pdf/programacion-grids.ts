import { isoWeek } from "@/lib/semana-iso";
import { esNoLaborableSV, motivoNoLaborableSV } from "@/lib/dias-habiles";
import { diasOcupadosDesdeClave, diasOcupadosTrabajo } from "@/lib/dias-ocupados";
import { etiquetaTrabajo } from "@/lib/servicios";

export type Vista = "semana" | "mes" | "anio";

export function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lunes = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isWorkday(d: Date) {
  return !esNoLaborableSV(d);
}

export function addWorkdays(start: Date, workdays: number) {
  // Mantiene la API de fechas locales del calendario, pero delega la regla de
  // expansión al mismo helper usado por disponibilidad y el panel del técnico.
  return diasOcupadosDesdeClave(toISODateLocal(start), workdays)
    .map((fecha) => new Date(`${fecha}T00:00:00`));
}

export function toISODateLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Construye los datos para las cuadrículas de calendario del PDF a partir
 * de la lista de trabajos ya filtrada. Reaplica la misma lógica de
 * expansión por días laborables (L-V) y excepciones de día usada en la UI.
 */
export function buildCalendarGrids(vista: Vista, cursor: Date, trabajos: any[], ocupadosAjenos?: Set<string>) {
  const byDay = new Map<string, any[]>();
  trabajos.forEach((t) => {
    const dur = Math.max(1, Number(t.duracion_dias ?? 1));
    const dias = diasOcupadosTrabajo({
      fecha_programada: t.fecha_programada,
      duracion_dias: dur,
      excepciones_dia: (t.excepciones_dia as any[]) ?? [],
    });
    dias.forEach((key, i) => {
      const efectiva = new Date(`${key}T00:00:00`);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push({
        ...t,
        __diaIdx: i,
        __duracion: dur,
        __fechaEfectiva: efectiva,
      });
    });
  });

  function toItem(t: any) {
    const d = t.__fechaEfectiva ?? new Date(t.fecha_programada);
    return {
      id: t.id,
      folio: t.folio,
      servicio: etiquetaTrabajo(t),
      estado: t.estado,
      cliente_id: t.cliente_id ?? null,
      cliente_nombre: t.cliente_nombre ?? null,
      pausada: !!t.pausada_at,
      planta_nombre: t.planta_nombre ?? null,
      hora: d.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" }),
      dia_idx: t.__diaIdx ?? 0,
      duracion: t.__duracion ?? 1,
    };
  }

  function itemsFor(d: Date) {
    const key = toISODateLocal(d);
    const arr = byDay.get(key) ?? [];
    return arr
      .slice()
      .sort((a, b) => +new Date(a.fecha_programada) - +new Date(b.fecha_programada))
      .map(toItem);
  }

  if (vista === "semana") {
    const dias = Array.from({ length: 7 }, (_, i) => addDays(cursor, i)).map((d) => ({
      fecha: toISODateLocal(d),
      in_month: true,
      feriado: motivoNoLaborableSV(d) === "feriado",
      no_disponible: ocupadosAjenos?.has(toISODateLocal(d)) ?? false,
      items: itemsFor(d),
    }));
    return { semana_dias: dias, mes_semanas: undefined, mes_columnas: undefined, anio_dias: undefined, anio: undefined, anio_no_disponible: undefined };
  }

  if (vista === "mes") {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const firstMonday = startOfWeek(monthStart);
    const semanas: { semana_numero: number; dias: any[] }[] = [];
    let curD = firstMonday;
    while (curD <= monthEnd || semanas.length < 5) {
      const row = Array.from({ length: 7 }, (_, i) => addDays(curD, i));
      semanas.push({
        semana_numero: isoWeek(row[0]),
        dias: row.map((d) => ({
          fecha: toISODateLocal(d),
          in_month: d.getMonth() === cursor.getMonth(),
          feriado: motivoNoLaborableSV(d) === "feriado",
          no_disponible: ocupadosAjenos?.has(toISODateLocal(d)) ?? false,
          items: itemsFor(d),
        })),
      });
      curD = addDays(curD, 7);
      if (semanas.length >= 6) break;
    }
    return {
      semana_dias: undefined,
      mes_semanas: semanas,
      mes_columnas: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
      anio_dias: undefined,
      anio: undefined,
      anio_no_disponible: undefined,
    };
  }

  // Vista año: por cada día, la clave de color (cliente) de cada trabajo.
  const anio_dias: Record<string, { cliente_id: string | null; cliente_nombre: string | null }[]> = {};
  const y = cursor.getFullYear();
  byDay.forEach((arr, key) => {
    if (!key.startsWith(`${y}-`)) return;
    anio_dias[key] = arr.map((t) => ({ cliente_id: t.cliente_id ?? null, cliente_nombre: t.cliente_nombre ?? null }));
  });
  const anio_no_disponible = ocupadosAjenos ? [...ocupadosAjenos].filter((k) => k.startsWith(`${y}-`)).sort() : undefined;
  return { semana_dias: undefined, mes_semanas: undefined, mes_columnas: undefined, anio_dias, anio: y, anio_no_disponible };
}


/**
 * Respuesta de getDisponibilidad (que envuelve la función de base de datos
 * disponibilidad_calendario): un registro por día con sus asignaciones; las
 * de otros clientes llegan enmascaradas (propio = false). Devuelve solo las
 * fechas ocupadas por otros clientes — sin ningún dato de esas OT.
 */
export function diasOcupadosAjenos(
  dias: Array<{ fecha: string; asignaciones?: Array<{ propio?: boolean | null }> | null }> | null | undefined,
): Set<string> {
  const out = new Set<string>();
  (dias ?? []).forEach((d) => {
    if ((d.asignaciones ?? []).some((a) => !a.propio)) out.add(d.fecha);
  });
  return out;
}
