import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findCleaningClientConflicts, formatCleaningClientConflict } from "@/lib/scheduling";

const APP_URL = "https://easconnect.lovable.app";

function esc(s: string) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as any)[c] ?? c);
}

async function notificarStaffNuevaSolicitud(opts: {
  tipo: string;
  planta_nombre: string;
  cliente_nombre: string;
  fecha_preferida: string;
  descripcion?: string | null;
  solicitante_email?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendGmail, emailLayout } = await import("@/lib/notifications.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "supervisor"]);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (!ids.length) return;
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emails = (list?.users ?? [])
      .filter((u) => ids.includes(u.id) && !!u.email)
      .map((u) => u.email as string);
    if (!emails.length) return;
    const html = emailLayout(
      "Nueva solicitud de visita",
      `
        <p style="margin:0 0 10px;">El cliente <b>${esc(opts.cliente_nombre)}</b> envió una solicitud de visita para la planta <b>${esc(opts.planta_nombre)}</b>.</p>
        <p style="margin:0 0 6px;"><b>Tipo:</b> ${esc(opts.tipo)}</p>
        <p style="margin:0 0 6px;"><b>Fecha solicitada:</b> ${esc(opts.fecha_preferida)}</p>
        ${opts.solicitante_email ? `<p style="margin:0 0 6px;"><b>Solicitante:</b> ${esc(opts.solicitante_email)}</p>` : ""}
        ${opts.descripcion ? `<p style="margin:10px 0 0;color:#475569;"><b>Motivo:</b> ${esc(opts.descripcion)}</p>` : ""}
        <p style="margin:16px 0 0;">
          <a href="${APP_URL}/solicitudes" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:6px;font-size:13px;">Revisar solicitud</a>
        </p>
      `,
    );
    await Promise.allSettled(
      emails.map((to) =>
        sendGmail({ to, subject: "EA Service Connect · Nueva solicitud de visita", html, categoria: "solicitudes_visita" }),
      ),
    );
  } catch (e) {
    console.warn("[solicitudes] No se pudo notificar a staff", e);
  }
}

async function notificarClienteResultado(opts: {
  solicitado_por: string | null;
  aprobada: boolean;
  tipo: string;
  planta_nombre: string;
  fecha: string;
  mensaje?: string | null;
}) {
  try {
    if (!opts.solicitado_por) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendGmail, emailLayout } = await import("@/lib/notifications.server");
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(opts.solicitado_por);
    const email = u?.user?.email;
    if (!email) return;
    const titulo = opts.aprobada ? "Solicitud aprobada" : "Solicitud rechazada";
    const color = opts.aprobada ? "#10b981" : "#ef4444";
    const html = emailLayout(
      titulo,
      `
        <p style="margin:0 0 10px;">Su solicitud de visita para <b>${esc(opts.planta_nombre)}</b> (${esc(opts.tipo)}) ha sido <b style="color:${color}">${opts.aprobada ? "aprobada" : "rechazada"}</b>.</p>
        <p style="margin:0 0 6px;"><b>Fecha:</b> ${esc(opts.fecha)}</p>
        ${opts.mensaje ? `<p style="margin:10px 0 0;color:#475569;"><b>Mensaje:</b> ${esc(opts.mensaje)}</p>` : ""}
        <p style="margin:16px 0 0;">
          <a href="${APP_URL}/solicitudes" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:6px;font-size:13px;">Ver detalles</a>
        </p>
      `,
    );
    await sendGmail({ to: email, subject: `EA Service Connect · ${titulo}`, html, categoria: "solicitudes_visita" });
  } catch (e) {
    console.warn("[solicitudes] No se pudo notificar al cliente", e);
  }
}

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
    const desdeExt = addDaysStr(data.desde, -30);
    const hastaPlus = addDaysStr(data.hasta, 1);

    // Determinar si el usuario es cliente para saber si "propio" aplica.
    const { data: prof } = await context.supabase
      .from("profiles").select("cliente_id").eq("id", context.userId).maybeSingle();
    const clienteId = (prof as any)?.cliente_id ?? null;

    // Para que el calendario del cliente refleje TODA la ocupación (no solo
    // sus propios trabajos) usamos el cliente admin: los clientes solo verán
    // que el día está reservado, sin datos de otros clientes.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const dataClient = clienteId ? supabaseAdmin : context.supabase;
    const { data: trabajos, error } = await dataClient
      .from("trabajos")
      .select("id, fecha_programada, duracion_dias, estado, folio, servicio, planta_id, plantas(nombre, cliente_id)")
      .gte("fecha_programada", desdeExt + "T00:00:00Z")
      .lt("fecha_programada", hastaPlus + "T00:00:00Z")
      .neq("estado", "cancelado");
    if (error) throw new Error(error.message);

    const ocupados = new Set<string>();
    const asignacionesPorDia = new Map<string, Array<{ planta_nombre: string; folio: string; servicio: string; propio: boolean }>>();
    (trabajos ?? []).forEach((t: any) => {
      const start = new Date(t.fecha_programada);
      const dur = Math.max(1, Number(t.duracion_dias ?? 1));
      const trabajoClienteId = t.plantas?.cliente_id ?? null;
      const propio = clienteId ? trabajoClienteId === clienteId : true;
      const plantaNombre = propio ? (t.plantas?.nombre ?? "—") : "Reservado";
      const folio = propio ? (t.folio ?? "") : "";
      const servicio = propio ? (t.servicio ?? "") : "";
      for (let i = 0; i < dur; i++) {
        const day = new Date(start);
        day.setUTCHours(0, 0, 0, 0);
        day.setUTCDate(day.getUTCDate() + i);
        const key = toISODate(day);
        ocupados.add(key);
        if (!asignacionesPorDia.has(key)) asignacionesPorDia.set(key, []);
        asignacionesPorDia.get(key)!.push({ planta_nombre: plantaNombre, folio, servicio, propio });
      }
    });

    const result: { fecha: string; ocupada: boolean; asignaciones: Array<{ planta_nombre: string; folio: string; servicio: string; propio: boolean }> }[] = [];
    let cur = data.desde;
    while (cur <= data.hasta) {
      result.push({
        fecha: cur,
        ocupada: ocupados.has(cur),
        asignaciones: asignacionesPorDia.get(cur) ?? [],
      });
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
    // Notificar a admin/supervisores (mejor esfuerzo)
    try {
      const { data: ctx } = await context.supabase
        .from("solicitudes_visita")
        .select("clientes(nombre), plantas(nombre)")
        .eq("id", (row as any).id)
        .single();
      const { data: u } = await context.supabase.auth.getUser();
      await notificarStaffNuevaSolicitud({
        tipo: data.tipo,
        planta_nombre: (ctx as any)?.plantas?.nombre ?? "—",
        cliente_nombre: (ctx as any)?.clientes?.nombre ?? "—",
        fecha_preferida: data.fecha_preferida,
        descripcion: data.descripcion ?? null,
        solicitante_email: u?.user?.email ?? null,
      });
    } catch {}
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
      .select("planta_id, descripcion, estado, tipo, solicitado_por, plantas(nombre)").eq("id", data.id).single();
    if (sErr) throw new Error(sErr.message);
    if ((sol as any).estado !== "pendiente") throw new Error("Solo se pueden aprobar solicitudes pendientes");

    const fechaProgramada = new Date(data.fecha_programada).toISOString();
    const conflictosLimpieza = await findCleaningClientConflicts(supabase, {
      plantaId: (sol as any).planta_id,
      servicio: data.servicio,
      fechaProgramada,
      duracionDias: data.duracion_dias,
    });
    if (conflictosLimpieza.length > 0) {
      throw new Error(formatCleaningClientConflict(conflictosLimpieza));
    }

    const folio = "T-" + Math.floor(100000 + Math.random() * 900000);
    const { data: trabajo, error: tErr } = await supabase
      .from("trabajos").insert({
        folio,
        planta_id: (sol as any).planta_id,
        servicio: data.servicio,
        fecha_programada: fechaProgramada,
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
    await notificarClienteResultado({
      solicitado_por: (sol as any).solicitado_por ?? null,
      aprobada: true,
      tipo: (sol as any).tipo ?? data.servicio,
      planta_nombre: (sol as any).plantas?.nombre ?? "—",
      fecha: new Date(data.fecha_programada).toLocaleString("es-SV", { timeZone: "America/El_Salvador" }),
      mensaje: data.respuesta ?? null,
    });
    return { ok: true, trabajo_id: (trabajo as any).id };
  });

export const rechazarSolicitud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), respuesta: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: sol } = await context.supabase
      .from("solicitudes_visita")
      .select("tipo, fecha_preferida, solicitado_por, plantas(nombre)")
      .eq("id", data.id)
      .single();
    const { error } = await context.supabase.from("solicitudes_visita")
      .update({ estado: "rechazada", respuesta_supervisor: data.respuesta })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (sol) {
      await notificarClienteResultado({
        solicitado_por: (sol as any).solicitado_por ?? null,
        aprobada: false,
        tipo: (sol as any).tipo ?? "—",
        planta_nombre: (sol as any).plantas?.nombre ?? "—",
        fecha: (sol as any).fecha_preferida ?? "—",
        mensaje: data.respuesta,
      });
    }
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