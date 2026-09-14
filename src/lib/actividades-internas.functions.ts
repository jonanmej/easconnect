import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "trabajos-evidencia";

async function rolesDe(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as string);
}

async function assertStaffEditor(supabase: any, userId: string) {
  const roles = await rolesDe(supabase, userId);
  if (!roles.includes("admin") && !roles.includes("supervisor")) {
    throw new Error("Solo administradores y supervisores pueden gestionar actividades internas.");
  }
}

const actividadSchema = z.object({
  id: z.string().uuid().optional(),
  titulo: z.string().trim().min(3, "Escribe un título de al menos 3 caracteres"),
  tipo: z.string().trim().min(1),
  estado: z.enum(["pendiente", "en_curso", "hecha", "cancelada"]).default("pendiente"),
  prioridad: z.enum(["baja", "media", "alta"]).default("media"),
  fecha: z.string().min(4),
  duracion_dias: z.number().int().min(1).max(60).default(1),
  hora_fin: z.string().nullable().optional(),
  lugar: z.string().trim().nullable().optional(),
  cliente_id: z.string().uuid().nullable().optional(),
  responsables: z.array(z.string().uuid()).default([]),
  notas: z.string().trim().nullable().optional(),
});

/** Personal interno (admin, supervisor, técnico) para asignar responsables. */
export const listPersonalInterno = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await rolesDe(context.supabase, context.userId);
    if (!roles.some((r) => ["admin", "supervisor", "tecnico"].includes(r))) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rolesRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "supervisor", "tecnico"] as any);
    const ids = Array.from(new Set((rolesRows ?? []).map((r: any) => r.user_id)));
    if (!ids.length) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, nombres, apellidos, cargo")
      .in("id", ids);
    const rolByUser = new Map<string, string>();
    (rolesRows ?? []).forEach((r: any) => {
      const prev = rolByUser.get(r.user_id);
      const orden = ["admin", "supervisor", "tecnico"];
      if (!prev || orden.indexOf(r.role) < orden.indexOf(prev)) rolByUser.set(r.user_id, r.role);
    });
    return (profs ?? [])
      .map((p: any) => ({
        id: p.id as string,
        nombre:
          (p.display_name as string | null) ||
          [p.nombres, p.apellidos].filter(Boolean).join(" ") ||
          "Sin nombre",
        cargo: (p.cargo as string | null) ?? null,
        rol: rolByUser.get(p.id) ?? null,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  });

export const listActividadesInternas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("actividades_internas")
      .select("*, clientes(nombre)")
      .order("fecha", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((a: any) => ({
      ...a,
      cliente_nombre: a.clientes?.nombre ?? null,
    }));
  });

export const upsertActividadInterna = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => actividadSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertStaffEditor(context.supabase, context.userId);
    const payload: Record<string, any> = {
      titulo: data.titulo,
      tipo: data.tipo,
      estado: data.estado,
      prioridad: data.prioridad,
      fecha: data.fecha,
      duracion_dias: data.duracion_dias,
      hora_fin: data.hora_fin ?? null,
      lugar: data.lugar ?? null,
      cliente_id: data.cliente_id ?? null,
      responsables: data.responsables,
      notas: data.notas ?? null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("actividades_internas")
        .update(payload as any)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    payload['created_by'] = context.userId;
    const { data: row, error } = await context.supabase
      .from("actividades_internas")
      .insert(payload as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Mueve una actividad a otra fecha conservando la hora original. */
export const moverActividadInterna = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), fecha: z.string().min(4) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertStaffEditor(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("actividades_internas")
      .update({ fecha: data.fecha })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteActividadInterna = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaffEditor(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("actividades_internas")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAdjuntosActividad = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ actividad_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("actividad_interna_adjuntos")
      .select("id, actividad_id, storage_path, nombre_original, created_at")
      .eq("actividad_id", data.actividad_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!rows?.length) return [];
    const { data: signed } = await context.supabase
      .storage.from(BUCKET)
      .createSignedUrls(rows.map((r: any) => r.storage_path), 3600);
    const urlByPath = new Map((signed ?? []).map((s: any) => [s.path!, s.signedUrl]));
    return rows.map((r: any) => ({ ...r, url: urlByPath.get(r.storage_path) ?? null }));
  });

export const recordAdjuntoActividad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      actividad_id: z.string().uuid(),
      storage_path: z.string().min(3),
      nombre_original: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertStaffEditor(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("actividad_interna_adjuntos")
      .insert({
        actividad_id: data.actividad_id,
        storage_path: data.storage_path,
        nombre_original: data.nombre_original ?? null,
        subido_por: context.userId,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAdjuntoActividad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaffEditor(context.supabase, context.userId);
    const { data: row } = await context.supabase
      .from("actividad_interna_adjuntos")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase
      .from("actividad_interna_adjuntos")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if ((row as any)?.storage_path) {
      await context.supabase.storage.from(BUCKET).remove([(row as any).storage_path]);
    }
    return { ok: true };
  });
