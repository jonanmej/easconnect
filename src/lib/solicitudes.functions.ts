import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDaysStr(s: string, n: number) {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

/** Para un rango [desde, hasta], retorna por cada día si hay trabajos ocupando ese día (basado en duracion_dias). */
export const getDisponibilidad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      desde: z.string(), // YYYY-MM-DD
      hasta: z.string(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Traemos trabajos cuya fecha_programada esté en una ventana extendida (hasta 30 días antes de "desde")
    const desdeExt = addDaysStr(data.desde, -30);
    const hastaPlus = addDaysStr(data.hasta, 1);
    const { data: trabajos, error } = await context.supabase
      .from("trabajos")
      .select("id, fecha_programada, duracion_dias, estado")
      .gte("fecha_programada", desdeExt + "T00:00:00Z")
      .lt("fecha_programada", hastaPlus + "T00:00:00Z")
      .neq("estado", "cancelado");
    if (error) throw new Error(error.message);

    // Marca cada día ocupado si algún trabajo cubre [start, start+duracion)
    const ocupados = new Set<string>();
    (trabajos ?? []).forEach((t: any) => {
      const start = new Date(t.fecha_programada);
      const dur = Math.max(1, Number(t.duracion_dias ?? 1));
      for (let i = 0; i < dur; i++) {
        const day = new Date(start);
        day.setUTCHours(0, 0, 0, 0);
        day.setUTCDate(day.getUTCDate() + i);
        ocupados.add(toISODate(day));
      }
    });

    const result: { fecha: string; ocupada: boolean }[] = [];
    let cur = data.desde;
    while (cur <= data.hasta) {
      result.push({ fecha: cur, ocupada: ocupados.has(cur) });
      cur = addDaysStr(cur, 1);
    }
    return result;
  });

export const listSolicitudes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("solicitudes_visita")
      .select("id, tipo, descripcion, fecha_preferida, duracion_dias_estimada, estado, respuesta_supervisor, trabajo_id, created_at, cliente_id, planta_id, clientes(nombre), plantas(nombre)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...r,
      cliente_nombre: r.clientes?.nombre ?? "—",
      planta_nombre: r.plantas?.nombre ?? "—",
    }));
  });

export const crearSolicitud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      planta_id: z.string().uuid(),
      tipo: z.string().min(1),
      descripcion: z.string().optional(),
      fecha_preferida: z.string().min(1),
      duracion_dias_estimada: z.coerce.number().int().min(1).max(60).default(1),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("solicitudes_visita")
      .insert({
        cliente_id: data.cliente_id,
        planta_id: data.planta_id,
        tipo: data.tipo,
        descripcion: data.descripcion ?? null,
        fecha_preferida: data.fecha_preferida,
        duracion_dias_estimada: data.duracion_dias_estimada,
        solicitado_por: context.userId,
        estado: "pendiente",
      }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const aprobarSolicitud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      fecha_programada: z.string().min(1),
      duracion_dias: z.coerce.number().int().min(1).max(60),
      servicio: z.string().min(1),
      tecnico_id: z.string().uuid().nullable().optional(),
      respuesta: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase;
    const { data: sol, error: sErr } = await supabase
      .from("solicitudes_visita")
      .select("planta_id, descripcion, estado").eq("id", data.id).single();
    if (sErr) throw new Error(sErr.message);
    if ((sol as any).estado !== "pendiente") throw new Error("Solo se pueden aprobar solicitudes pendientes");

    const folio = "T-" + Math.floor(100000 + Math.random() * 900000);
    const { data: trabajo, error: tErr } = await supabase
      .from("trabajos").insert({
        folio,
        planta_id: (sol as any).planta_id,
        servicio: data.servicio,
        fecha_programada: new Date(data.fecha_programada).toISOString(),
        estado: "programado",
        duracion_dias: data.duracion_dias,
        origen: "cliente",
        tecnico_id: data.tecnico_id ?? null,
        notas: (sol as any).descripcion ?? null,
      }).select().single();
    if (tErr) throw new Error(tErr.message);

    const { error: uErr } = await supabase.from("solicitudes_visita").update({
      estado: "convertida",
      trabajo_id: (trabajo as any).id,
      respuesta_supervisor: data.respuesta ?? "Solicitud aprobada y trabajo creado",
    }).eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true, trabajo_id: (trabajo as any).id };
  });

export const rechazarSolicitud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), respuesta: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("solicitudes_visita")
      .update({ estado: "rechazada", respuesta_supervisor: data.respuesta })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelarSolicitud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("solicitudes_visita").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });