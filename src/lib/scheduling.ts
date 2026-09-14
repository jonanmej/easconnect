const SV_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isCleaningService(servicio?: string | null) {
  return String(servicio ?? "").toLocaleLowerCase("es").includes("limpieza");
}

function svDateKey(dateLike: string | Date) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return new Date(d.getTime() - SV_OFFSET_MS).toISOString().slice(0, 10);
}

function serviceDays(fechaIso: string, duracionDias: number) {
  const start = new Date(fechaIso).getTime();
  const dur = Math.max(1, Number(duracionDias || 1));
  const days = new Set<string>();
  for (let i = 0; i < dur; i++) days.add(svDateKey(new Date(start + i * DAY_MS)));
  return days;
}

/**
 * Ya no se restringe la programación por cliente: se pueden atender varios
 * clientes en la misma semana e incluso el mismo día. La única limitación real
 * es que no se repitan los técnicos ni los equipos asignados
 * (ver `findRecursoConflicts`).
 */
export async function findServiceClientConflicts(
  _supabase: any,
  _args: {
    plantaId: string;
    servicio: string;
    fechaProgramada: string;
    duracionDias?: number | null;
    excluirTrabajoId?: string | null;
  },
): Promise<any[]> {
  return [];
}

/** Alias retrocompatible. */
export const findCleaningClientConflicts = findServiceClientConflicts;

export function formatServiceClientConflict(conflicts: any[]) {
  const first = conflicts[0];
  const dias = Array.from(new Set(conflicts.flatMap((c) => c.dias ?? []))).sort().join(", ");
  return `Ya existe otro trabajo que usa los mismos recursos en esas fechas (${dias}). Conflicto: ${first?.folio ?? "OT"} · ${first?.cliente ?? "otro cliente"} · ${first?.planta ?? "planta"}.`;
}

export const formatCleaningClientConflict = formatServiceClientConflict;

export type RecursoConflicto = {
  id: string;
  folio: string;
  servicio: string;
  cliente: string;
  planta: string;
  fecha_programada: string;
  dias: string[];
  equipos: string[];
  tecnicos: string[];
};

/**
 * Busca trabajos que se solapen en días y compartan técnicos o equipos.
 * Devuelve [] si no hay recursos asignados o no hay solapamiento.
 */
export async function findRecursoConflicts(
  supabase: any,
  args: {
    tecnicoIds?: (string | null | undefined)[];
    equipoIds?: (string | null | undefined)[];
    fechaProgramada: string;
    duracionDias?: number | null;
    excluirTrabajoId?: string | null;
  },
): Promise<RecursoConflicto[]> {
  const tecnicos = new Set((args.tecnicoIds ?? []).filter(Boolean) as string[]);
  const equipos = new Set((args.equipoIds ?? []).filter(Boolean) as string[]);
  if (tecnicos.size === 0 && equipos.size === 0) return [];

  const dur = Math.max(1, Number(args.duracionDias ?? 1));
  const targetDays = serviceDays(args.fechaProgramada, dur);
  const start = new Date(args.fechaProgramada).getTime();
  const from = new Date(start - 90 * DAY_MS).toISOString();
  const to = new Date(start + (dur + 90) * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("trabajos")
    .select(
      "id, folio, servicio, fecha_programada, duracion_dias, estado, tecnico_id, equipo_id, plantas(nombre, clientes(nombre)), trabajo_tecnicos(tecnico_id), trabajo_equipos(equipo_id)",
    )
    .neq("estado", "cancelado")
    .gte("fecha_programada", from)
    .lte("fecha_programada", to);
  if (error) throw new Error(error.message);

  const out: RecursoConflicto[] = [];
  for (const t of (data ?? []) as any[]) {
    if (t.id === args.excluirTrabajoId) continue;
    const overlap = Array.from(serviceDays(t.fecha_programada, Number(t.duracion_dias ?? 1))).filter((d) =>
      targetDays.has(d),
    );
    if (overlap.length === 0) continue;

    const tOtros = new Set<string>(
      [t.tecnico_id, ...((t.trabajo_tecnicos ?? []).map((x: any) => x.tecnico_id))].filter(Boolean),
    );
    const eOtros = new Set<string>(
      [t.equipo_id, ...((t.trabajo_equipos ?? []).map((x: any) => x.equipo_id))].filter(Boolean),
    );
    const tecnicosChoque = Array.from(tecnicos).filter((x) => tOtros.has(x));
    const equiposChoque = Array.from(equipos).filter((x) => eOtros.has(x));
    if (tecnicosChoque.length === 0 && equiposChoque.length === 0) continue;

    out.push({
      id: t.id,
      folio: t.folio,
      servicio: t.servicio,
      cliente: t.plantas?.clientes?.nombre ?? "—",
      planta: t.plantas?.nombre ?? "—",
      fecha_programada: t.fecha_programada,
      dias: overlap.sort(),
      equipos: equiposChoque,
      tecnicos: tecnicosChoque,
    });
  }
  return out;
}

export function formatRecursoConflict(conflicts: RecursoConflicto[], nombreEquipo?: (id: string) => string) {
  const c = conflicts[0]!;
  const dias = Array.from(new Set(conflicts.flatMap((x) => x.dias))).sort().join(", ");
  const equipos = Array.from(new Set(conflicts.flatMap((x) => x.equipos)))
    .map((id) => (nombreEquipo ? nombreEquipo(id) : id))
    .filter(Boolean)
    .join(", ");
  const detalle = equipos ? ` El equipo ${equipos} ya está comprometido.` : " Los técnicos ya están asignados.";
  return `Los recursos seleccionados no están disponibles en esas fechas (${dias}).${detalle} Conflicto con ${c.folio} · ${c.cliente} · ${c.planta}. Cambia el equipo, el técnico o la fecha.`;
}
