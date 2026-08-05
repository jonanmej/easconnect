import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const week1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7);
}

/** Series de trabajos por semana (últimas 12 semanas), apilado por estado. */
export const dashboardSeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const desde = startOfWeek(addDays(new Date(), -7 * 11));
    const { data, error } = await context.supabase
      .from("trabajos")
      .select("estado, fecha_programada, servicio, planta_id, plantas(nombre)")
      .gte("fecha_programada", desde.toISOString());
    if (error) throw new Error(error.message);

    // 12 semanas
    const weeks: { semana: string; programado: number; en_progreso: number; completado: number; cancelado: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const ws = addDays(desde, i * 7);
      weeks.push({ semana: `S${isoWeek(ws)}`, programado: 0, en_progreso: 0, completado: 0, cancelado: 0 });
    }

    const tipos = new Map<string, number>();
    const plantas = new Map<string, { nombre: string; count: number }>();

    (data ?? []).forEach((t: any) => {
      const f = new Date(t.fecha_programada);
      const idx = Math.floor((startOfWeek(f).getTime() - desde.getTime()) / (7 * 86400000));
      if (idx >= 0 && idx < 12) {
        const w = weeks[idx];
        const key = (t.estado as keyof typeof w);
        if (key in w) (w[key] as number) += 1;
      }
      const tipo = (t.servicio ?? "Otro").split(" ")[0] || "Otro";
      tipos.set(tipo, (tipos.get(tipo) ?? 0) + 1);
      if (t.planta_id) {
        const cur = plantas.get(t.planta_id) ?? { nombre: t.plantas?.nombre ?? "—", count: 0 };
        cur.count += 1;
        plantas.set(t.planta_id, cur);
      }
    });

    const porTipo = Array.from(tipos.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
    const topPlantas = Array.from(plantas.values()).sort((a, b) => b.count - a.count).slice(0, 5);

    return { weeks, porTipo, topPlantas };
  });

/** Contadores para badges de alerta del sidebar. */
export const dashboardAlertas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const dosDiasAtras = addDays(new Date(), -2).toISOString();
    const [sla, inv, sol] = await Promise.all([
      supabase.from("trabajos_sla").select("estado_sla").eq("estado_sla", "vencido"),
      supabase.from("inventario_items").select("stock_actual, stock_minimo"),
      supabase.from("solicitudes_visita").select("id, created_at").eq("estado", "pendiente").lte("created_at", dosDiasAtras),
    ]);
    const bajoStock = (inv.data ?? []).filter((i: any) => Number(i.stock_actual) < Number(i.stock_minimo)).length;
    return {
      sla_vencidos: (sla.data ?? []).length,
      stock_critico: bajoStock,
      solicitudes_estancadas: (sol.data ?? []).length,
    };
  });

/** Lista trabajos con su estado SLA, para vista de alertas. */
export const listTrabajosSla = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trabajos_sla")
      .select("id, folio, planta_id, servicio, estado, fecha_programada, fecha_completado, horas_transcurridas, estado_sla, sla_horas_resolucion")
      .order("fecha_programada", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.planta_id)));
    let nombres = new Map<string, { planta: string; cliente: string }>();
    if (ids.length) {
      const { data: plantas } = await context.supabase
        .from("plantas").select("id, nombre, clientes(nombre)").in("id", ids);
      (plantas ?? []).forEach((p: any) => nombres.set(p.id, { planta: p.nombre, cliente: p.clientes?.nombre ?? "—" }));
    }
    return (data ?? []).map((r: any) => ({
      ...r,
      planta_nombre: nombres.get(r.planta_id)?.planta ?? "—",
      cliente_nombre: nombres.get(r.planta_id)?.cliente ?? "—",
    }));
  });

/** Galones de agua usados para limpieza, agrupados por planta. */
export const aguaPorPlanta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [baseRes, diariosRes] = await Promise.all([
      context.supabase
        .from("trabajo_reportes")
        .select("agua_galones, trabajos!inner(planta_id, plantas(nombre, clientes(nombre)))")
        .not("agua_galones", "is", null),
      context.supabase
        .from("trabajo_reportes_diarios")
        .select("agua_galones, trabajos!inner(planta_id, plantas(nombre, clientes(nombre)))")
        .not("agua_galones", "is", null),
    ]);
    if (baseRes.error) throw new Error(baseRes.error.message);
    if (diariosRes.error) throw new Error(diariosRes.error.message);
    const map = new Map<string, { planta_id: string; nombre: string; cliente: string; galones: number }>();
    [...(baseRes.data ?? []), ...(diariosRes.data ?? [])].forEach((r: any) => {
      const pid = r.trabajos?.planta_id;
      if (!pid) return;
      const cur = map.get(pid) ?? {
        planta_id: pid,
        nombre: r.trabajos?.plantas?.nombre ?? "—",
        cliente: r.trabajos?.plantas?.clientes?.nombre ?? "—",
        galones: 0,
      };
      cur.galones += Number(r.agua_galones ?? 0);
      map.set(pid, cur);
    });
    const filas = Array.from(map.values()).sort((a, b) => b.galones - a.galones);
    const total = filas.reduce((s, r) => s + r.galones, 0);
    return { filas, total };
  });

/**
 * Paneles limpiados por trabajo de limpieza (completado o en curso),
 * agrupados por cliente y planta. Cada fila incluye la lista de trabajos
 * (folio, fecha, estado, paneles) para poder mostrar el detalle en el dashboard.
 */
export const panelesLimpiadosPorPlanta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    // 1. Trabajos de limpieza completados o en curso.
    const { data: trabajos, error } = await supabase
      .from("trabajos")
      .select("id, folio, servicio, estado, fecha_programada, fecha_completado, planta_id, plantas(nombre, paneles, clientes(nombre))")
      .in("estado", ["completado", "en_progreso"])
      .ilike("servicio", "%limpieza%")
      .order("fecha_completado", { ascending: false });
    if (error) throw new Error(error.message);
    const trabajosArr = (trabajos ?? []) as any[];
    if (trabajosArr.length === 0) return { filas: [], total_paneles: 0, total_ciclos: 0 };

    // 2. Sumar paneles limpiados desde reportes diarios y reportes base.
    const ids = trabajosArr.map((t) => t.id);
    const [diariosRes, baseRes] = await Promise.all([
      supabase.from("trabajo_reportes_diarios")
        .select("trabajo_id, paneles_limpiados").in("trabajo_id", ids),
      supabase.from("trabajo_reportes")
        .select("trabajo_id, paneles_limpiados").in("trabajo_id", ids),
    ]);
    const panelesPorTrabajo = new Map<string, number>();
    for (const r of [...(diariosRes.data ?? []), ...(baseRes.data ?? [])] as any[]) {
      const val = Number(r.paneles_limpiados ?? 0);
      if (!val) continue;
      panelesPorTrabajo.set(r.trabajo_id, (panelesPorTrabajo.get(r.trabajo_id) ?? 0) + val);
    }

    // 3. Agrupar por planta.
    type Ciclo = { trabajo_id: string; folio: string; fecha: string | null; estado: string; paneles: number };
    type Fila = {
      planta_id: string;
      planta: string;
      cliente: string;
      paneles_planta: number;
      ciclos: Ciclo[];
      paneles_limpiados: number;
    };
    const mapa = new Map<string, Fila>();
    for (const t of trabajosArr) {
      const pid = t.planta_id;
      if (!pid) continue;
      const paneles = panelesPorTrabajo.get(t.id) ?? 0;
      if (paneles === 0) continue;
      const fila: Fila = mapa.get(pid) ?? {
        planta_id: pid,
        planta: t.plantas?.nombre ?? "—",
        cliente: t.plantas?.clientes?.nombre ?? "—",
        paneles_planta: Number(t.plantas?.paneles ?? 0),
        ciclos: [],
        paneles_limpiados: 0,
      };
      fila.ciclos.push({
        trabajo_id: t.id,
        folio: t.folio,
        fecha: t.fecha_completado ?? t.fecha_programada,
        estado: t.estado,
        paneles,
      });
      fila.paneles_limpiados += paneles;
      mapa.set(pid, fila);
    }

    const filas = Array.from(mapa.values()).sort((a, b) => b.paneles_limpiados - a.paneles_limpiados);
    const total_paneles = filas.reduce((s, f) => s + f.paneles_limpiados, 0);
    const total_ciclos = filas.reduce((s, f) => s + f.ciclos.length, 0);
    return { filas, total_paneles, total_ciclos };
  });

/**
 * Meta de limpieza: para trabajos de limpieza en curso (o programados
 * cuya ventana ya inició), compara paneles limpiados vs paneles esperados
 * a la fecha, en función del parque de la planta y la duración planeada.
 *
 * expected(t) = paneles_planta * clamp(dias_transcurridos / duracion_dias, 0, 1)
 * actual(t)   = Σ paneles_limpiados en trabajo_reportes_diarios de ese trabajo
 *
 * Estado global (basado en avance total actual vs esperado):
 *  - "superada":   actual >= expected * 1.02
 *  - "cumpliendo": expected * 0.98 <= actual < expected * 1.02
 *  - "desface":    actual < expected * 0.98
 */
export const metaCumplimientoLimpieza = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const {
      ahoraSV,
      esNoLaborableSV,
      diaHabilAnteriorSV,
      siguienteDiaHabilSV,
      formatearDiaHabilSV,
    } = await import("@/lib/dias-habiles");
    const { data: trabajos, error } = await supabase
      .from("trabajos")
      .select("id, folio, estado, servicio, fecha_programada, duracion_dias, planta_id, plantas(nombre, paneles, clientes(nombre))")
      .in("estado", ["en_progreso", "programado"])
      .ilike("servicio", "%limpieza%");
    if (error) throw new Error(error.message);
    // Día de referencia: hoy si es hábil; si no, el último día hábil previo.
    const nowSv = ahoraSV();
    const refDay = new Date(nowSv); refDay.setHours(0, 0, 0, 0);
    if (esNoLaborableSV(refDay)) {
      const prev = diaHabilAnteriorSV(refDay);
      refDay.setTime(prev.getTime());
    }
    const dia_no_laborable = esNoLaborableSV(new Date(nowSv.getFullYear(), nowSv.getMonth(), nowSv.getDate()));
    const siguiente_dia_habil = dia_no_laborable
      ? formatearDiaHabilSV(siguienteDiaHabilSV(new Date(nowSv), false))
      : null;
    const refStart = refDay.getTime();
    const refEnd = refStart + 86400000 - 1;
    const activos = (trabajos ?? []).filter((t: any) => {
      const inicio = new Date(t.fecha_programada).getTime();
      return inicio <= refEnd;
    });
    if (activos.length === 0) {
      return {
        estado: "sin_datos" as const,
        cumplimiento_pct: 0,
        limpiados_dia: 0,
        meta_diaria: 0,
        num_trabajos: 0,
        dia_no_laborable,
        siguiente_dia_habil,
        fecha_ref: refDay.toISOString(),
        detalle: [] as any[],
      };
    }
    const ids = activos.map((t: any) => t.id);
    // Solo reportes diarios del día de referencia (limpiados hoy / último día hábil).
    const refStartIso = new Date(refStart).toISOString();
    const refEndIso = new Date(refEnd).toISOString();
    const [diariosDiaRes, diariosTotRes] = await Promise.all([
      supabase
        .from("trabajo_reportes_diarios")
        .select("trabajo_id, paneles_limpiados, fecha")
        .in("trabajo_id", ids)
        .gte("fecha", refStartIso)
        .lte("fecha", refEndIso),
      supabase
        .from("trabajo_reportes_diarios")
        .select("trabajo_id, paneles_limpiados")
        .in("trabajo_id", ids),
    ]);
    const dia_por_trabajo = new Map<string, number>();
    for (const r of (diariosDiaRes.data ?? []) as any[]) {
      const v = Number(r.paneles_limpiados ?? 0);
      if (!v) continue;
      dia_por_trabajo.set(r.trabajo_id, (dia_por_trabajo.get(r.trabajo_id) ?? 0) + v);
    }
    const total_por_trabajo = new Map<string, number>();
    for (const r of (diariosTotRes.data ?? []) as any[]) {
      const v = Number(r.paneles_limpiados ?? 0);
      if (!v) continue;
      total_por_trabajo.set(r.trabajo_id, (total_por_trabajo.get(r.trabajo_id) ?? 0) + v);
    }
    let limpiados_dia = 0;
    let meta_diaria = 0;
    const detalle: any[] = [];
    for (const t of activos as any[]) {
      const parque = Number(t.plantas?.paneles ?? 0);
      const duracion = Math.max(1, Number(t.duracion_dias ?? 1));
      const diaTrab = dia_por_trabajo.get(t.id) ?? 0;
      const acumulado = total_por_trabajo.get(t.id) ?? 0;
      // Meta base = parque / días planeados.
      const metaBase = Math.round(parque / duracion);
      // Meta diaria dinámica: lo que falta del parque repartido en los días
      // que restan de la OT. Si un día se limpió más del 100% de la meta,
      // ese excedente reduce automáticamente la meta de los días siguientes.
      const inicio = new Date(t.fecha_programada);
      const inicioDia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()).getTime();
      const finDia = inicioDia + (duracion - 1) * 86400000;
      const diasRestantes = Math.max(1, Math.round((finDia - refStart) / 86400000) + 1);
      const acumuladoPrevio = Math.max(0, acumulado - diaTrab);
      const restante = Math.max(0, parque - acumuladoPrevio);
      const metaTrab = parque > 0 ? Math.min(metaBase * diasRestantes, Math.ceil(restante / diasRestantes)) : 0;
      limpiados_dia += diaTrab;
      meta_diaria += metaTrab;
      detalle.push({
        trabajo_id: t.id,
        folio: t.folio,
        planta: t.plantas?.nombre ?? "—",
        cliente: t.plantas?.clientes?.nombre ?? "—",
        parque,
        duracion_dias: duracion,
        meta_diaria: metaTrab,
        meta_base: metaBase,
        dias_restantes: diasRestantes,
        pendiente_parque: restante,
        limpiados_dia: diaTrab,
        limpiados_acumulado: acumulado,
        desface: diaTrab - metaTrab,
      });
    }
    const cumplimiento_pct = meta_diaria > 0
      ? Math.round((limpiados_dia / meta_diaria) * 100)
      : 0;
    const estado = meta_diaria === 0
      ? "sin_datos"
      : cumplimiento_pct >= 102
        ? "superada"
        : cumplimiento_pct >= 98
          ? "cumpliendo"
          : "desface";
    return {
      estado,
      cumplimiento_pct,
      limpiados_dia,
      meta_diaria,
      num_trabajos: activos.length,
      dia_no_laborable,
      siguiente_dia_habil,
      fecha_ref: refDay.toISOString(),
      detalle: detalle.sort((a, b) => a.desface - b.desface),
    };
  });