import { sendGmail, emailLayout, formatFechaEs } from "./notifications.server";

export async function notificarAsignacionTecnico(opts: {
  tecnicoId: string;
  trabajoId: string;
  reasignacion: boolean;
  asignadoPor?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Datos del trabajo
  const { data: trabajo } = await supabaseAdmin
    .from("trabajos")
    .select(
      "id, folio, servicio, fecha_programada, duracion_dias, notas, plantas(nombre, clientes(nombre))",
    )
    .eq("id", opts.trabajoId)
    .single();
  if (!trabajo) return;

  // Email del técnico (auth.users)
  let email: string | null = null;
  try {
    const { data: u } = await (supabaseAdmin as any).auth.admin.getUserById(opts.tecnicoId);
    email = u?.user?.email ?? null;
  } catch { email = null; }

  const t: any = trabajo;
  const planta = t.plantas?.nombre ?? "—";
  const cliente = t.plantas?.clientes?.nombre ?? "—";
  const fechaIni = new Date(t.fecha_programada);
  const dur = Math.max(1, Number(t.duracion_dias ?? 1));
  const fechaFin = new Date(fechaIni);
  fechaFin.setUTCDate(fechaFin.getUTCDate() + dur - 1);
  const titulo = opts.reasignacion ? "Te reasignaron un trabajo" : "Tienes un nuevo trabajo asignado";
  const rango = dur > 1 ? `${formatFechaEs(fechaIni)} → ${formatFechaEs(fechaFin)}` : formatFechaEs(fechaIni);

  // Notificación in-app (push interno)
  try {
    await supabaseAdmin.from("notificaciones_usuario").insert({
      user_id: opts.tecnicoId,
      tipo: opts.reasignacion ? "reasignacion" : "asignacion",
      titulo,
      mensaje: `${t.folio} · ${t.servicio} · ${planta} · ${rango}`,
      trabajo_id: t.id,
    });
  } catch { /* silenciar */ }

  // Email
  if (email) {
    const html = emailLayout(
      titulo,
      `<p style="margin:0 0 12px;">Hola, se te ha ${opts.reasignacion ? "reasignado" : "asignado"} el siguiente trabajo:</p>
       <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin-bottom:12px;">
         <tr><td style="color:#64748b;">Folio</td><td><strong>${t.folio}</strong></td></tr>
         <tr><td style="color:#64748b;">Servicio</td><td>${t.servicio}</td></tr>
         <tr><td style="color:#64748b;">Cliente</td><td>${cliente}</td></tr>
         <tr><td style="color:#64748b;">Planta</td><td>${planta}</td></tr>
         <tr><td style="color:#64748b;">Fecha</td><td><strong>${rango}</strong></td></tr>
         <tr><td style="color:#64748b;">Duración</td><td>${dur} día${dur === 1 ? "" : "s"}</td></tr>
       </table>
       ${t.notas ? `<p style="margin:0 0 12px;color:#475569;"><em>Notas:</em> ${t.notas}</p>` : ""}
       <p style="margin:0;color:#475569;">Ingresa a SOLAROS para revisar los detalles y registrar avances.</p>`,
    );
    await sendGmail({ to: email, subject: `[SOLAROS] ${titulo} · ${t.folio}`, html }).catch(() => {});
  }
}