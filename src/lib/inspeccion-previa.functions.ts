import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NIVEL = z.enum(["bueno", "regular", "malo", "critico"]).nullable().optional();

/** Inspección de estado previo (techo, accesos y sectores circundantes) de un trabajo. */
export const getInspeccionPrevia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trabajo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: trabajo, error: eT } = await context.supabase
      .from("trabajos")
      .select("id, folio, servicio, fecha_programada, notas, planta_id, plantas(nombre, ubicacion, paneles, clientes(nombre))")
      .eq("id", data.trabajo_id)
      .single();
    if (eT) throw new Error(eT.message);

    const { data: insp, error: eI } = await context.supabase
      .from("trabajo_inspecciones_previas")
      .select("*")
      .eq("trabajo_id", data.trabajo_id)
      .maybeSingle();
    if (eI) throw new Error(eI.message);

    let hallazgos: any[] = [];
    if (insp) {
      const { data: hs, error: eH } = await context.supabase
        .from("inspeccion_previa_hallazgos")
        .select("*")
        .eq("inspeccion_id", (insp as any).id)
        .order("created_at", { ascending: true });
      if (eH) throw new Error(eH.message);
      hallazgos = hs ?? [];
    }

    const { data: zonas } = await context.supabase
      .from("planta_zonas")
      .select("id, nombre, color, paneles_estimados")
      .eq("planta_id", (trabajo as any).planta_id)
      .eq("activo", true)
      .order("orden", { ascending: true });

    let tecnico_nombre: string | null = null;
    if ((insp as any)?.tecnico_id) {
      const { data: p } = await context.supabase
        .from("profiles").select("display_name").eq("id", (insp as any).tecnico_id).maybeSingle();
      tecnico_nombre = (p as any)?.display_name ?? null;
    }

    const planta: any = (trabajo as any).plantas ?? null;
    return {
      trabajo: {
        id: (trabajo as any).id,
        folio: (trabajo as any).folio,
        servicio: (trabajo as any).servicio,
        fecha_programada: (trabajo as any).fecha_programada,
        planta: planta?.nombre ?? "—",
        ubicacion: planta?.ubicacion ?? null,
        paneles: planta?.paneles ?? null,
        cliente: planta?.clientes?.nombre ?? "—",
      },
      inspeccion: insp ?? null,
      tecnico_nombre,
      hallazgos,
      zonas: zonas ?? [],
    };
  });

export const upsertInspeccionPrevia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      trabajo_id: z.string().uuid(),
      fecha: z.string().min(8),
      cubierta_tipo: z.string().max(120).nullable().optional(),
      cubierta_estado: NIVEL,
      estructura_estado: NIVEL,
      accesos_estado: NIVEL,
      circundante_estado: NIVEL,
      riesgos: z.array(z.string().max(60)).default([]),
      techo_detalle: z.string().nullable().optional(),
      accesos_detalle: z.string().nullable().optional(),
      circundante_detalle: z.string().nullable().optional(),
      observaciones: z.string().nullable().optional(),
      apto: z.boolean().default(true),
      restricciones: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const payload: any = { ...data, tecnico_id: context.userId };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await context.supabase
      .from("trabajo_inspecciones_previas")
      .upsert(payload, { onConflict: "trabajo_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertHallazgoPrevio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      inspeccion_id: z.string().uuid(),
      zona_id: z.string().uuid().nullable().optional(),
      area: z.enum(["techo", "estructura", "accesos", "circundante", "electrico", "otro"]).default("techo"),
      severidad: z.enum(["leve", "moderado", "critico"]).default("leve"),
      descripcion: z.string().min(3).max(1000),
      evidencia_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const payload: any = { ...data };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await context.supabase
      .from("inspeccion_previa_hallazgos")
      .upsert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const eliminarHallazgoPrevio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("inspeccion_previa_hallazgos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
