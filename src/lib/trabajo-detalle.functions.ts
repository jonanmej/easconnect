import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Equipos asignados (N:M) ----------

export const listTrabajoEquipos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trabajo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("trabajo_equipos")
      .select("equipo_id, equipos(id, codigo, nombre, tipo)")
      .eq("trabajo_id", data.trabajo_id);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      equipo_id: r.equipo_id,
      codigo: r.equipos?.codigo,
      nombre: r.equipos?.nombre,
      tipo: r.equipos?.tipo,
    }));
  });

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
      paneles_limpiados: z.coerce.number().int().nonnegative().nullable().optional(),
      agua_galones: z.coerce.number().nonnegative().nullable().optional(),
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

// ---------- Copiar recursos entre trabajos (cualquier planta/cliente) ----------

export const listTrabajosConRecursos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trabajo_recursos")
      .select(
        "trabajo_id, trabajos!inner(id, folio, servicio, fecha_programada, plantas(nombre, clientes(nombre)))",
      );
    if (error) throw new Error(error.message);
    const map = new Map<string, any>();
    for (const r of (data as any[] | null) ?? []) {
      const t = r.trabajos;
      if (!t) continue;
      const cur = map.get(t.id);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(t.id, {
          id: t.id,
          folio: t.folio,
          servicio: t.servicio,
          fecha_programada: t.fecha_programada,
          planta_nombre: t.plantas?.nombre ?? "—",
          cliente_nombre: t.plantas?.clientes?.nombre ?? "—",
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (b.fecha_programada ?? "").localeCompare(a.fecha_programada ?? ""),
    );
  });

export const copiarTrabajoRecursos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      source_trabajo_id: z.string().uuid(),
      target_trabajo_id: z.string().uuid(),
      modo: z.enum(["agregar", "reemplazar"]).default("agregar"),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.source_trabajo_id === data.target_trabajo_id) {
      throw new Error("El trabajo origen y destino no pueden ser el mismo.");
    }
    const { data: src, error: e1 } = await context.supabase
      .from("trabajo_recursos")
      .select("categoria, descripcion, cantidad, unidad, item_id, equipo_id, notas")
      .eq("trabajo_id", data.source_trabajo_id);
    if (e1) throw new Error(e1.message);
    const rows = (src ?? []) as any[];
    if (rows.length === 0) throw new Error("El trabajo origen no tiene recursos.");

    if (data.modo === "reemplazar") {
      const { error: eDel } = await context.supabase
        .from("trabajo_recursos")
        .delete()
        .eq("trabajo_id", data.target_trabajo_id);
      if (eDel) throw new Error(eDel.message);
    }

    const payload = rows.map((r) => ({
      trabajo_id: data.target_trabajo_id,
      categoria: r.categoria,
      descripcion: r.descripcion,
      cantidad: r.cantidad,
      unidad: r.unidad,
      item_id: r.item_id,
      equipo_id: r.equipo_id,
      notas: r.notas,
      entregado: false,
      devuelto: false,
    }));
    const { error: eIns } = await context.supabase.from("trabajo_recursos").insert(payload);
    if (eIns) throw new Error(eIns.message);
    return { ok: true, copiados: payload.length };
  });