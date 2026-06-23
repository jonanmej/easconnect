import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function b64url(str: string) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawEmail(opts: { from: string; to: string; subject: string; html: string }) {
  const boundary = "----=_Solaros_" + Math.random().toString(36).slice(2);
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.html,
    `--${boundary}--`,
  ].join("\r\n");
  return b64url(lines);
}

function renderHtml(opts: {
  titulo: string;
  preheader: string;
  saludo: string;
  bloques: string[];
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const bg = "#0F172A";
  const card = "#FFFFFF";
  const primary = "#F59E0B";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${opts.titulo}</title></head>
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">
<span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${opts.preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${card};border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr><td style="padding:24px 28px;background:#0f172a;color:#fff;">
        <div style="display:inline-block;width:30px;height:30px;background:${primary};border-radius:6px;vertical-align:middle;"></div>
        <span style="font-weight:700;letter-spacing:.04em;font-size:18px;margin-left:10px;vertical-align:middle;">EA Service Connect</span>
      </td></tr>
      <tr><td style="padding:28px;">
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${opts.titulo}</h1>
        <p style="margin:0 0 18px;font-size:14px;color:#475569;">${opts.saludo}</p>
        ${opts.bloques.map((b) => `<div style="font-size:14px;line-height:1.55;color:#1f2937;margin:0 0 14px;">${b}</div>`).join("")}
        ${opts.ctaUrl ? `<p style="margin:22px 0 0;"><a href="${opts.ctaUrl}" style="display:inline-block;background:${primary};color:#0f172a;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:8px;font-size:14px;">${opts.ctaLabel ?? "Ver detalle"}</a></p>` : ""}
      </td></tr>
      <tr><td style="padding:18px 28px;background:#f8fafc;color:#94a3b8;font-size:11px;text-align:center;border-top:1px solid #e2e8f0;">
        Este mensaje fue enviado automáticamente por EA Service Connect · proyectos@easervice.app
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

async function sendGmail(raw: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !gmailKey) {
    throw new Error("Conector Gmail no configurado");
  }
  const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmailKey,
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${res.status}: ${text.slice(0, 240)}`);
  }
  const j = (await res.json()) as { id?: string };
  return j.id ?? null;
}

async function ensureStaff(supabase: any, userId: string) {
  const [{ data: a }, { data: s }, { data: t }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "supervisor" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "tecnico" }),
  ]);
  if (!a && !s && !t) throw new Error("Solo el staff puede enviar notificaciones");
}

const FROM = "EA Service Connect Proyectos <proyectos@easervice.app>";

export const enviarNotificacionTrabajo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      trabajo_id: z.string().uuid(),
      destinatario_override: z.string().email().optional(),
      asunto_override: z.string().optional(),
      mensaje_extra: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureStaff(context.supabase, context.userId);
    const { data: trabajo, error } = await context.supabase
      .from("trabajos")
      .select("id, folio, servicio, estado, fecha_programada, notas, planta_id, plantas(nombre, cliente_id, email_notificaciones, notificaciones_completado, clientes(nombre, contacto))")
      .eq("id", data.trabajo_id)
      .single();
    if (error) throw new Error(error.message);
    const planta = (trabajo as any).plantas;
    const cliente = planta?.clientes;
    const destinatario = data.destinatario_override || planta?.email_notificaciones;
    if (!destinatario) throw new Error("La planta no tiene email de notificaciones configurado");
    const fechaTxt = new Date((trabajo as any).fecha_programada).toLocaleString("es-CL", { dateStyle: "long", timeStyle: "short" });
    const asunto = data.asunto_override ?? `EA Service Connect · ${(trabajo as any).estado === "completado" ? "Trabajo completado" : "Notificación"}: ${(trabajo as any).folio}`;
    const html = renderHtml({
      titulo: (trabajo as any).estado === "completado" ? "Trabajo completado en su planta" : "Actualización de trabajo",
      preheader: `${(trabajo as any).servicio} en ${planta?.nombre}`,
      saludo: `Estimado/a ${cliente?.contacto ?? cliente?.nombre ?? "cliente"},`,
      bloques: [
        `Le informamos sobre el siguiente trabajo en su planta <b>${planta?.nombre ?? ""}</b>:`,
        `<b>Folio:</b> ${(trabajo as any).folio}<br/><b>Servicio:</b> ${(trabajo as any).servicio}<br/><b>Estado:</b> ${(trabajo as any).estado}<br/><b>Fecha:</b> ${fechaTxt}`,
        data.mensaje_extra ?? "",
        (trabajo as any).notas ? `<b>Notas del técnico:</b><br/>${(trabajo as any).notas}` : "",
      ].filter(Boolean),
    });
    const raw = buildRawEmail({ from: FROM, to: destinatario, subject: asunto, html });
    let gmailId: string | null = null;
    let estado: "enviado" | "error" = "enviado";
    let errMsg: string | null = null;
    try {
      gmailId = await sendGmail(raw);
    } catch (e: any) {
      estado = "error";
      errMsg = e?.message?.slice(0, 800) ?? String(e);
    }
    await context.supabase.from("notificaciones_log").insert({
      trabajo_id: (trabajo as any).id,
      planta_id: planta?.id ?? (trabajo as any).planta_id,
      cliente_id: planta?.cliente_id ?? null,
      destinatario,
      asunto,
      tipo: (trabajo as any).estado === "completado" ? "completado" : "manual",
      estado,
      error_mensaje: errMsg,
      gmail_message_id: gmailId,
      enviado_por: context.userId,
    });
    if (estado === "error") throw new Error(errMsg ?? "Fallo el envío");
    return { ok: true, gmail_id: gmailId };
  });

export const enviarNotificacionReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      reporte_id: z.string().uuid(),
      destinatario_override: z.string().email().optional(),
      tipo: z.enum(["reporte_ejecutivo", "reporte_interno"]).default("reporte_ejecutivo"),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureStaff(context.supabase, context.userId);
    const { data: rep, error } = await context.supabase
      .from("reportes")
      .select("id, titulo, periodo, insight_resumen, cliente_id, planta_id, clientes(nombre, contacto), plantas(nombre, email_notificaciones)")
      .eq("id", data.reporte_id)
      .single();
    if (error) throw new Error(error.message);
    const dest = data.destinatario_override || (rep as any).plantas?.email_notificaciones;
    if (!dest) throw new Error("Sin email de destino. Configúralo en la ficha de la planta.");
    const asunto = `EA Service Connect · Reporte ${data.tipo === "reporte_ejecutivo" ? "Ejecutivo" : "Interno"}: ${(rep as any).titulo}`;
    const html = renderHtml({
      titulo: (rep as any).titulo,
      preheader: `Reporte ${(rep as any).periodo}`,
      saludo: `Estimado/a ${(rep as any).clientes?.contacto ?? (rep as any).clientes?.nombre ?? "cliente"},`,
      bloques: [
        `Adjuntamos el reporte <b>${(rep as any).periodo}</b> correspondiente a ${(rep as any).plantas?.nombre ? `la planta <b>${(rep as any).plantas?.nombre}</b>` : `el cliente <b>${(rep as any).clientes?.nombre}</b>`}.`,
        (rep as any).insight_resumen ?? "",
        `Para descargar el documento completo, inicie sesión en la plataforma EA Service Connect.`,
      ].filter(Boolean),
    });
    const raw = buildRawEmail({ from: FROM, to: dest, subject: asunto, html });
    let gid: string | null = null;
    let estado: "enviado" | "error" = "enviado";
    let err: string | null = null;
    try { gid = await sendGmail(raw); } catch (e: any) {
      estado = "error"; err = e?.message?.slice(0, 800) ?? String(e);
    }
    await context.supabase.from("notificaciones_log").insert({
      reporte_id: (rep as any).id,
      planta_id: (rep as any).planta_id,
      cliente_id: (rep as any).cliente_id,
      destinatario: dest,
      asunto,
      tipo: data.tipo,
      estado,
      error_mensaje: err,
      gmail_message_id: gid,
      enviado_por: context.userId,
    });
    if (estado === "enviado") {
      await context.supabase.from("reportes").update({
        estado: "enviado", enviado_at: new Date().toISOString(), enviado_a: dest,
      }).eq("id", (rep as any).id);
    }
    if (estado === "error") throw new Error(err ?? "Fallo el envío");
    return { ok: true };
  });

export const listNotificaciones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid().optional().nullable(),
      planta_id: z.string().uuid().optional().nullable(),
      desde: z.string().optional().nullable(),
      hasta: z.string().optional().nullable(),
      tipo: z.string().optional().nullable(),
      estado: z.string().optional().nullable(),
      limit: z.coerce.number().int().min(1).max(500).default(200),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("notificaciones_log")
      .select("id, destinatario, asunto, tipo, estado, error_mensaje, gmail_message_id, enviado_at, cliente_id, planta_id, trabajo_id, reporte_id, clientes(nombre), plantas(nombre)")
      .order("enviado_at", { ascending: false })
      .limit(data.limit);
    if (data.cliente_id) q = q.eq("cliente_id", data.cliente_id);
    if (data.planta_id) q = q.eq("planta_id", data.planta_id);
    if (data.tipo) q = q.eq("tipo", data.tipo);
    if (data.estado) q = q.eq("estado", data.estado);
    if (data.desde) q = q.gte("enviado_at", data.desde);
    if (data.hasta) q = q.lte("enviado_at", data.hasta);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      ...r,
      cliente_nombre: r.clientes?.nombre ?? "—",
      planta_nombre: r.plantas?.nombre ?? null,
    }));
  });

export const reintentarNotificacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureStaff(context.supabase, context.userId);
    const { data: log, error } = await context.supabase
      .from("notificaciones_log").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    if ((log as any).trabajo_id) {
      return await enviarNotificacionTrabajo({
        data: { trabajo_id: (log as any).trabajo_id, destinatario_override: (log as any).destinatario },
      } as any);
    }
    if ((log as any).reporte_id) {
      return await enviarNotificacionReporte({
        data: {
          reporte_id: (log as any).reporte_id,
          destinatario_override: (log as any).destinatario,
          tipo: ((log as any).tipo === "reporte_interno" ? "reporte_interno" : "reporte_ejecutivo"),
        },
      } as any);
    }
    throw new Error("Notificación sin referencia válida para reintentar");
  });