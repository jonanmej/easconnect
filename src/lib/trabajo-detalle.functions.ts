import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Reporte base por OT ----------

export const getTrabajoReporte = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trabajo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("trabajo_reportes")
      .select("*")
      .eq("trabajo_id", data.trabajo_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertTrabajoReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      trabajo_id: z.string().uuid(),
      condiciones_sitio: z.string().nullable().optional(),
      trabajo_realizado: z.string().nullable().optional(),
      hallazgos: z.string().nullable().optional(),
      recomendaciones: z.string().nullable().optional(),
      materiales_usados: z.string().nullable().optional(),
      tecnico_nombre: z.string().nullable().optional(),
      cliente_recibe_nombre: z.string().nullable().optional(),
      cliente_recibe_cargo: z.string().nullable().optional(),
      cliente_observaciones: z.string().nullable().optional(),
      mediciones: z.record(z.string(), z.any()).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("trabajo_reportes")
      .upsert(data, { onConflict: "trabajo_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Checklist de recursos por OT ----------

const RecursoCategoria = z.enum(["herramienta", "equipo", "epp", "insumo", "repuesto", "otro"]);

export const listTrabajoRecursos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trabajo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("trabajo_recursos")
      .select("*")
      .eq("trabajo_id", data.trabajo_id)
      .order("categoria", { ascending: true })
      .order("descripcion", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertTrabajoRecurso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      trabajo_id: z.string().uuid(),
      categoria: RecursoCategoria,
      descripcion: z.string().min(1),
      cantidad: z.coerce.number().positive().default(1),
      unidad: z.string().nullable().optional(),
      item_id: z.string().uuid().nullable().optional(),
      equipo_id: z.string().uuid().nullable().optional(),
      entregado: z.coerce.boolean().optional(),
      devuelto: z.coerce.boolean().optional(),
      notas: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const payload: any = { ...rest };
    if (!payload.item_id) payload.item_id = null;
    if (!payload.equipo_id) payload.equipo_id = null;
    const q = id
      ? context.supabase.from("trabajo_recursos").update(payload).eq("id", id).select().single()
      : context.supabase.from("trabajo_recursos").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTrabajoRecurso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("trabajo_recursos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleRecursoFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      campo: z.enum(["entregado", "devuelto"]),
      valor: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: any = { [data.campo]: data.valor };
    const { error } = await context.supabase.from("trabajo_recursos").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });