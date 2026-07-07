import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PasswordPolicySchema = z.object({
  longitud: z.coerce.number().int().min(8).max(64),
  requiere_mayusculas: z.boolean(),
  requiere_minusculas: z.boolean(),
  requiere_digitos: z.boolean(),
  requiere_simbolos: z.boolean(),
  excluir_ambiguos: z.boolean(),
});
export type PasswordPolicy = z.infer<typeof PasswordPolicySchema>;

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  longitud: 16,
  requiere_mayusculas: true,
  requiere_minusculas: true,
  requiere_digitos: true,
  requiere_simbolos: true,
  excluir_ambiguos: true,
};

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!data) throw new Error("Forbidden: requiere rol admin");
}

const OWNER_EMAIL = "proyectos@easervice.app";
function assertOwner(claims: any) {
  const email = String(claims?.email ?? "").toLowerCase();
  if (email !== OWNER_EMAIL) throw new Error("Forbidden: acción restringida");
}

export const getPasswordPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("system_config")
      .select("value")
      .eq("key", "password_policy")
      .maybeSingle();
    const parsed = PasswordPolicySchema.safeParse(data?.value);
    return parsed.success ? parsed.data : DEFAULT_PASSWORD_POLICY;
  });

export const setPasswordPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PasswordPolicySchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("system_config")
      .upsert(
        {
          key: "password_policy",
          value: data as any,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("auditoria_log").insert({
      entidad: "system_config",
      accion: "update",
      despues: { key: "password_policy", value: data } as any,
      actor: context.userId,
    });
    return { ok: true };
  });

/**
 * Pausa el envío de correo (a todos los usuarios y emails registrados) cuando
 * se sube un reporte diario o PDF en un trabajo. Las notificaciones in-app
 * siguen registrándose para no perder trazabilidad.
 */
export const REPORT_UPLOAD_EMAIL_PAUSE_KEY = "notify_report_upload_email_paused";

export const getReportUploadEmailPaused = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    assertOwner(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("system_config")
      .select("value")
      .eq("key", REPORT_UPLOAD_EMAIL_PAUSE_KEY)
      .maybeSingle();
    return { paused: Boolean((data?.value as any)?.paused) };
  });

export const setReportUploadEmailPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paused: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    assertOwner(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("system_config")
      .upsert(
        {
          key: REPORT_UPLOAD_EMAIL_PAUSE_KEY,
          value: { paused: data.paused } as any,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("auditoria_log").insert({
      entidad: "system_config",
      accion: "update",
      despues: { key: REPORT_UPLOAD_EMAIL_PAUSE_KEY, value: { paused: data.paused } } as any,
      actor: context.userId,
    });
    const { invalidateEmailsPausedCache } = await import("./email-pause.server");
    invalidateEmailsPausedCache();
    return { ok: true };
  });