import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRol, STAFF, INTERNO } from "@/lib/auth-roles";

export type PersonaListado = { user_id?: string | null; nombre: string; dui: string };

async function requireGestor(supabase: any, userId: string) {
  await requireRol(supabase, userId, STAFF, "Solo administradores o supervisores pueden hacer esto.");
}

/** Personal interno con su DUI guardado en el perfil (para autocompletar). */
export const listPersonalConDui = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireGestor(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "supervisor", "tecnico"] as any);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (!ids.length) return [];
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, nombres, apellidos, dui")
      .in("id", ids);
    return (data ?? [])
      .map((p: any) => ({
        id: p.id as string,
        nombre: ([p.nombres, p.apellidos].filter(Boolean).join(" ") || p.display_name || "Sin nombre") as string,
        dui: (p.dui ?? "") as string,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  });

export const listTrabajosParaListado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trabajos")
      .select("id, folio, servicio, fecha_programada, estado, plantas(nombre, clientes(id, nombre))")
      .neq("estado", "cancelado")
      .order("fecha_programada", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((t: any) => ({
      id: t.id as string,
      folio: t.folio as string,
      servicio: t.servicio as string,
      fecha: t.fecha_programada as string,
      planta: t.plantas?.nombre ?? "",
      cliente_id: t.plantas?.clientes?.id ?? null,
      cliente: t.plantas?.clientes?.nombre ?? "",
    }));
  });

export const listVehiculos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("vehiculos").select("*").order("modelo");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertVehiculo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid().optional(), modelo: z.string().trim().min(1).max(80), placa: z.string().trim().min(1).max(20), activo: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const row = { modelo: data.modelo.toUpperCase(), placa: data.placa.toUpperCase(), activo: data.activo };
    const q = data.id
      ? context.supabase.from("vehiculos").update(row).eq("id", data.id)
      : context.supabase.from("vehiculos").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.code === "23505" ? "Ya existe un vehículo con esa placa." : error.message);
    return { ok: true };
  });

export const deleteVehiculo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("vehiculos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listListados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("listados_personal")
      .select("*, trabajos(folio, servicio, fecha_programada, plantas(nombre, clientes(id, nombre)))")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((l: any) => ({
      id: l.id as string,
      trabajo_id: l.trabajo_id as string,
      proyecto: l.proyecto as string,
      personal: (l.personal ?? []) as PersonaListado[],
      vehiculo_ids: (l.vehiculo_ids ?? []) as string[],
      notas: (l.notas ?? "") as string,
      created_at: l.created_at as string,
      folio: l.trabajos?.folio ?? "",
      servicio: l.trabajos?.servicio ?? "",
      fecha: l.trabajos?.fecha_programada ?? null,
      planta: l.trabajos?.plantas?.nombre ?? "",
      cliente_id: l.trabajos?.plantas?.clientes?.id ?? null,
      cliente: l.trabajos?.plantas?.clientes?.nombre ?? "",
    }));
  });

const personaSchema = z.object({
  user_id: z.string().uuid().nullable().optional(),
  nombre: z.string().trim().min(1).max(120),
  dui: z.string().trim().max(20),
});

export const upsertListado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        trabajo_id: z.string().uuid(),
        proyecto: z.string().trim().min(1).max(200),
        personal: z.array(personaSchema).max(200),
        vehiculo_ids: z.array(z.string().uuid()).max(50),
        notas: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireGestor(context.supabase, context.userId);
    const row = {
      trabajo_id: data.trabajo_id,
      proyecto: data.proyecto,
      personal: data.personal,
      vehiculo_ids: data.vehiculo_ids,
      notas: data.notas || null,
    };
    const { error } = data.id
      ? await context.supabase.from("listados_personal").update(row).eq("id", data.id)
      : await context.supabase.from("listados_personal").insert({ ...row, created_by: context.userId });
    if (error) throw new Error(error.message);

    // Guarda el DUI en el perfil de los colaboradores registrados que aún no lo tienen.
    const conDui = data.personal.filter((p) => p.user_id && p.dui);
    if (conDui.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await Promise.all(
        conDui.map((p) => supabaseAdmin.from("profiles").update({ dui: p.dui } as any).eq("id", p.user_id!)),
      );
    }
    return { ok: true };
  });

export const deleteListado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("listados_personal").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
