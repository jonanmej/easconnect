import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
        password: z.string().min(8).optional().or(z.literal("")),
        role: RoleEnum,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const usePassword = !!data.password && data.password.length >= 8;
    let userId: string;
    let userEmail: string | undefined;
    if (usePassword) {
      // Crea cuenta con contraseña inicial (admin la entrega por canal seguro, no se envía correo).
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
      userId = created.user!.id;
      userEmail = created.user!.email ?? undefined;
    } else {
      // Envía correo de invitación oficial; el usuario fija su propia contraseña.
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        data.email,
      );
      if (error) throw new Error(`No se pudo enviar la invitación: ${error.message}`);
      userId = invited.user!.id;
      userEmail = invited.user!.email ?? undefined;
    }
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);
    return { id: userId, email: userEmail, invited: !usePassword };
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