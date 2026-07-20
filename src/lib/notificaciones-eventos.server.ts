import { sendGmail, emailLayout, formatFechaEs } from "./notifications.server";

type Evento = "creado" | "reprogramado" | "cancelado";

const TITULOS: Record<Evento, string> = {
  creado: "Nuevo trabajo programado",
  reprogramado: "Trabajo reprogramado",
  cancelado: "Trabajo cancelado",
};

/**
 * Envía notificaciones (in-app + correo) a técnicos asignados y al correo
 * de contacto registrado en la ficha del cliente cuando un trabajo se
 * crea, reprograma o cancela. No lanza — cada canal es best-effort.
 */
export async function notificarEventoTrabajo(opts: {
  evento: Evento;
  trabajoId: string;
  actorId?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: trabajo } = await supabaseAdmin
    .from("trabajos")
    .select(
      "id, folio, servicio, fecha_programada, duracion_dias, notas, tecnico_id, plantas(nombre, clientes(nombre, email))",
    )
    .eq("id", opts.trabajoId)
    .single();
  if (!trabajo) return;
  const t: any = trabajo;
  const planta = t.plantas?.nombre ?? "—";
  const cliente = t.plantas?.clientes?.nombre ?? "—";
  const clienteEmail: string | null = t.plantas?.clientes?.email ?? null;
  const fechaIni = new Date(t.fecha_programada);
  const dur = Math.max(1, Number(t.duracion_dias ?? 1));
  const fechaFin = new Date(fechaIni);
  fechaFin.setUTCDate(fechaFin.getUTCDate() + dur - 1);
  const rango = dur > 1 ? `${formatFechaEs(fechaIni)} → ${formatFechaEs(fechaFin)}` : formatFechaEs(fechaIni);
  const titulo = TITULOS[opts.evento];
  const mensajeCorto = `${t.folio} · ${t.servicio} · ${planta} · ${rango}`;

  // Recolectar destinatarios técnicos: principal + extras (trabajo_tecnicos)
  const tecnicoIds = new Set<string>();
  if (t.tecnico_id) tecnicoIds.add(t.tecnico_id);
  try {
    const { data: extras } = await supabaseAdmin
      .from("trabajo_tecnicos").select("tecnico_id").eq("trabajo_id", t.id);
    for (const r of (extras ?? []) as any[]) if (r?.tecnico_id) tecnicoIds.add(r.tecnico_id);
  } catch { /* ignore */ }

  // Notificaciones in-app para técnicos
  for (const uid of tecnicoIds) {
    if (opts.actorId && uid === opts.actorId) continue;
    try {
      await supabaseAdmin.from("notificaciones_usuario").insert({
        user_id: uid,
        tipo: `trabajo_${opts.evento}`,
        titulo,
        mensaje: mensajeCorto,
        trabajo_id: opts.evento === "cancelado" ? null : t.id,
      });
    } catch { /* ignore */ }
  }

  const bodyIntro = opts.evento === "cancelado"
    ? "Se ha cancelado el siguiente trabajo:"
    : opts.evento === "reprogramado"
      ? "Se ha reprogramado el siguiente trabajo:"
      : "Se ha programado un nuevo trabajo:";

  const tabla = `
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin-bottom:12px;">
      <tr><td style="color:#64748b;">Folio</td><td><strong>${t.folio}</strong></td></tr>
      <tr><td style="color:#64748b;">Servicio</td><td>${t.servicio}</td></tr>
      <tr><td style="color:#64748b;">Cliente</td><td>${cliente}</td></tr>
      <tr><td style="color:#64748b;">Planta</td><td>${planta}</td></tr>
      <tr><td style="color:#64748b;">Fecha</td><td><strong>${rango}</strong></td></tr>
    </table>`;

  // Correos a técnicos
  for (const uid of tecnicoIds) {
    try {
      const { data: u } = await (supabaseAdmin as any).auth.admin.getUserById(uid);
      const email: string | null = u?.user?.email ?? null;
      if (!email) continue;
      const html = emailLayout(
        titulo,
        `<p style="margin:0 0 12px;">${bodyIntro}</p>${tabla}
         ${t.notas ? `<p style="margin:0 0 12px;color:#475569;"><em>Notas:</em> ${t.notas}</p>` : ""}
         <p style="margin:0;color:#475569;">Ingresa a EA Service Connect para revisar los detalles.</p>`,
      );
      await sendGmail({ to: email, subject: `[EA Service Connect] ${titulo} · ${t.folio}`, html }).catch(() => {});
    } catch { /* ignore */ }
  }

  // Correo al contacto del cliente (ficha)
  if (clienteEmail) {
    try {
      const html = emailLayout(
        titulo,
        `<p style="margin:0 0 12px;">Estimado cliente, le informamos que ${bodyIntro.toLowerCase()}</p>${tabla}
         <p style="margin:0;color:#475569;">Para más información, contacte a su ejecutivo asignado.</p>`,
      );
      await sendGmail({
        to: clienteEmail,
        subject: `[EA Service Connect] ${titulo} · ${cliente}`,
        html,
      }).catch(() => {});
    } catch { /* ignore */ }
  }
}
