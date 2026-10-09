import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EquipoEstado = z.enum(["operativo", "mantenimiento", "disponible", "fuera_servicio"]);

export const listEquipos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("equipos")
      .select("id, codigo, nombre, tipo, estado, salud, ubicacion, planta_id, plantas(nombre)")
      .order("codigo");
    if (error) throw new Error(error.message);
    return (data ?? []).map((e: any) => ({
      ...e,
      planta_nombre: e.plantas?.nombre ?? null,
    }));
  });

export const upsertEquipo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      codigo: z.string().nullable().optional(),
      nombre: z.string().min(1),
      tipo: z.string().min(1),
      estado: EquipoEstado,
      salud: z.coerce.number().int().min(0).max(100).nullable().optional(),
      planta_id: z.string().uuid().nullable().optional(),
      ubicacion: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const payload: any = { ...rest, planta_id: rest.planta_id || null };
    if (!id && (!payload.codigo || payload.codigo === "")) {
      delete payload.codigo; // dejar que el trigger lo autogenere
    }
    if (id && !payload.codigo) delete payload.codigo;
    const q = id
      ? context.supabase.from("equipos").update(payload).eq("id", id).select().single()
      : context.supabase.from("equipos").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEquipo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("equipos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Trabajos ============
