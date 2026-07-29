import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ZPunto = z.object({ lat: z.number(), lng: z.number() });

export const listZonasPlanta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ planta_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("planta_zonas")
      .select("*")
      .eq("planta_id", data.planta_id)
      .eq("activo", true)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Zonas de la planta a la que pertenece un trabajo. */
export const listZonasDeTrabajo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trabajo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: t, error: e1 } = await context.supabase
      .from("trabajos")
      .select("planta_id, plantas(nombre, latitud, longitud)")
      .eq("id", data.trabajo_id)
      .single();
    if (e1) throw new Error(e1.message);
    const { data: rows, error } = await context.supabase
      .from("planta_zonas")
      .select("*")
      .eq("planta_id", (t as any).planta_id)
      .eq("activo", true)
      .order("orden", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      planta_id: (t as any).planta_id as string,
      planta: (t as any).plantas ?? null,
      zonas: rows ?? [],
    };
  });

export const upsertZonaPlanta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      planta_id: z.string().uuid(),
      nombre: z.string().min(1).max(120),
      paneles_estimados: z.number().int().min(0).default(0),
      color: z.string().max(20).default("#22c55e"),
      poligono: z.array(ZPunto).min(3),
      orden: z.number().int().min(0).default(0),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const payload: any = { ...data, poligono: data.poligono, created_by: context.userId };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await context.supabase
      .from("planta_zonas")
      .upsert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const eliminarZonaPlanta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("planta_zonas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marcado de zonas trabajadas en un reporte diario. */
export const listZonasDiario = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reporte_diario_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("reporte_diario_zonas")
      .select("id, zona_id, estado")
      .eq("reporte_diario_id", data.reporte_diario_id);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const marcarZonaDiario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      reporte_diario_id: z.string().uuid(),
      trabajo_id: z.string().uuid(),
      zona_id: z.string().uuid(),
      estado: z.enum(["en_proceso", "completada"]).nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.estado === null) {
      const { error } = await context.supabase
        .from("reporte_diario_zonas")
        .delete()
        .eq("reporte_diario_id", data.reporte_diario_id)
        .eq("zona_id", data.zona_id);
      if (error) throw new Error(error.message);
      return { ok: true, estado: null };
    }
    const { error } = await context.supabase
      .from("reporte_diario_zonas")
      .upsert(
        {
          reporte_diario_id: data.reporte_diario_id,
          trabajo_id: data.trabajo_id,
          zona_id: data.zona_id,
          estado: data.estado,
        },
        { onConflict: "reporte_diario_id,zona_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, estado: data.estado };
  });
