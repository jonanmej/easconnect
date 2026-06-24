import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Endpoint público: cualquiera puede solicitar reseteo desde el login. */
export const solicitarResetPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email().max(255),
        mensaje: z.string().max(500).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Inserta la solicitud
    const { error } = await supabaseAdmin
      .from("password_reset_solicitudes")
      .insert({
        email: data.email.toLowerCase().trim(),
        mensaje: data.mensaje?.trim() || null,
        estado: "pendiente",
      });
    if (error) throw new Error(error.message);

    // Notifica a los administradores por correo (mejor esfuerzo)
    try {
      const { sendGmail, emailLayout } = await import("@/lib/notifications.server");
      // Buscar emails de admins
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      const { data: usersList } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const adminEmails = (usersList?.users ?? [])
        .filter((u) => ids.includes(u.id) && !!u.email)
        .map((u) => u.email as string);
      if (adminEmails.length) {
        const html = emailLayout(
          "Nueva solicitud de recuperación de contraseña",
          `
            <p style="margin:0 0 12px;">El usuario <b>${data.email}</b> solicitó recuperar su acceso a EA Service Connect.</p>
            ${
              data.mensaje
                ? `<p style="margin:0 0 12px;color:#475569;"><b>Mensaje:</b> ${String(data.mensaje).replace(/</g, "&lt;")}</p>`
                : ""
            }
            <p style="margin:14px 0 0;">
              <a href="https://easconnect.lovable.app/usuarios" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:6px;font-size:13px;">Atender solicitud</a>
            </p>
            <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">Solicitada el ${new Date().toLocaleString("es-CL")}.</p>
          `,
        );
        // Enviar a todos los admins en paralelo
        await Promise.allSettled(
          adminEmails.map((to) =>
            sendGmail({
              to,
              subject: "EA Service Connect · Solicitud de recuperación de contraseña",
              html,
            }),
          ),
        );
      }
    } catch (e) {
      console.warn("[password-reset] No se pudo notificar a admins", e);
    }

    return { ok: true };
  });