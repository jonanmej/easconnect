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
      .select("id, nombre, rut, contacto, email, telefono, capacidad, estado, contrato_om, cuota_preventivos, cuota_correctivos, cuota_menores, cuota_medios, cuota_mayores, cuota_limpiezas, created_at")
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
      email: z.string().email().nullable().optional().or(z.literal("")),
      telefono: z.string().nullable().optional(),
      capacidad: z.string().nullable().optional(),
      estado: ClienteEstado,
      contrato_om: z.coerce.boolean().optional(),
      cuota_preventivos: z.coerce.number().int().min(0).optional(),
      cuota_correctivos: z.coerce.number().int().min(0).optional(),
      cuota_menores: z.coerce.number().int().min(0).optional(),
      cuota_medios: z.coerce.number().int().min(0).optional(),
      cuota_mayores: z.coerce.number().int().min(0).optional(),
      cuota_limpiezas: z.coerce.number().int().min(0).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, email, ...rest } = data;
    const payload: any = { ...rest, email: email || null };
    const q = id
      ? context.supabase.from("clientes").update(payload).eq("id", id).select().single()
      : context.supabase.from("clientes").insert(payload).select().single();
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
      .select("id, nombre, ubicacion, paneles, capacidad, eficiencia, ultima_limpieza, cliente_id, notificaciones_completado, email_notificaciones, sla_horas_respuesta, sla_horas_resolucion, latitud, longitud, clientes(nombre)")
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
      notificaciones_completado: z.coerce.boolean().optional(),
      email_notificaciones: z.string().email().nullable().optional().or(z.literal("")),
      sla_horas_respuesta: z.coerce.number().int().min(0).nullable().optional(),
      sla_horas_resolucion: z.coerce.number().int().min(0).nullable().optional(),
      latitud: z.coerce.number().min(-90).max(90).nullable().optional(),
      longitud: z.coerce.number().min(-180).max(180).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, email_notificaciones, ...rest } = data;
    const payload: any = { ...rest };
    if (email_notificaciones !== undefined) payload.email_notificaciones = email_notificaciones || null;
    const q = id
      ? context.supabase.from("plantas").update(payload).eq("id", id).select().single()
      : context.supabase.from("plantas").insert(payload).select().single();
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

const TrabajoEstado = z.enum(["programado", "en_progreso", "completado", "cancelado"]);

export const listTrabajos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trabajos")
      .select(
        "id, folio, servicio, fecha_programada, fecha_completado, estado, notas, planta_id, equipo_id, tecnico_id, firmado_at, firmado_por, plantas(nombre, clientes(nombre))",
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
      equipo_ids: z.array(z.string().uuid()).optional(),
      servicio: z.string().min(1),
      fecha_programada: z.string(),
      estado: TrabajoEstado,
      tecnico_id: z.string().uuid().nullable().optional(),
      notas: z.string().nullable().optional(),
      duracion_dias: z.coerce.number().int().min(1).max(60).optional(),
      origen: z.enum(["staff", "cliente"]).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, equipo_ids, ...rest } = data;
    const payload = {
      ...rest,
      equipo_id: rest.equipo_id || (equipo_ids && equipo_ids[0]) || null,
      tecnico_id: rest.tecnico_id || null,
      fecha_programada: new Date(rest.fecha_programada).toISOString(),
    };
    let estadoPrevio: string | null = null;
    if (id) {
      const { data: prev } = await context.supabase.from("trabajos").select("estado").eq("id", id).single();
      estadoPrevio = (prev as any)?.estado ?? null;
    }
    const q = id
      ? context.supabase.from("trabajos").update(payload).eq("id", id).select().single()
      : context.supabase.from("trabajos").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    // Sincronizar asignaciones múltiples (trabajo_equipos)
    if (equipo_ids) {
      const trabajoId = (row as any).id;
      await context.supabase.from("trabajo_equipos").delete().eq("trabajo_id", trabajoId);
      if (equipo_ids.length > 0) {
        const rows = equipo_ids.map((eid) => ({ trabajo_id: trabajoId, equipo_id: eid }));
        const { error: errIns } = await context.supabase.from("trabajo_equipos").insert(rows);
        if (errIns) throw new Error(errIns.message);
      }
    }
    // Notificación automática al cliente cuando un trabajo pasa a "completado"
    if (id && rest.estado === "completado" && estadoPrevio !== "completado") {
      try {
        const { data: planta } = await context.supabase
          .from("plantas").select("notificaciones_completado, email_notificaciones")
          .eq("id", rest.planta_id).single();
        if ((planta as any)?.notificaciones_completado && (planta as any)?.email_notificaciones) {
          const { enviarNotificacionTrabajo } = await import("@/lib/notificaciones.functions");
          await enviarNotificacionTrabajo({ data: { trabajo_id: id } } as any).catch(() => {});
        }
      } catch {/* silenciar errores de notificación para no bloquear el guardado */}
    }
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

export const reprogramarTrabajo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      fecha_programada: z.string().min(1),
      tecnico_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: any = { fecha_programada: new Date(data.fecha_programada).toISOString() };
    if (data.tecnico_id !== undefined) patch.tecnico_id = data.tecnico_id || null;
    const { data: row, error } = await context.supabase
      .from("trabajos").update(patch).eq("id", data.id).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

// ============ Dashboard KPIs ============

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);

    const [trabajosHoy, trabajosTotal, equipos, inv, reps, repsLimpieza, anomalias, plantasPaneles] = await Promise.all([
      supabase.from("trabajos").select("id", { count: "exact", head: true })
        .gte("fecha_programada", todayStart.toISOString())
        .lt("fecha_programada", todayEnd.toISOString()),
      supabase.from("trabajos").select("id, estado", { count: "exact" }),
      supabase.from("equipos").select("id, estado, salud"),
      supabase.from("inventario_items").select("stock_actual, stock_minimo"),
      supabase.from("reportes").select("id, estado"),
      supabase.from("trabajo_reportes").select("paneles_limpiados, agua_galones"),
      supabase.from("trabajo_evidencias").select("id", { count: "exact", head: true }).eq("categoria", "anomalia"),
      supabase.from("plantas").select("paneles"),
    ]);

    const eqs = equipos.data ?? [];
    const operativos = eqs.filter((e) => e.estado === "operativo").length;
    const saludValores = eqs.map((e) => e.salud).filter((s): s is number => typeof s === "number");
    const eficiencia = saludValores.length
      ? (saludValores.reduce((a, b) => a + b, 0) / saludValores.length).toFixed(1)
      : "--";
    const alertas = eqs.filter((e) => e.estado === "mantenimiento" || e.estado === "fuera_servicio").length;

    const repLimp = repsLimpieza.data ?? [];
    const panelesLimpiados = repLimp.reduce((s: number, r: any) => s + Number(r.paneles_limpiados ?? 0), 0);
    const aguaGalones = repLimp.reduce((s: number, r: any) => s + Number(r.agua_galones ?? 0), 0);
    const panelesParque = (plantasPaneles.data ?? []).reduce((s: number, p: any) => s + Number(p.paneles ?? 0), 0);
    const avanceLimpieza = panelesParque > 0 ? Math.min(100, Math.round((panelesLimpiados / panelesParque) * 100)) : 0;

    return {
      trabajos_hoy: trabajosHoy.count ?? 0,
      equipos_operativos: operativos,
      equipos_total: eqs.length,
      eficiencia,
      alertas,
      trabajos_total: trabajosTotal.count ?? 0,
      inv_bajo_stock: (inv.data ?? []).filter((i: any) => Number(i.stock_actual) < Number(i.stock_minimo)).length,
      reportes_borrador: (reps.data ?? []).filter((r: any) => r.estado === "borrador").length,
      paneles_limpiados: panelesLimpiados,
      paneles_parque: panelesParque,
      avance_limpieza: avanceLimpieza,
      agua_galones: Math.round(aguaGalones),
      anomalias_detectadas: anomalias.count ?? 0,
    };
  });