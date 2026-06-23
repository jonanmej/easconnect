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