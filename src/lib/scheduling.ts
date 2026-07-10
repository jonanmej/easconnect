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

function normalizeServicio(s?: string | null) {
  return String(s ?? "").trim().toLocaleLowerCase("es");
}

/**
 * Busca conflictos de programación: mismo servicio, mismo día(s), pero de otro cliente.
 * No aplica cuando ambas OT pertenecen al mismo cliente (aunque sean plantas distintas).
 */
export async function findServiceClientConflicts(
  supabase: any,
  args: {
    plantaId: string;
    servicio: string;
    fechaProgramada: string;
    duracionDias?: number | null;
    excluirTrabajoId?: string | null;
  },
) {
  if (!args.plantaId || !args.servicio) return [];
  const servicioNorm = normalizeServicio(args.servicio);

  const { data: planta } = await supabase
    .from("plantas")
    .select("cliente_id, clientes(nombre)")
    .eq("id", args.plantaId)
    .single();
  const clienteId = (planta as any)?.cliente_id;
  if (!clienteId) return [];

  const targetDays = serviceDays(args.fechaProgramada, Number(args.duracionDias ?? 1));
  const start = new Date(args.fechaProgramada).getTime();
  const from = new Date(start - 60 * DAY_MS).toISOString();
  const to = new Date(start + (Number(args.duracionDias ?? 1) + 60) * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("trabajos")
    .select("id, folio, servicio, fecha_programada, duracion_dias, estado, plantas(nombre, cliente_id, clientes(nombre))")
    .neq("estado", "cancelado")
    .gte("fecha_programada", from)
    .lte("fecha_programada", to);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((t: any) => t.id !== args.excluirTrabajoId)
    .filter((t: any) => normalizeServicio(t.servicio) === servicioNorm)
    .filter((t: any) => t.plantas?.cliente_id && t.plantas.cliente_id !== clienteId)
    .map((t: any) => {
      const overlap = Array.from(serviceDays(t.fecha_programada, Number(t.duracion_dias ?? 1)))
        .filter((d) => targetDays.has(d));
      if (overlap.length === 0) return null;
      return {
        id: t.id,
        folio: t.folio,
        servicio: t.servicio,
        cliente: t.plantas?.clientes?.nombre ?? "—",
        planta: t.plantas?.nombre ?? "—",
        fecha_programada: t.fecha_programada,
        dias: overlap,
      };
    })
    .filter(Boolean);
}

/** Alias retrocompatible. */
export const findCleaningClientConflicts = findServiceClientConflicts;

export function formatServiceClientConflict(conflicts: any[]) {
  const first = conflicts[0];
  const dias = Array.from(new Set(conflicts.flatMap((c) => c.dias ?? []))).sort().join(", ");
  const servicio = first?.servicio ?? "servicio";
  return `Ya existe otro cliente con "${servicio}" programado el mismo día (${dias}). Conflicto: ${first?.folio ?? "OT"} · ${first?.cliente ?? "otro cliente"} · ${first?.planta ?? "planta"}. Elige otro día o coordina con el cliente.`;
}

export const formatCleaningClientConflict = formatServiceClientConflict;