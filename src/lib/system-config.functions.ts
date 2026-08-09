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

/* ------------------------------------------------------------------ */
/* Categorías de correos automáticos (activar/desactivar una por una) */
/* ------------------------------------------------------------------ */

export const EMAIL_CATEGORIAS = [
  {
    key: "trabajos_eventos",
    label: "Eventos de órdenes de trabajo",
    descripcion: "Inicio, avance, cierre y cancelación de OT (staff y contacto del cliente).",
  },
  {
    key: "asignacion_tecnico",
    label: "Asignación y reasignación de técnicos",
    descripcion: "Aviso al técnico cuando se le asigna o reasigna una OT.",
  },
  {
    key: "jornadas",
    label: "Jornadas laborales",
    descripcion: "Inicio/fin de jornada, almuerzo excedido y resumen diario de jornadas.",
  },
  {
    key: "staff_interno",
    label: "Avisos internos a administradores y supervisores",
    descripcion: "Reportes diarios, nuevas evidencias, flujo de reportes y emergencias en días no laborables.",
  },
  {
    key: "solicitudes_visita",
    label: "Solicitudes de visita",
    descripcion: "Nuevas solicitudes del cliente y su aprobación o rechazo.",
  },
  {
    key: "contratos",
    label: "Contratos y programación anual",
    descripcion: "Programación automática generada y reprogramaciones confirmadas.",
  },
  {
    key: "rutas",
    label: "Envío de rutas",
    descripcion: "Correos con la ruta diaria a los destinatarios seleccionados.",
  },
  {
    key: "avisos_programacion",
    label: "Recordatorios de visitas próximas",
    descripcion: "Avisos automáticos 30, 20, 10, 5 y 1 día antes de cada visita.",
  },
] as const;

export type EmailCategoriaKey = (typeof EMAIL_CATEGORIAS)[number]["key"];

const ZEmailCategorias = z.record(z.string(), z.boolean());

export const getEmailCategorias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("system_config")
      .select("value")
      .eq("key", "email_notif_categorias")
      .maybeSingle();
    const stored = (data?.value as Record<string, boolean> | null) ?? {};
    const out: Record<string, boolean> = {};
    for (const c of EMAIL_CATEGORIAS) out[c.key] = stored[c.key] !== false;
    return out;
  });

export const setEmailCategorias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ categorias: ZEmailCategorias }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const valid = new Set(EMAIL_CATEGORIAS.map((c) => c.key as string));
    const value: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(data.categorias)) {
      if (valid.has(k)) value[k] = Boolean(v);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("system_config").upsert(
      {
        key: "email_notif_categorias",
        value: value as any,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("auditoria_log").insert({
      entidad: "system_config",
      accion: "update",
      despues: { key: "email_notif_categorias", value } as any,
      actor: context.userId,
    });
    const { invalidateEmailCategoriasCache } = await import("./email-pause.server");
    invalidateEmailCategoriasCache();
    return { ok: true };
  });