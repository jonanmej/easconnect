import { createFileRoute } from "@tanstack/react-router";

const INTERVALOS = [30, 20, 10, 5, 1] as const;
const FROM = "EA Service Connect <proyectos@easervice.app>";

function buildHtml(opts: {
  folio: string; servicio: string; planta: string; cliente: string;
  fechaProg: string; diasRestantes: number; equipos: string[];
}) {
  const primary = "#F59E0B";
  const equiposBlock = opts.equipos.length
    ? `<p style="margin:8px 0;font-size:13px;"><strong>Equipos asignados:</strong> ${opts.equipos.join(", ")}</p>`
    : "";
  return `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#0F172A;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;padding:32px 12px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="padding:24px 28px;background:#0f172a;color:#fff;">
<img src="https://easconnect.lovable.app/__l5e/assets-v1/16fcfac4-bba2-45b9-8fe8-2aa60f6e51f5/ea-service-connect-logo.png" alt="EA Service Connect" width="160" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:160px;background:#0f172a;" />
</td></tr>
<tr><td style="padding:28px;color:#1f2937;">
<h1 style="margin:0 0 12px;font-size:20px;">Recordatorio: visita programada en ${opts.diasRestantes} día${opts.diasRestantes === 1 ? "" : "s"}</h1>
<p style="margin:0 0 14px;font-size:14px;color:#475569;">OT <strong>${opts.folio}</strong> · ${opts.servicio}</p>
<p style="margin:8px 0;font-size:13px;"><strong>Cliente:</strong> ${opts.cliente}</p>
<p style="margin:8px 0;font-size:13px;"><strong>Planta:</strong> ${opts.planta}</p>
<p style="margin:8px 0;font-size:13px;"><strong>Fecha:</strong> ${opts.fechaProg}</p>
${equiposBlock}
<p style="margin:18px 0 0;padding:12px;background:#fef3c7;border-left:3px solid ${primary};font-size:13px;color:#78350f;">
Prepara los recursos y confirma disponibilidad del equipo de trabajo.
</p>
</td></tr>
<tr><td style="padding:18px 28px;background:#f8fafc;color:#94a3b8;font-size:11px;text-align:center;border-top:1px solid #e2e8f0;">
Mensaje automático · EA Service Connect
</td></tr>
</table></td></tr></table></body></html>`;
}

function buildWhatsAppBody(opts: { folio: string; servicio: string; planta: string; fechaProg: string; diasRestantes: number }) {
  return `🔔 *EA Service Connect*\nRecordatorio: la OT ${opts.folio} (${opts.servicio}) en ${opts.planta} se ejecuta en ${opts.diasRestantes} día${opts.diasRestantes === 1 ? "" : "s"} (${opts.fechaProg}). Prepara recursos y confirma disponibilidad.`;
}

export const Route = createFileRoute("/api/public/hooks/notificar-programaciones")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { sendEmail, sendWhatsApp } = await import("@/lib/notificaciones-channels.server");

          const hoy = new Date();
          hoy.setHours(0, 0, 0, 0);
          const maxFecha = new Date(hoy);
          maxFecha.setDate(maxFecha.getDate() + 31);

          // OT programadas dentro de los próximos 31 días
          const { data: trabajos, error: errT } = await supabaseAdmin
            .from("trabajos")
            .select(
              "id, folio, servicio, fecha_programada, estado, avisos_enviados, planta_id, plantas(nombre, email_notificaciones, clientes(nombre, email, telefono))",
            )
            .eq("estado", "programado")
            .gte("fecha_programada", hoy.toISOString())
            .lte("fecha_programada", maxFecha.toISOString());
          if (errT) throw new Error(errT.message);

          let avisos = 0;
          let errores = 0;

          for (const t of (trabajos ?? []) as any[]) {
            const fechaProg = new Date(t.fecha_programada);
            const diffMs = fechaProg.getTime() - hoy.getTime();
            const diasRestantes = Math.ceil(diffMs / (24 * 3600 * 1000));
            const intervalo = INTERVALOS.find((d) => diasRestantes === d);
            if (!intervalo) continue;

            const enviados = (t.avisos_enviados ?? {}) as Record<string, string>;
            if (enviados[String(intervalo)]) continue; // ya enviado

            const planta = t.plantas;
            const cliente = planta?.clientes;
            const destEmail = cliente?.email || planta?.email_notificaciones;
            const destWa = cliente?.telefono;

            // Equipos asignados
            const { data: eqs } = await supabaseAdmin
              .from("trabajo_equipos")
              .select("equipos(codigo, nombre)")
              .eq("trabajo_id", t.id);
            const equipos = ((eqs ?? []) as any[])
              .map((r) => r.equipos)
              .filter(Boolean)
              .map((e: any) => `${e.codigo} ${e.nombre}`);

            const fechaTxt = fechaProg.toLocaleString("es-CL", { dateStyle: "long", timeStyle: "short" });
            const asunto = `Recordatorio · OT ${t.folio} en ${intervalo} día${intervalo === 1 ? "" : "s"}`;
            const html = buildHtml({
              folio: t.folio,
              servicio: t.servicio,
              planta: planta?.nombre ?? "—",
              cliente: cliente?.nombre ?? "—",
              fechaProg: fechaTxt,
              diasRestantes: intervalo,
              equipos,
            });
            const waBody = buildWhatsAppBody({
              folio: t.folio,
              servicio: t.servicio,
              planta: planta?.nombre ?? "—",
              fechaProg: fechaTxt,
              diasRestantes: intervalo,
            });

            const resultados: Array<{ canal: string; estado: string; id?: string | null; error?: string }> = [];

            if (destEmail) {
              try {
                const id = await sendEmail({ from: FROM, to: destEmail, subject: asunto, html });
                resultados.push({ canal: "email", estado: "enviado", id });
              } catch (e: any) {
                resultados.push({ canal: "email", estado: "error", error: String(e.message ?? e) });
              }
            }

            if (destWa) {
              try {
                const sid = await sendWhatsApp({ to: destWa, body: waBody });
                resultados.push({ canal: "whatsapp", estado: sid ? "enviado" : "omitido", id: sid });
              } catch (e: any) {
                resultados.push({ canal: "whatsapp", estado: "error", error: String(e.message ?? e) });
              }
            }

            // Registrar en log + marcar aviso
            for (const r of resultados) {
              await supabaseAdmin.from("notificaciones_log").insert({
                trabajo_id: t.id,
                planta_id: t.planta_id,
                destinatario: r.canal === "whatsapp" ? destWa! : destEmail!,
                asunto,
                tipo: `aviso_${intervalo}d_${r.canal}`,
                estado: r.estado,
                error_mensaje: r.error ?? null,
                gmail_message_id: r.id ?? null,
              });
              if (r.estado === "enviado") avisos++;
              if (r.estado === "error") errores++;
            }

            if (resultados.some((r) => r.estado === "enviado")) {
              await supabaseAdmin
                .from("trabajos")
                .update({ avisos_enviados: { ...enviados, [String(intervalo)]: new Date().toISOString() } })
                .eq("id", t.id);
            }
          }

          return Response.json({ ok: true, avisos, errores, revisados: (trabajos ?? []).length });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: String(e.message ?? e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
