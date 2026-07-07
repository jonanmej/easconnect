import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";

const EMAIL_WINDOW_MIN = 30;
const EMAIL_MAX_PER_WINDOW = 1;
const IP_WINDOW_MIN = 60;
const IP_MAX_PER_WINDOW = 5;

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
    const email = data.email.toLowerCase().trim();
    let ip: string | null = null;
    try {
      ip =
        getRequestIP({ xForwardedFor: true }) ||
        getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
        null;
    } catch {
      ip = null;
    }

    // ── Rate limiting / anti-abuso ─────────────────────────────────────
    const emailWindowFrom = new Date(Date.now() - EMAIL_WINDOW_MIN * 60_000).toISOString();
    const { count: emailCount } = await supabaseAdmin
      .from("password_reset_solicitudes")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", emailWindowFrom);
    if ((emailCount ?? 0) >= EMAIL_MAX_PER_WINDOW) {
      throw new Error(
        `Ya existe una solicitud reciente para este correo. Intenta nuevamente en ${EMAIL_WINDOW_MIN} minutos.`,
      );
    }

    // Si ya hay una pendiente vigente, no crear otra
    const { data: pendientes } = await supabaseAdmin
      .from("password_reset_solicitudes")
      .select("id")
      .eq("email", email)
      .eq("estado", "pendiente")
      .gt("expira_at", new Date().toISOString())
      .limit(1);
    if ((pendientes ?? []).length > 0) {
      throw new Error(
        "Ya tienes una solicitud pendiente. Espera a que un administrador la atienda.",
      );
    }

    if (ip) {
      const ipWindowFrom = new Date(Date.now() - IP_WINDOW_MIN * 60_000).toISOString();
      const { count: ipCount } = await supabaseAdmin
        .from("password_reset_solicitudes")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", ipWindowFrom);
      if ((ipCount ?? 0) >= IP_MAX_PER_WINDOW) {
        throw new Error(
          "Se detectaron demasiadas solicitudes desde tu red. Intenta más tarde o contacta directamente al administrador.",
        );
      }
    }

    // Marca como caducadas las solicitudes vencidas de este email
    await supabaseAdmin
      .from("password_reset_solicitudes")
      .update({ estado: "caducada" })
      .eq("email", email)
      .eq("estado", "pendiente")
      .lt("expira_at", new Date().toISOString());

    // Inserta la solicitud
    const expira_at = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const { data: inserted, error } = await supabaseAdmin
      .from("password_reset_solicitudes")
      .insert({
        email,
        mensaje: data.mensaje?.trim() || null,
        estado: "pendiente",
        expira_at,
        ip,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Auditoría (actor null porque es público)
    await supabaseAdmin.from("auditoria_log").insert({
      entidad: "password_reset_solicitudes",
      entidad_id: inserted.id,
      accion: "solicitud_creada",
      despues: { email, ip, expira_at } as any,
      actor: null,
    });

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
            <p style="margin:0 0 12px;">El usuario <b>${email}</b> solicitó recuperar su acceso a EA Service Connect.</p>
            ${
              data.mensaje
                ? `<p style="margin:0 0 12px;color:#475569;"><b>Mensaje:</b> ${String(data.mensaje).replace(/</g, "&lt;")}</p>`
                : ""
            }
            <p style="margin:14px 0 0;">
              <a href="https://easconnect.lovable.app/usuarios" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:6px;font-size:13px;">Atender solicitud</a>
            </p>
            <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">Solicitada el ${new Date().toLocaleString("es-SV", { timeZone: "America/El_Salvador" })}. Expira el ${new Date(expira_at).toLocaleString("es-SV", { timeZone: "America/El_Salvador" })}.</p>
          `,
        );
        // Enviar a todos los admins en paralelo
        await Promise.allSettled(
          adminEmails.map((to) =>
            sendGmail({
              to,
              subject: "EA Service Connect · Solicitud de recuperación de contraseña",
              html,
              bypassPause: true,
            }),
          ),
        );
      }
    } catch (e) {
      console.warn("[password-reset] No se pudo notificar a admins", e);
    }

    return { ok: true };
  });