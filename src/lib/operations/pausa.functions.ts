import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRol } from "@/lib/auth-roles";
import { validarDiaLaborable, validarEquiposDisponibles } from "./helpers";

const SOLO_ADMIN = ["admin"] as const;

/**
 * Pausa OT programadas (por falta de confirmación del cliente). Se pueden
 * indicar OT sueltas o un cliente completo. Las OT pausadas salen del
 * calendario y liberan su equipo hasta que se reanudan con fecha nueva.
 */
export const pausarTrabajos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        trabajoIds: z.array(z.string().uuid()).max(500).optional(),
        clienteId: z.string().uuid().optional(),
        motivo: z.string().trim().min(3).max(500),
      })
      .refine((v) => (v.trabajoIds?.length ?? 0) > 0 || !!v.clienteId, "Indica las OT o el cliente.")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireRol(context.supabase, context.userId, [...SOLO_ADMIN]);
    let ids = data.trabajoIds ?? [];
    if (data.clienteId) {
      const { data: plantas, error: pe } = await context.supabase
        .from("plantas").select("id").eq("cliente_id", data.clienteId);
      if (pe) throw new Error(pe.message);
      const plantaIds = (plantas ?? []).map((p) => p.id);
      if (plantaIds.length === 0) return { pausadas: 0 };
      const { data: ts, error: te } = await context.supabase
        .from("trabajos").select("id").in("planta_id", plantaIds)
        .eq("estado", "programado").is("pausada_at", null);
      if (te) throw new Error(te.message);
      ids = Array.from(new Set([...ids, ...(ts ?? []).map((t) => t.id)]));
    }
    if (ids.length === 0) return { pausadas: 0 };
    const { data: upd, error } = await context.supabase
      .from("trabajos")
      .update({ pausada_at: new Date().toISOString(), pausa_motivo: data.motivo, pausada_por: context.userId })
      .in("id", ids)
      .eq("estado", "programado")
      .is("pausada_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return { pausadas: upd?.length ?? 0 };
  });

/** Reanuda una OT pausada con una fecha de inicio nueva elegida a mano. */
export const reanudarTrabajo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        emergencia: z.object({ permitir: z.boolean().optional(), motivo: z.string().nullable().optional() }).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireRol(context.supabase, context.userId, [...SOLO_ADMIN]);
    const { data: t, error: te } = await context.supabase
      .from("trabajos")
      .select("id, fecha_programada, duracion_dias, equipo_id, pausada_at, notas, trabajo_equipos(equipo_id)")
      .eq("id", data.id)
      .single();
    if (te || !t) throw new Error(te?.message ?? "OT no encontrada");
    if (!t.pausada_at) throw new Error("Esta OT no está en pausa.");
    // Conserva la hora original; sólo cambia el día.
    const hora = new Date(t.fecha_programada).toISOString().slice(10);
    const nuevaFecha = `${data.fecha}${hora}`;
    const exc = await validarDiaLaborable(context.supabase, context.userId, nuevaFecha, data.emergencia, "reanudar la OT");
    const equipoIds = [t.equipo_id, ...((t as any).trabajo_equipos ?? []).map((e: any) => e.equipo_id)];
    await validarEquiposDisponibles(context.supabase, {
      equipoIds,
      fechaProgramada: nuevaFecha,
      duracionDias: t.duracion_dias,
      excluirTrabajoId: t.id,
    });
    const nota = exc ? `⚠ Reanudada en ${exc.motivo} (${data.fecha}): ${exc.justificacion}` : null;
    const { error } = await context.supabase
      .from("trabajos")
      .update({
        fecha_programada: nuevaFecha,
        pausada_at: null,
        pausa_motivo: null,
        pausada_por: null,
        ...(nota ? { notas: [t.notas, nota].filter(Boolean).join("\n") } : {}),
      })
      .eq("id", t.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
