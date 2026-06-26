import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureStaff(supabase: any, userId: string) {
  const [{ data: a }, { data: s }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "supervisor" }),
  ]);
  if (!a && !s) throw new Error("Solo administradores y supervisores");
  return { isAdmin: !!a, isSup: !!s };
}

async function logAuditoria(
  supabase: any,
  params: {
    reporte_id: string;
    accion: string;
    estado_anterior?: string | null;
    estado_nuevo?: string | null;
    version?: number | null;
    comentario?: string | null;
    actor?: string | null;
    snapshot?: any;
  },
) {
  await supabase.from("reporte_auditoria").insert({
    reporte_id: params.reporte_id,
    accion: params.accion,
    estado_anterior: params.estado_anterior ?? null,
    estado_nuevo: params.estado_nuevo ?? null,
    version: params.version ?? null,
    comentario: params.comentario ?? null,
    actor: params.actor ?? null,
    snapshot: params.snapshot ?? null,
  });
}

async function notificarWorkflow(
  tipo: "reporte_enviado" | "reporte_aprobado" | "reporte_rechazado",
  titulo: string,
  mensaje: string,
  excluirUserId: string,
) {
  try {
    const { notificarStaff } = await import("./notificaciones-staff.server");
    await notificarStaff({ tipo, titulo, mensaje, excluirUserId });
  } catch {
    /* silenciar */
  }
}

export const enviarReporteAprobacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), comentario: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureStaff(context.supabase, context.userId);
    const { data: rep } = await context.supabase
      .from("reportes").select("estado, version, titulo").eq("id", data.id).single();
    if (!rep) throw new Error("Reporte no encontrado");
    if ((rep as any).estado !== "borrador") throw new Error("Solo borradores pueden enviarse a aprobación");
    const { error } = await context.supabase.from("reportes").update({
      estado: "enviado",
      enviado_at: new Date().toISOString(),
      enviado_por: context.userId,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAuditoria(context.supabase, {
      reporte_id: data.id, accion: "enviar",
      estado_anterior: "borrador", estado_nuevo: "enviado",
      version: (rep as any).version, comentario: data.comentario ?? null, actor: context.userId,
    });
    await notificarWorkflow(
      "reporte_enviado",
      "Reporte enviado a aprobación",
      `El reporte "${(rep as any).titulo}" v${(rep as any).version} fue enviado a aprobación.`,
      context.userId,
    );
    return { ok: true };
  });

export const aprobarReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), comentario: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureStaff(context.supabase, context.userId);
    const { data: rep } = await context.supabase
      .from("reportes").select("estado, version, enviado_por, titulo").eq("id", data.id).single();
    if (!rep) throw new Error("Reporte no encontrado");
    if ((rep as any).estado !== "enviado") throw new Error("Solo reportes enviados pueden aprobarse");
    if ((rep as any).enviado_por && (rep as any).enviado_por === context.userId) {
      throw new Error("No puedes aprobar un reporte que tú mismo enviaste");
    }
    const { error } = await context.supabase.from("reportes").update({
      estado: "aprobado",
      aprobado_at: new Date().toISOString(),
      aprobado_por: context.userId,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAuditoria(context.supabase, {
      reporte_id: data.id, accion: "aprobar",
      estado_anterior: "enviado", estado_nuevo: "aprobado",
      version: (rep as any).version, comentario: data.comentario ?? null, actor: context.userId,
    });
    await notificarWorkflow(
      "reporte_aprobado",
      "Reporte aprobado",
      `El reporte "${(rep as any).titulo}" v${(rep as any).version} fue aprobado.`,
      context.userId,
    );
    return { ok: true };
  });

export const rechazarReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), motivo: z.string().min(4).max(500) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureStaff(context.supabase, context.userId);
    const { data: rep } = await context.supabase
      .from("reportes").select("estado, version, enviado_por, titulo").eq("id", data.id).single();
    if (!rep) throw new Error("Reporte no encontrado");
    if ((rep as any).estado !== "enviado") throw new Error("Solo reportes enviados pueden rechazarse");
    if ((rep as any).enviado_por && (rep as any).enviado_por === context.userId) {
      throw new Error("No puedes rechazar un reporte que tú mismo enviaste");
    }
    const { error } = await context.supabase.from("reportes").update({
      estado: "rechazado",
      rechazado_at: new Date().toISOString(),
      rechazado_por: context.userId,
      motivo_rechazo: data.motivo,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAuditoria(context.supabase, {
      reporte_id: data.id, accion: "rechazar",
      estado_anterior: "enviado", estado_nuevo: "rechazado",
      version: (rep as any).version, comentario: data.motivo, actor: context.userId,
    });
    await notificarWorkflow(
      "reporte_rechazado",
      "Reporte rechazado",
      `El reporte "${(rep as any).titulo}" v${(rep as any).version} fue rechazado: ${data.motivo}`,
      context.userId,
    );
    return { ok: true };
  });

export const crearNuevaVersionReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureStaff(context.supabase, context.userId);
    const { data: rep, error } = await context.supabase
      .from("reportes").select("*").eq("id", data.id).single();
    if (error || !rep) throw new Error("Reporte no encontrado");
    const r: any = rep;
    const nextVersion = (r.version ?? 1) + 1;
    const { data: nuevo, error: eIns } = await context.supabase.from("reportes").insert({
      cliente_id: r.cliente_id,
      planta_id: r.planta_id,
      periodo: r.periodo,
      titulo: r.titulo.replace(/\s*\(v\d+\)\s*$/i, "") + ` (v${nextVersion})`,
      contenido_markdown: r.contenido_markdown,
      insight_resumen: r.insight_resumen,
      estado: "borrador",
      generado_por: context.userId,
      model_used: r.model_used,
      version: nextVersion,
      reporte_padre_id: r.id,
    }).select().single();
    if (eIns) throw new Error(eIns.message);
    await logAuditoria(context.supabase, {
      reporte_id: (nuevo as any).id, accion: "nueva_version",
      estado_nuevo: "borrador", version: nextVersion,
      comentario: `Generado a partir del reporte ${r.id}`, actor: context.userId,
      snapshot: { padre_id: r.id, padre_version: r.version },
    });
    return nuevo;
  });

export const listAuditoriaReporte = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reporte_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("reporte_auditoria")
      .select("*")
      .eq("reporte_id", data.reporte_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.actor).filter(Boolean)));
    let perf = new Map<string, string>();
    if (ids.length) {
      const { data: ps } = await context.supabase.from("profiles").select("id, display_name").in("id", ids);
      perf = new Map((ps ?? []).map((p: any) => [p.id, p.display_name ?? "—"]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, actor_nombre: perf.get(r.actor) ?? "Sistema" }));
  });