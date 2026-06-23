import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ Clientes ============

const ClienteEstado = z.enum(["activo", "revision", "pausado"]);

export const listClientes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clientes")
      .select("id, nombre, rut, contacto, capacidad, estado, created_at")
      .order("nombre");
    if (error) throw new Error(error.message);
    // include planta count
    const { data: plantas } = await context.supabase
      .from("plantas")
      .select("cliente_id");
    const counts = new Map<string, number>();
    (plantas ?? []).forEach((p) => counts.set(p.cliente_id, (counts.get(p.cliente_id) ?? 0) + 1));
    return (data ?? []).map((c) => ({ ...c, plantas_count: counts.get(c.id) ?? 0 }));
  });

export const upsertCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      nombre: z.string().min(1),
      rut: z.string().nullable().optional(),
      contacto: z.string().nullable().optional(),
      capacidad: z.string().nullable().optional(),
      estado: ClienteEstado,
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const q = id
      ? context.supabase.from("clientes").update(rest).eq("id", id).select().single()
      : context.supabase.from("clientes").insert(rest).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("clientes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Plantas ============

export const listPlantas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("plantas")
      .select("id, nombre, ubicacion, paneles, capacidad, eficiencia, ultima_limpieza, cliente_id, clientes(nombre)")
      .order("nombre");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      ...p,
      cliente_nombre: p.clientes?.nombre ?? "—",
    }));
  });

export const upsertPlanta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      nombre: z.string().min(1),
      cliente_id: z.string().uuid(),
      ubicacion: z.string().nullable().optional(),
      paneles: z.coerce.number().int().min(0).default(0),
      capacidad: z.string().nullable().optional(),
      eficiencia: z.coerce.number().min(0).max(100).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const q = id
      ? context.supabase.from("plantas").update(rest).eq("id", id).select().single()
      : context.supabase.from("plantas").insert(rest).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePlanta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("plantas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Equipos ============

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
      codigo: z.string().min(1),
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
    const payload = { ...rest, planta_id: rest.planta_id || null };
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

const TrabajoEstado = z.enum(["programado", "en_progreso", "completado", "cancelado"]);

export const listTrabajos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trabajos")
      .select(
        "id, folio, servicio, fecha_programada, estado, notas, planta_id, equipo_id, tecnico_id, plantas(nombre, clientes(nombre))",
      )
      .order("fecha_programada", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((t: any) => ({
      ...t,
      planta_nombre: t.plantas?.nombre ?? "—",
      cliente_nombre: t.plantas?.clientes?.nombre ?? "—",
    }));
  });

export const upsertTrabajo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      planta_id: z.string().uuid(),
      equipo_id: z.string().uuid().nullable().optional(),
      servicio: z.string().min(1),
      fecha_programada: z.string(),
      estado: TrabajoEstado,
      tecnico_id: z.string().uuid().nullable().optional(),
      notas: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const payload = {
      ...rest,
      equipo_id: rest.equipo_id || null,
      tecnico_id: rest.tecnico_id || null,
      fecha_programada: new Date(rest.fecha_programada).toISOString(),
    };
    const q = id
      ? context.supabase.from("trabajos").update(payload).eq("id", id).select().single()
      : context.supabase.from("trabajos").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTrabajo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("trabajos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Dashboard KPIs ============

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);

    const [trabajosHoy, trabajosTotal, equipos, inv, reps] = await Promise.all([
      supabase.from("trabajos").select("id", { count: "exact", head: true })
        .gte("fecha_programada", todayStart.toISOString())
        .lt("fecha_programada", todayEnd.toISOString()),
      supabase.from("trabajos").select("id, estado", { count: "exact" }),
      supabase.from("equipos").select("id, estado, salud"),
      supabase.from("inventario_items").select("stock_actual, stock_minimo"),
      supabase.from("reportes").select("id, estado"),
    ]);

    const eqs = equipos.data ?? [];
    const operativos = eqs.filter((e) => e.estado === "operativo").length;
    const saludValores = eqs.map((e) => e.salud).filter((s): s is number => typeof s === "number");
    const eficiencia = saludValores.length
      ? (saludValores.reduce((a, b) => a + b, 0) / saludValores.length).toFixed(1)
      : "--";
    const alertas = eqs.filter((e) => e.estado === "mantenimiento" || e.estado === "fuera_servicio").length;

    return {
      trabajos_hoy: trabajosHoy.count ?? 0,
      equipos_operativos: operativos,
      equipos_total: eqs.length,
      eficiencia,
      alertas,
      trabajos_total: trabajosTotal.count ?? 0,
      inv_bajo_stock: (inv.data ?? []).filter((i: any) => Number(i.stock_actual) < Number(i.stock_minimo)).length,
      reportes_borrador: (reps.data ?? []).filter((r: any) => r.estado === "borrador").length,
    };
  });