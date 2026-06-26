import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_PASSWORD_POLICY, PasswordPolicySchema, type PasswordPolicy } from "@/lib/system-config.functions";

const RoleEnum = z.enum(["admin", "supervisor", "tecnico", "cliente"]);

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("No se pudo verificar permisos");
  if (!data) throw new Error("Forbidden: requiere rol admin");
}

async function obtenerPolitica(): Promise<PasswordPolicy> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_config")
    .select("value")
    .eq("key", "password_policy")
    .maybeSingle();
  const parsed = PasswordPolicySchema.safeParse(data?.value);
  return parsed.success ? parsed.data : DEFAULT_PASSWORD_POLICY;
}

function pickRandom(pool: string): string {
  const arr = new Uint8Array(1);
  crypto.getRandomValues(arr);
  return pool[arr[0] % pool.length];
}

function generarPasswordSegunPolitica(pol: PasswordPolicy): string {
  const MAY_FULL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const MIN_FULL = "abcdefghijklmnopqrstuvwxyz";
  const DIG_FULL = "0123456789";
  const SYM = "!@#$%&*?+-";
  const MAY = pol.excluir_ambiguos ? "ABCDEFGHJKLMNPQRSTUVWXYZ" : MAY_FULL;
  const MIN = pol.excluir_ambiguos ? "abcdefghijkmnpqrstuvwxyz" : MIN_FULL;
  const DIG = pol.excluir_ambiguos ? "23456789" : DIG_FULL;

  const required: string[] = [];
  let pool = "";
  if (pol.requiere_mayusculas) { required.push(pickRandom(MAY)); pool += MAY; }
  if (pol.requiere_minusculas) { required.push(pickRandom(MIN)); pool += MIN; }
  if (pol.requiere_digitos)    { required.push(pickRandom(DIG)); pool += DIG; }
  if (pol.requiere_simbolos)   { required.push(pickRandom(SYM)); pool += SYM; }
  if (!pool) pool = MAY + MIN + DIG;

  const longitud = Math.max(pol.longitud, required.length);
  const out: string[] = [...required];
  while (out.length < longitud) out.push(pickRandom(pool));

  // Mezcla (Fisher–Yates) usando aleatorios criptográficos
  for (let i = out.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

async function enviarCorreoCredenciales(opts: {
  email: string;
  password: string;
  motivo: "nueva_cuenta" | "reseteo" | "reenvio";
}) {
  const { sendGmail, emailLayout } = await import("@/lib/notifications.server");
  const titulo =
    opts.motivo === "nueva_cuenta"
      ? "Tu cuenta en EA Service Connect está lista"
      : opts.motivo === "reseteo"
        ? "Hemos restablecido tu contraseña"
        : "Reenvío de tu contraseña temporal";
  const subject =
    opts.motivo === "nueva_cuenta"
      ? "EA Service Connect · Acceso a tu cuenta"
      : opts.motivo === "reseteo"
        ? "EA Service Connect · Nueva contraseña de acceso"
        : "EA Service Connect · Reenvío de contraseña temporal";
  const intro =
    opts.motivo === "nueva_cuenta"
      ? "Un administrador ha creado tu cuenta en EA Service Connect. Usa estas credenciales para iniciar sesión por primera vez."
      : opts.motivo === "reseteo"
        ? "Atendimos tu solicitud de recuperación de contraseña. Usa esta clave temporal para ingresar."
        : "Reenvío de la contraseña temporal previamente emitida. Si ya la cambiaste, ignora este mensaje.";
  const html = emailLayout(
    titulo,
    `
    <p style="margin:0 0 14px;font-size:14px;color:#1f2937;">${intro}</p>
    <table cellpadding="0" cellspacing="0" style="margin:18px 0;background:#f1f5f9;border-radius:8px;">
      <tr><td style="padding:14px 18px;font-size:13px;color:#475569;">
        <div><b>Correo:</b> ${opts.email}</div>
        <div style="margin-top:6px;"><b>Contraseña temporal:</b> <span style="font-family:monospace;background:#fff;padding:2px 8px;border-radius:4px;border:1px solid #e2e8f0;">${opts.password}</span></div>
      </td></tr>
    </table>
    <p style="margin:0 0 10px;font-size:13px;color:#475569;">
      Por seguridad, al ingresar te pediremos definir una nueva contraseña personal.
    </p>
    <p style="margin:14px 0 0;font-size:13px;">
      <a href="https://easconnect.lovable.app/auth" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:6px;font-size:13px;">Iniciar sesión</a>
    </p>
  `,
  );
  return sendGmail({ to: opts.email, subject, html });
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    const byUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    });
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, cliente_id");
    const clienteByUser = new Map<string, string | null>();
    (profiles ?? []).forEach((p: any) => {
      clienteByUser.set(p.id, p.cliente_id ?? null);
    });
    return users.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      roles: byUser.get(u.id) ?? [],
      cliente_id: clienteByUser.get(u.id) ?? null,
    }));
  });

export const listClientesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("clientes")
      .select("id, nombre")
      .order("nombre", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; nombre: string }[];
  });

export const setUserCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        clienteId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Asegura que el perfil existe (puede no haberse creado aún si el usuario nunca inició sesión)
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.userId)
      .maybeSingle();
    if (!existing) {
      const { error: insErr } = await supabaseAdmin
        .from("profiles")
        .insert({ id: data.userId, cliente_id: data.clienteId });
      if (insErr) throw new Error(insErr.message);
    } else {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ cliente_id: data.clienteId })
        .eq("id", data.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        role: RoleEnum,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Genera siempre una contraseña automática segura según la política activa.
    const politica = await obtenerPolitica();
    const password = generarPasswordSegunPolitica(politica);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const userId = created.user!.id;
    const userEmail = created.user!.email ?? data.email;
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);
    // Marca cambio obligatorio en el primer ingreso y envía la clave por correo.
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, debe_cambiar_password: true },
        { onConflict: "id" },
      );
    const r = await enviarCorreoCredenciales({
      email: userEmail,
      password,
      motivo: "nueva_cuenta",
    });
    const correo_enviado = !!r?.ok;
    const correo_error = r?.ok ? null : ((r as any)?.error ?? "Envío omitido");
    return {
      id: userId,
      email: userEmail,
      invited: false,
      correo_enviado,
      correo_error,
      // Se devuelve para que el admin la entregue por canal seguro si el correo falla.
      password: correo_enviado ? null : password,
    };
  });

/** Genera una nueva contraseña temporal para un usuario y la envía por correo. */
export const resetPasswordUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        solicitudId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (uErr || !u.user?.email) throw new Error("Usuario no encontrado");
    const politica = await obtenerPolitica();
    const password = generarPasswordSegunPolitica(politica);
    const { error: pErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password });
    if (pErr) throw new Error(pErr.message);
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: data.userId, debe_cambiar_password: true },
        { onConflict: "id" },
      );
    const r = await enviarCorreoCredenciales({
      email: u.user.email,
      password,
      motivo: "reseteo",
    });
    if (data.solicitudId) {
      await supabaseAdmin
        .from("password_reset_solicitudes")
        .update({
          estado: "atendida",
          atendida_at: new Date().toISOString(),
          atendida_por: context.userId,
        })
        .eq("id", data.solicitudId);
    }
    // Auditoría: nueva contraseña enviada
    await supabaseAdmin.from("auditoria_log").insert({
      entidad: "password_reset_solicitudes",
      entidad_id: data.solicitudId ?? null,
      accion: "password_reseteado",
      despues: {
        usuario_afectado: data.userId,
        email: u.user.email,
        correo_enviado: !!r?.ok,
      } as any,
      actor: context.userId,
    });
    if (!r?.ok) {
      console.error("[resetPasswordUsuario] correo no enviado", {
        userId: data.userId,
        error: (r as any)?.error ?? "envío omitido",
      });
      return {
        ok: true,
        email: u.user.email,
        email_failed: true,
        message:
          "La contraseña fue restablecida, pero el correo no se pudo enviar. Vuelve a intentar el reenvío desde Solicitudes.",
      };
    }
    return { ok: true, email: u.user.email };
  });

/**
 * Reenvía una nueva contraseña temporal a un usuario asociado a una solicitud
 * (caso "no me llegó el correo"). Genera una nueva clave y actualiza contador.
 */
export const reenviarPasswordTemporal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        solicitudId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sol, error: sErr } = await supabaseAdmin
      .from("password_reset_solicitudes")
      .select("id, email, reenvios")
      .eq("id", data.solicitudId)
      .maybeSingle();
    if (sErr || !sol) throw new Error("Solicitud no encontrada");
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const target = (users?.users ?? []).find(
      (u) => u.email?.toLowerCase() === String(sol.email).toLowerCase(),
    );
    if (!target?.email) throw new Error("No existe una cuenta con ese email");
    const politica = await obtenerPolitica();
    const password = generarPasswordSegunPolitica(politica);
    const { error: pErr } = await supabaseAdmin.auth.admin.updateUserById(target.id, { password });
    if (pErr) throw new Error(pErr.message);
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: target.id, debe_cambiar_password: true }, { onConflict: "id" });
    const r = await enviarCorreoCredenciales({
      email: target.email,
      password,
      motivo: "reenvio",
    });
    await supabaseAdmin
      .from("password_reset_solicitudes")
      .update({
        estado: "atendida",
        atendida_at: new Date().toISOString(),
        atendida_por: context.userId,
        reenvios: (sol.reenvios ?? 0) + 1,
        reenviado_at: new Date().toISOString(),
      })
      .eq("id", sol.id);
    await supabaseAdmin.from("auditoria_log").insert({
      entidad: "password_reset_solicitudes",
      entidad_id: sol.id,
      accion: "password_reenviado",
      despues: {
        usuario_afectado: target.id,
        email: target.email,
        correo_enviado: !!r?.ok,
      } as any,
      actor: context.userId,
    });
    if (!r?.ok) {
      console.error("[reenviarPasswordTemporal] correo no enviado", {
        solicitudId: sol.id,
        error: (r as any)?.error ?? "envío omitido",
      });
      return {
        ok: true,
        email: target.email,
        email_failed: true,
        message:
          "La contraseña fue regenerada, pero el correo no se pudo enviar. Intenta el reenvío nuevamente en unos minutos.",
      };
    }
    return { ok: true, email: target.email };
  });

/** Lista solicitudes de reseteo de contraseña (admin). */
export const listResetSolicitudes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Marca como 'caducada' las pendientes ya expiradas
    await supabaseAdmin
      .from("password_reset_solicitudes")
      .update({ estado: "caducada" })
      .eq("estado", "pendiente")
      .lt("expira_at", new Date().toISOString());
    const { data, error } = await supabaseAdmin
      .from("password_reset_solicitudes")
      .select("id, email, mensaje, estado, created_at, atendida_at, expira_at, ip, reenvios, reenviado_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    // Buscar el userId para cada email (puede no existir)
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const idByEmail = new Map<string, string>();
    (users?.users ?? []).forEach((u) => {
      if (u.email) idByEmail.set(u.email.toLowerCase(), u.id);
    });
    return (data ?? []).map((s: any) => ({
      ...s,
      user_id: idByEmail.get(String(s.email).toLowerCase()) ?? null,
    }));
  });

/** Marca una solicitud como descartada (admin). */
export const descartarResetSolicitud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("password_reset_solicitudes")
      .update({
        estado: "descartada",
        atendida_at: new Date().toISOString(),
        atendida_por: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), role: RoleEnum, enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.enabled) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("No puedes eliminar tu propia cuenta");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRoleAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: logs, error } = await supabaseAdmin
      .from("role_audit_log")
      .select("id, target_user_id, role, action, performed_by, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const ids = Array.from(
      new Set(
        (logs ?? []).flatMap((l: any) =>
          [l.target_user_id, l.performed_by].filter(Boolean) as string[],
        ),
      ),
    );
    const emailById = new Map<string, string>();
    await Promise.all(
      ids.map(async (id) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(id);
        if (data.user?.email) emailById.set(id, data.user.email);
      }),
    );
    return (logs ?? []).map((l: any) => ({
      id: l.id,
      role: l.role,
      action: l.action as "granted" | "revoked",
      created_at: l.created_at,
      target_email: emailById.get(l.target_user_id) ?? l.target_user_id.slice(0, 8),
      performed_by_email: l.performed_by
        ? emailById.get(l.performed_by) ?? l.performed_by.slice(0, 8)
        : "sistema",
    }));
  });

/**
 * Limpia referencias huérfanas: roles y perfiles cuyo usuario ya no existe en auth.users.
 * Solo admin. Devuelve los conteos eliminados.
 */
export const purgeOrphanUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error: lErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (lErr) throw new Error(lErr.message);
    const validIds = new Set((list?.users ?? []).map((u) => u.id));

    // Roles huérfanos
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id");
    const orphanRoleIds = Array.from(
      new Set((roles ?? []).map((r: any) => r.user_id).filter((id) => !validIds.has(id))),
    );
    let rolesEliminados = 0;
    if (orphanRoleIds.length) {
      const { error, count } = await supabaseAdmin
        .from("user_roles")
        .delete({ count: "exact" })
        .in("user_id", orphanRoleIds);
      if (error) throw new Error(error.message);
      rolesEliminados = count ?? orphanRoleIds.length;
    }

    // Perfiles huérfanos
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id");
    const orphanProfileIds = (profiles ?? [])
      .map((p: any) => p.id)
      .filter((id) => !validIds.has(id));
    let perfilesEliminados = 0;
    if (orphanProfileIds.length) {
      const { error, count } = await supabaseAdmin
        .from("profiles")
        .delete({ count: "exact" })
        .in("id", orphanProfileIds);
      if (error) throw new Error(error.message);
      perfilesEliminados = count ?? orphanProfileIds.length;
    }

    return { rolesEliminados, perfilesEliminados };
  });