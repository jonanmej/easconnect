import { sendGmail, emailLayout } from "./notifications.server";

type Tipo =
  | "trabajo_completado"
  | "reporte_diario"
  | "nueva_evidencia"
  | "reporte_enviado"
  | "reporte_aprobado"
  | "reporte_rechazado";

/**
 * Envía una notificación in-app + correo Gmail a todos los usuarios con rol
 * `admin` o `supervisor` (excepto al autor del evento). No bloquea si Gmail
 * o el envío individual fallan.
 */
export async function notificarStaff(opts: {
  tipo: Tipo;
  titulo: string;
  mensaje: string;
  trabajo_id?: string | null;
  htmlBody?: string;
  subjectPrefix?: string;
  excluirUserId?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "supervisor"]);
    const userIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.user_id as string)),
    ).filter((id) => id && id !== opts.excluirUserId);
    if (!userIds.length) return;

    // 1) Notificaciones in-app
    try {
      const inserts = userIds.map((uid) => ({
        user_id: uid,
        tipo: opts.tipo,
        titulo: opts.titulo,
        mensaje: opts.mensaje.slice(0, 500),
        trabajo_id: opts.trabajo_id ?? null,
      }));
      await supabaseAdmin.from("notificaciones_usuario").insert(inserts);
    } catch (e) {
      console.warn("[notif staff in-app]", e);
    }

    // 2) Email
    try {
      const { data: usersList } = await (supabaseAdmin as any).auth.admin.listUsers({ perPage: 500 });
      const emailById = new Map<string, string>();
      for (const u of usersList?.users ?? []) {
        if (u?.id && u?.email) emailById.set(u.id, u.email);
      }
      const html = emailLayout(opts.titulo, opts.htmlBody ?? `<p style="margin:0;">${opts.mensaje}</p>`);
      const subject = `[EA Service Connect] ${opts.subjectPrefix ?? opts.titulo}`;
      await Promise.all(
        userIds.map((uid) => {
          const to = emailById.get(uid);
          if (!to) return Promise.resolve();
          return sendGmail({ to, subject, html }).catch(() => undefined);
        }),
      );
    } catch (e) {
      console.warn("[notif staff email]", e);
    }
  } catch (e) {
    console.warn("[notif staff]", e);
  }
}