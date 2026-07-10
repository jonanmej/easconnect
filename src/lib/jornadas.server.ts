import { sendGmail, emailLayout } from "./notifications.server";

type EventoTipo = "jornada_iniciada" | "jornada_finalizada" | "almuerzo_excedido";

function fmtHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-SV", {
    timeZone: "America/El_Salvador",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuracion(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/**
 * Notifica a admins y supervisores sobre eventos de jornada laboral.
 * Envía in-app + correo Gmail. Silencioso ante fallos individuales.
 */
export async function notificarJornadaEvento(opts: {
  tipo: EventoTipo;
  jornada: any;
  tecnicoId: string;
  extra?: Record<string, any>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Nombre del técnico
  let tecnicoNombre = "Técnico";
  try {
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("display_name").eq("id", opts.tecnicoId).maybeSingle();
    if (prof?.display_name) tecnicoNombre = prof.display_name;
  } catch { /* noop */ }

  // Admins/supervisores
  const { data: rows } = await supabaseAdmin
    .from("user_roles").select("user_id, role").in("role", ["admin", "supervisor"]);
  const userIds = Array.from(
    new Set((rows ?? []).map((r: any) => r.user_id as string)),
  ).filter((id) => id && id !== opts.tecnicoId);
  if (!userIds.length) return;

  const j = opts.jornada;
  const isExc = opts.tipo === "almuerzo_excedido";
  const isIni = opts.tipo === "jornada_iniciada";

  const titulo = isIni
    ? `Inicio de jornada · ${tecnicoNombre}`
    : isExc
      ? `⚠ Almuerzo excedido · ${tecnicoNombre}`
      : `Fin de jornada · ${tecnicoNombre}`;

  const detalleRows: string[] = [
    `<tr><td style="color:#64748b;padding:4px 8px;">Técnico</td><td style="padding:4px 8px;"><strong>${tecnicoNombre}</strong></td></tr>`,
    `<tr><td style="color:#64748b;padding:4px 8px;">Fecha</td><td style="padding:4px 8px;">${j.fecha}</td></tr>`,
    `<tr><td style="color:#64748b;padding:4px 8px;">Hora de inicio</td><td style="padding:4px 8px;">${fmtHora(j.hora_inicio)}</td></tr>`,
  ];
  if (opts.tipo !== "jornada_iniciada") {
    detalleRows.push(
      `<tr><td style="color:#64748b;padding:4px 8px;">Almuerzo</td><td style="padding:4px 8px;">${fmtHora(j.almuerzo_inicio)} – ${fmtHora(j.almuerzo_fin)}</td></tr>`,
    );
  }
  if (opts.tipo === "jornada_finalizada") {
    detalleRows.push(
      `<tr><td style="color:#64748b;padding:4px 8px;">Hora de fin</td><td style="padding:4px 8px;"><strong>${fmtHora(j.hora_fin)}</strong></td></tr>`,
      `<tr><td style="color:#64748b;padding:4px 8px;">Horas efectivas</td><td style="padding:4px 8px;"><strong>${fmtDuracion(opts.extra?.efectivosMin ?? 0)}</strong> (${opts.extra?.horasEfectivas ?? 0}h)</td></tr>`,
      `<tr><td style="color:#64748b;padding:4px 8px;">Tiempo de almuerzo</td><td style="padding:4px 8px;">${fmtDuracion(opts.extra?.almMin ?? 0)}${j.almuerzo_excedido ? ' <span style="color:#dc2626;font-weight:600;">(excedió el límite)</span>' : ""}</td></tr>`,
    );
  }
  if (opts.tipo === "almuerzo_excedido") {
    detalleRows.push(
      `<tr><td style="color:#64748b;padding:4px 8px;">Duración almuerzo</td><td style="padding:4px 8px;"><strong style="color:#dc2626;">${fmtDuracion(opts.extra?.minutos ?? 0)}</strong></td></tr>`,
    );
  }

  const alertaBanner = isExc
    ? `<div style="margin:0 0 14px;padding:12px 14px;background:#fee2e2;border-left:4px solid #dc2626;color:#7f1d1d;font-size:13px;border-radius:4px;">
         El almuerzo del técnico superó el límite de <strong>60 minutos</strong>. Revisa el registro y contacta al técnico si es necesario.
       </div>`
    : "";

  const intro = isIni
    ? `<p style="margin:0 0 12px;">El técnico <strong>${tecnicoNombre}</strong> inició su jornada laboral.</p>`
    : isExc
      ? `<p style="margin:0 0 12px;">Alerta de exceso de tiempo de almuerzo:</p>`
      : `<p style="margin:0 0 12px;">El técnico <strong>${tecnicoNombre}</strong> finalizó su jornada laboral.</p>`;

  const html = emailLayout(
    titulo,
    `${alertaBanner}${intro}
     <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:8px 0 12px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
       ${detalleRows.join("")}
     </table>
     ${j.notas ? `<p style="margin:0 0 12px;color:#475569;"><em>Notas del técnico:</em> ${j.notas}</p>` : ""}
     <p style="margin:0;color:#94a3b8;font-size:12px;">Puedes revisar el detalle en EA Service Connect.</p>`,
  );

  // 1) In-app
  try {
    const inserts = userIds.map((uid) => ({
      user_id: uid,
      tipo: opts.tipo,
      titulo,
      mensaje: isExc
        ? `${tecnicoNombre} excedió ${fmtDuracion(opts.extra?.minutos ?? 0)} en el almuerzo.`
        : isIni
          ? `${tecnicoNombre} inició jornada a las ${fmtHora(j.hora_inicio)}.`
          : `${tecnicoNombre} finalizó jornada · ${fmtDuracion(opts.extra?.efectivosMin ?? 0)} efectivas.`,
    }));
    await supabaseAdmin.from("notificaciones_usuario").insert(inserts);
  } catch (e) { console.warn("[jornada] in-app", e); }

  // 2) Correo
  try {
    const { data: usersList } = await (supabaseAdmin as any).auth.admin.listUsers({ perPage: 500 });
    const emailById = new Map<string, string>();
    for (const u of usersList?.users ?? []) {
      if (u?.id && u?.email) emailById.set(u.id, u.email);
    }
    const subject = `[EA Service Connect] ${titulo}`;
    await Promise.all(
      userIds.map((uid) => {
        const to = emailById.get(uid);
        if (!to) return Promise.resolve();
        return sendGmail({ to, subject, html }).catch(() => undefined);
      }),
    );
  } catch (e) { console.warn("[jornada] email", e); }
}

/**
 * Envía el resumen diario consolidado a admins y supervisores.
 * Se llama desde el hook cron.
 */
export async function enviarResumenDiarioJornadas() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });

  const { data: jornadas } = await supabaseAdmin
    .from("jornadas_laborales")
    .select("*")
    .eq("fecha", fecha)
    .order("hora_inicio", { ascending: true });

  if (!jornadas || jornadas.length === 0) {
    return { ok: true, fecha, jornadas: 0, correos: 0, mensaje: "Sin jornadas hoy" };
  }

  // Nombres
  const tecIds = Array.from(new Set(jornadas.map((j: any) => j.tecnico_id)));
  const { data: profs } = await supabaseAdmin
    .from("profiles").select("id, display_name").in("id", tecIds);
  const nombreById = new Map((profs ?? []).map((p: any) => [p.id, p.display_name ?? "Técnico"]));

  const filas = jornadas.map((j: any) => {
    const totalMin = j.hora_fin
      ? Math.round((new Date(j.hora_fin).getTime() - new Date(j.hora_inicio).getTime()) / 60000)
      : 0;
    const almMin = j.almuerzo_inicio && j.almuerzo_fin
      ? Math.round((new Date(j.almuerzo_fin).getTime() - new Date(j.almuerzo_inicio).getTime()) / 60000)
      : 0;
    const efMin = Math.max(0, totalMin - almMin);
    const estado = !j.hora_fin
      ? '<span style="color:#f59e0b;font-weight:600;">Abierta</span>'
      : j.almuerzo_excedido
        ? '<span style="color:#dc2626;font-weight:600;">Almuerzo excedido</span>'
        : '<span style="color:#059669;font-weight:600;">OK</span>';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${nombreById.get(j.tecnico_id) ?? "—"}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${fmtHora(j.hora_inicio)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${fmtHora(j.hora_fin)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${almMin}m</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-family:monospace;"><strong>${fmtDuracion(efMin)}</strong></td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${estado}</td>
    </tr>`;
  }).join("");

  const html = emailLayout(
    `Resumen de jornadas · ${fecha}`,
    `<p style="margin:0 0 12px;">Resumen consolidado de la jornada laboral de hoy (${jornadas.length} técnico${jornadas.length === 1 ? "" : "s"}):</p>
     <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;width:100%;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
       <thead>
         <tr style="background:#f1f5f9;color:#334155;text-align:left;">
           <th style="padding:8px;">Técnico</th>
           <th style="padding:8px;">Inicio</th>
           <th style="padding:8px;">Fin</th>
           <th style="padding:8px;">Almuerzo</th>
           <th style="padding:8px;">Efectivas</th>
           <th style="padding:8px;">Estado</th>
         </tr>
       </thead>
       <tbody>${filas}</tbody>
     </table>
     <p style="margin:14px 0 0;color:#94a3b8;font-size:12px;">Correo automático · EA Service Connect</p>`,
  );

  const { data: rows } = await supabaseAdmin
    .from("user_roles").select("user_id, role").in("role", ["admin", "supervisor"]);
  const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id as string)));
  const { data: usersList } = await (supabaseAdmin as any).auth.admin.listUsers({ perPage: 500 });
  const emailById = new Map<string, string>();
  for (const u of usersList?.users ?? []) {
    if (u?.id && u?.email) emailById.set(u.id, u.email);
  }
  const subject = `[EA Service Connect] Resumen de jornadas · ${fecha}`;
  let correos = 0;
  await Promise.all(
    userIds.map(async (uid) => {
      const to = emailById.get(uid);
      if (!to) return;
      const r = await sendGmail({ to, subject, html }).catch(() => undefined);
      if (r && (r as any).ok !== false) correos++;
    }),
  );

  return { ok: true, fecha, jornadas: jornadas.length, correos };
}