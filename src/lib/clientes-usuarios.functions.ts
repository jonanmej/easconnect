import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: isSup }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "supervisor" }),
  ]);
  if (!isAdmin && !isSup) throw new Error("Forbidden: requiere rol admin o supervisor");
  return { isAdmin: !!isAdmin };
}

/** Lista usuarios asignados (encargados) de un cliente. */
export const listUsuariosCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, cliente_id")
      .eq("cliente_id", data.clienteId);
    if (error) throw new Error(error.message);
    const ids = (profs ?? []).map((p: any) => p.id);
    if (!ids.length) return [] as { id: string; email: string; display_name: string | null }[];
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailById = new Map<string, string>();
    (list?.users ?? []).forEach((u) => u.email && emailById.set(u.id, u.email));
    return (profs ?? []).map((p: any) => ({
      id: p.id,
      email: emailById.get(p.id) ?? "(sin email)",
      display_name: p.display_name ?? null,
    }));
  });

/**
 * Lista usuarios "asignables" como encargados de un cliente:
 * sólo quienes tienen rol `cliente`.
 */
export const listUsuariosAsignables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "cliente");
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (!ids.length) return [] as { id: string; email: string; cliente_id: string | null }[];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, cliente_id")
      .in("id", ids);
    const profById = new Map<string, any>();
    (profs ?? []).forEach((p: any) => profById.set(p.id, p));
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return (list?.users ?? [])
      .filter((u) => ids.includes(u.id))
      .map((u) => ({
        id: u.id,
        email: u.email ?? "(sin email)",
        cliente_id: profById.get(u.id)?.cliente_id ?? null,
        display_name: profById.get(u.id)?.display_name ?? null,
      }));
  });

/** Asigna o re-asigna un usuario existente como encargado de un cliente. */
export const asignarUsuarioCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        clienteId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("id, cliente_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (!before) {
      await supabaseAdmin.from("profiles").insert({
        id: data.userId,
        cliente_id: data.clienteId,
      });
    } else {
      await supabaseAdmin
        .from("profiles")
        .update({ cliente_id: data.clienteId })
        .eq("id", data.userId);
    }
    // Asegura rol cliente
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.userId, role: "cliente" }, { onConflict: "user_id,role" });
    await supabaseAdmin.from("auditoria_log").insert({
      entidad: "profiles",
      entidad_id: data.userId,
      accion: "asignar_encargado_cliente",
      antes: before ? { cliente_id: before.cliente_id } : null,
      despues: { cliente_id: data.clienteId },
      actor: context.userId,
    });
    return { ok: true };
  });

/** Quita la asignación de un usuario a un cliente (no elimina la cuenta). */
export const quitarUsuarioCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("cliente_id")
      .eq("id", data.userId)
      .maybeSingle();
    await supabaseAdmin
      .from("profiles")
      .update({ cliente_id: null })
      .eq("id", data.userId);
    await supabaseAdmin.from("auditoria_log").insert({
      entidad: "profiles",
      entidad_id: data.userId,
      accion: "quitar_encargado_cliente",
      antes: before ? { cliente_id: before.cliente_id } : null,
      despues: { cliente_id: null },
      actor: context.userId,
    });
    return { ok: true };
  });