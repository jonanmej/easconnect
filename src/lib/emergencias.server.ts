import { notificarStaff } from "./notificaciones-staff.server";

const APP_URL = "https://easconnect.lovable.app";

/**
 * Notifica (in-app + correo) a admins y supervisores cuando se programa o
 * mueve una OT a un día no laborable (feriado o fin de semana) bajo
 * autorización de emergencia. Incluye la justificación y el enlace al registro.
 */
export async function notificarExcepcionNoLaborable(opts: {
  trabajoId: string;
  accion: "programar" | "reprogramar" | "mover_dia";
  motivo: string;
  justificacion: string;
  fechaISO: string;
  actorId?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("trabajos")
      .select("folio, servicio, plantas(nombre, clientes(nombre))")
      .eq("id", opts.trabajoId)
      .single();
    const folio = (t as any)?.folio ?? opts.trabajoId.slice(0, 8);
    const servicio = (t as any)?.servicio ?? "";
    const planta = (t as any)?.plantas?.nombre ?? "—";
    const cliente = (t as any)?.plantas?.clientes?.nombre ?? "—";
    const fecha = new Date(opts.fechaISO).toLocaleDateString("es-SV", {
      timeZone: "America/El_Salvador",
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const accionTxt =
      opts.accion === "programar"
        ? "programó"
        : opts.accion === "reprogramar"
          ? "reprogramó"
          : "movió un día de";
    const etiqueta = opts.motivo === "feriado" ? "día feriado" : opts.motivo;
    const url = `${APP_URL}/trabajos?q=${encodeURIComponent(folio)}`;

    const titulo = `Emergencia: OT ${folio} en ${etiqueta}`;
    const mensaje = `Se ${accionTxt} la OT ${folio} (${servicio}) para el ${fecha} (${etiqueta}). Justificación: ${opts.justificacion}`;
    const htmlBody = `
      <p style="margin:0 0 12px;">Se registró una <b>autorización de emergencia</b> para trabajar en un día no laborable.</p>
      <p style="margin:0 0 12px;">
        <b>Folio:</b> ${folio}<br/>
        <b>Servicio:</b> ${servicio}<br/>
        <b>Cliente:</b> ${cliente}<br/>
        <b>Planta:</b> ${planta}<br/>
        <b>Fecha autorizada:</b> ${fecha} (${etiqueta})<br/>
        <b>Acción:</b> ${accionTxt}
      </p>
      <p style="margin:0 0 12px;"><b>Justificación:</b><br/>${opts.justificacion}</p>
      <p style="margin:0;"><a href="${url}">Ver el registro de la OT</a></p>`;

    await notificarStaff({
      tipo: "emergencia_no_laborable",
      titulo,
      mensaje,
      trabajo_id: opts.trabajoId,
      htmlBody,
      subjectPrefix: `Emergencia en ${etiqueta} · OT ${folio}`,
      excluirUserId: opts.actorId ?? null,
    });
  } catch (e) {
    console.warn("[notif emergencia no laborable]", e);
  }
}
