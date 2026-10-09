import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureFeriadosCargados } from "./helpers";

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Una sola ida y vuelta a la base de datos (RPC agregada) — mucho más rápido cuando hay muchas OTs.
    const { data, error } = await context.supabase.rpc("dashboard_kpis_v1" as any);
    if (error) throw new Error(error.message);
    const k: any = data ?? {};
    const paneles_parque = Number(k.paneles_parque ?? 0);
    const paneles_limpiados = Number(k.paneles_limpiados ?? 0);

    // ---- Ajustes de negocio ----
    // Días hábiles SV: si hoy es sábado, domingo o feriado, "Trabajos hoy"
    // se pausa y se comunica el próximo día hábil.
    const { ahoraSV, esNoLaborableSV, siguienteDiaHabilSV, formatearDiaHabilSV } =
      await import("@/lib/dias-habiles");
    const { hoyKeyTZ, trabajoActivoEnDia } = await import("@/lib/hoy-config");
    await ensureFeriadosCargados(context.supabase, new Date().toISOString());
    const nowSv = ahoraSV();
    const hoySv = new Date(nowSv); hoySv.setHours(0, 0, 0, 0);
    const dia_no_laborable = esNoLaborableSV(hoySv);
    let trabajos_hoy = 0;
    let siguiente_dia_habil: string | null = null;
    if (dia_no_laborable) {
      const proximo = siguienteDiaHabilSV(hoySv, false);
      siguiente_dia_habil = formatearDiaHabilSV(proximo);
    }
    {
      const { data: trabajosRef } = await context.supabase
        .from("trabajos")
        .select("id, fecha_programada, duracion_dias, estado")
        .neq("estado", "cancelado");
      const filas = (trabajosRef ?? []) as any[];
      // Excepciones de día (reprogramaciones puntuales), igual que en Programación.
      const excepcionesPorTrabajo = new Map<string, Array<{ fecha_original: string; fecha_movida: string }>>();
      if (filas.length > 0) {
        const { data: excs } = await context.supabase
          .from("trabajo_dia_excepciones")
          .select("trabajo_id, fecha_original, fecha_movida")
          .in("trabajo_id", filas.map((t) => t.id));
        (excs ?? []).forEach((e: any) => {
          const arr = excepcionesPorTrabajo.get(e.trabajo_id) ?? [];
          arr.push({ fecha_original: e.fecha_original, fecha_movida: e.fecha_movida });
          excepcionesPorTrabajo.set(e.trabajo_id, arr);
        });
      }
      const hoyKey = hoyKeyTZ();
      trabajos_hoy = filas.filter((t) =>
        trabajoActivoEnDia(
          {
            fecha_programada: t.fecha_programada,
            duracion_dias: t.duracion_dias,
            excepciones_dia: excepcionesPorTrabajo.get(t.id) ?? [],
          },
          hoyKey,
        ),
      ).length;
    }
    // Si hoy es feriado o fin de semana pero hay OT activas (autorizadas por
    // emergencia), el KPI debe mostrar el conteo real y no "Pausa".
    const mostrar_pausa = dia_no_laborable && trabajos_hoy === 0;

    // "Avance de limpieza" = paneles limpiados acumulados / total de paneles
    // instalados en las plantas que tienen una OT de limpieza EN PROGRESO.
    const { data: trabProg } = await context.supabase
      .from("trabajos")
      .select("id, planta_id, servicio")
      .eq("estado", "en_progreso")
      .ilike("servicio", "%limpieza%");
    const plantasEnProgreso = new Set<string>();
    const trabajosProgresoIds = new Set<string>();
    for (const t of (trabProg ?? []) as any[]) {
      if (t.planta_id) plantasEnProgreso.add(t.planta_id);
      trabajosProgresoIds.add(t.id);
    }
    let limpiadosProgreso = 0;
    let parqueProgreso = 0;
    if (trabajosProgresoIds.size > 0) {
      const ids = Array.from(trabajosProgresoIds);
      const [{ data: repDiarios }, { data: repBase }, { data: plantasRows }] = await Promise.all([
        context.supabase
          .from("trabajo_reportes_diarios")
          .select("paneles_limpiados, trabajo_id")
          .in("trabajo_id", ids)
          .not("paneles_limpiados", "is", null),
        context.supabase
          .from("trabajo_reportes")
          .select("paneles_limpiados, trabajo_id")
          .in("trabajo_id", ids)
          .not("paneles_limpiados", "is", null),
        context.supabase
          .from("plantas")
          .select("id, paneles")
          .in("id", Array.from(plantasEnProgreso)),
      ]);
      for (const r of [...(repDiarios ?? []), ...(repBase ?? [])] as any[]) {
        limpiadosProgreso += Number(r.paneles_limpiados ?? 0);
      }
      parqueProgreso = (plantasRows ?? []).reduce((s: number, p: any) => s + Number(p.paneles ?? 0), 0);
    }
    const avance_limpieza = parqueProgreso > 0
      ? Math.min(100, Math.round((limpiadosProgreso / parqueProgreso) * 100))
      : 0;

    return {
      trabajos_hoy,
      dia_no_laborable: mostrar_pausa,
      siguiente_dia_habil: mostrar_pausa ? siguiente_dia_habil : null,
      equipos_operativos: Number(k.equipos_operativos ?? 0),
      equipos_total: Number(k.equipos_total ?? 0),
      eficiencia: String(k.eficiencia ?? "--"),
      alertas: Number(k.alertas ?? 0),
      trabajos_total: Number(k.trabajos_total ?? 0),
      inv_bajo_stock: Number(k.inv_bajo_stock ?? 0),
      reportes_borrador: Number(k.reportes_borrador ?? 0),
      paneles_limpiados,
      paneles_parque,
      avance_limpieza,
      avance_limpiados: limpiadosProgreso,
      avance_parque: parqueProgreso,
      agua_galones: Number(k.agua_galones ?? 0),
      anomalias_detectadas: Number(k.anomalias_detectadas ?? 0),
    };
  });
