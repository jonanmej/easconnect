import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { AlertTriangle, Boxes, CalendarPlus, ClipboardList, Droplets, Plus, Sparkles, Sun, TrendingUp } from "lucide-react";
import { dashboardStats, listPlantas, listTrabajos } from "@/lib/operations.functions";
import { dashboardSeries, dashboardAlertas, listTrabajosSla, aguaPorPlanta, panelesLimpiadosPorPlanta, metaCumplimientoLimpieza } from "@/lib/dashboard.functions";
import { cumplimientoAnual } from "@/lib/contratos.functions";
import { ExportButton } from "@/components/ExportButton";
import { exportarExcel, fmtFechaSV } from "@/lib/excel";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";

// Carga diferida de los gráficos pesados (recharts) — reduce tiempo de primer pintado.
const StaffCharts = {
  TrabajosSemanaChart: lazy(() => import("@/components/dashboard/StaffCharts").then((m) => ({ default: m.TrabajosSemanaChart }))),
  DistribucionTipoChart: lazy(() => import("@/components/dashboard/StaffCharts").then((m) => ({ default: m.DistribucionTipoChart }))),
  TopPlantasChart: lazy(() => import("@/components/dashboard/StaffCharts").then((m) => ({ default: m.TopPlantasChart }))),
  AguaPlantaChart: lazy(() => import("@/components/dashboard/StaffCharts").then((m) => ({ default: m.AguaPlantaChart }))),
};
const ChartSkeleton = () => <Skeleton className="h-64 w-full" />;

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard · EA Service Connect" },
      { name: "description", content: "Panel operativo: trabajos, equipos, SLA y alertas en tiempo real." },
      { property: "og:title", content: "Dashboard · EA Service Connect" },
      { property: "og:description", content: "Panel operativo de mantenimiento solar y térmico." },
    ],
  }),
  component: Index,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">No encontrado.</div>,
});

function Index() {
  const { roles } = useAuth();
  if (highestRole(roles) === "cliente") return <ClienteDashboard />;
  return <StaffDashboard />;
}

function PanelesLimpiadosHistorico({ data, loading }: { data: any; loading: boolean }) {
  const filas = (data?.filas as any[] | undefined) ?? [];
  const totalPaneles = Number(data?.total_paneles ?? 0);
  const totalCiclos = Number(data?.total_ciclos ?? 0);
  return (
    <section className="bg-card border border-border rounded-xl p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-accent">Paneles limpiados · por trabajo</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Paneles limpiados por trabajo (completado o en curso) para cada cliente y planta con registro diario ingresado.
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-mono font-semibold text-accent tracking-tight">
            {totalPaneles.toLocaleString("es-SV")}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            en {totalCiclos} ciclo{totalCiclos === 1 ? "" : "s"} completado{totalCiclos === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : filas.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          Aún no hay ciclos de limpieza cerrados con paneles registrados.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Planta</th>
                <th className="px-3 py-2 text-right">Ciclos</th>
                <th className="px-3 py-2 text-right">Paneles limpiados</th>
                <th className="px-3 py-2 text-right">Parque</th>
                <th className="px-3 py-2 text-left">Detalle por ciclo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((f) => (
                <tr key={f.planta_id} className="align-top">
                  <td className="px-3 py-2">{f.cliente}</td>
                  <td className="px-3 py-2">{f.planta}</td>
                  <td className="px-3 py-2 text-right font-mono">{f.ciclos.length}</td>
                  <td className="px-3 py-2 text-right font-mono text-accent">
                    {Number(f.paneles_limpiados).toLocaleString("es-SV")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                    {f.paneles_planta ? Number(f.paneles_planta).toLocaleString("es-SV") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-primary hover:underline">
                        Ver {f.ciclos.length} ciclo{f.ciclos.length === 1 ? "" : "s"}
                      </summary>
                      <ul className="mt-2 space-y-1 text-xs">
                        {f.ciclos.map((c: any) => (
                          <li key={c.trabajo_id} className="flex items-center justify-between gap-3 border-l-2 border-accent/40 pl-2">
                            <span className="font-mono text-muted-foreground">{c.folio}</span>
                            <span className="text-muted-foreground">
                              {c.fecha ? new Date(c.fecha).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" }) : "—"}
                            </span>
                            <span className="font-mono font-semibold">{Number(c.paneles).toLocaleString("es-SV")}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CumplimientoContratos() {
  const fCump = useServerFn(cumplimientoAnual);
  const cump = useQuery({ queryKey: ["cumplimiento-anual"], queryFn: () => fCump(), staleTime: 60_000 });
  const data = cump.data;
  const filas = (data?.filas as any[] | undefined) ?? [];
  return (
    <section className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider">Cumplimiento de servicios contratados {data ? `· ${data.anio}` : ""}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data ? `${data.total_completado} de ${data.total_contratado} completados (${data.cumplimiento_pct}%)` : "Cargando…"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-mono font-semibold">{data?.cumplimiento_pct ?? 0}%</p>
        </div>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden mb-4">
        <div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, data?.cumplimiento_pct ?? 0)}%` }} />
      </div>
      {filas.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Aún no hay contratos definidos para el año en curso.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Planta</th>
                <th className="px-3 py-2 text-left">Servicio</th>
                <th className="px-3 py-2 text-right">Contratados</th>
                <th className="px-3 py-2 text-right">Completados</th>
                <th className="px-3 py-2 text-right">Programados</th>
                <th className="px-3 py-2 text-right">Cumplimiento</th>
                <th className="px-3 py-2 text-left">Próxima</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((f) => (
                <tr key={f.contrato_id}>
                  <td className="px-3 py-2">{f.planta_nombre}</td>
                  <td className="px-3 py-2">{f.servicio}</td>
                  <td className="px-3 py-2 text-right font-mono">{f.cantidad_anual}</td>
                  <td className="px-3 py-2 text-right font-mono text-accent">{f.completados}</td>
                  <td className="px-3 py-2 text-right font-mono">{f.programados}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={"inline-flex items-center gap-2"}>
                      <span className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <span className="block h-full bg-accent" style={{ width: `${Math.min(100, Number(f.cumplimiento_pct))}%` }} />
                      </span>
                      <span className="font-mono text-xs">{Number(f.cumplimiento_pct)}%</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {f.proxima_fecha ? new Date(f.proxima_fecha).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StaffDashboard() {
  const fetchStats = useServerFn(dashboardStats);
  const fetchSeries = useServerFn(dashboardSeries);
  const fetchAlertas = useServerFn(dashboardAlertas);
  const fetchSla = useServerFn(listTrabajosSla);
  const fetchAgua = useServerFn(aguaPorPlanta);
  const fetchPaneles = useServerFn(panelesLimpiadosPorPlanta);
  const fetchMeta = useServerFn(metaCumplimientoLimpieza);
  // Cache durante 60s para evitar recomputos en tabs/cambios rápidos.
  const qOpts = { staleTime: 60_000, refetchOnWindowFocus: false } as const;
  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => fetchStats(), ...qOpts });
  const series = useQuery({ queryKey: ["dashboard-series"], queryFn: () => fetchSeries(), ...qOpts });
  const alertas = useQuery({ queryKey: ["alertas-sidebar"], queryFn: () => fetchAlertas(), ...qOpts });
  const sla = useQuery({ queryKey: ["trabajos-sla"], queryFn: () => fetchSla(), ...qOpts });
  const agua = useQuery({ queryKey: ["agua-por-planta"], queryFn: () => fetchAgua(), ...qOpts });
  const panelesQ = useQuery({ queryKey: ["paneles-por-planta"], queryFn: () => fetchPaneles(), ...qOpts });
  const metaQ = useQuery({ queryKey: ["meta-limpieza"], queryFn: () => fetchMeta(), ...qOpts });
  const fetchTrabajos = useServerFn(listTrabajos);
  const trabajosQ = useQuery({ queryKey: ["trabajos"], queryFn: () => fetchTrabajos(), ...qOpts });

  // Cumplimiento del cronograma: completados a tiempo / actividades programadas vencidas × 100.
  // "A tiempo" = fecha_completado <= fecha_programada + duracion_dias.
  const cumplimientoCronograma = (() => {
    const ts = (trabajosQ.data as any[] | undefined) ?? [];
    const ahora = Date.now();
    const vencidas = ts.filter((t) => {
      const prog = new Date(t.fecha_programada).getTime();
      const dur = Math.max(1, Number(t.duracion_dias ?? 1));
      return prog + dur * 86400000 <= ahora && (t.estado === "completado" || t.estado === "programado" || t.estado === "en_progreso");
    });
    if (vencidas.length === 0) return { pct: 100, num: 0, den: 0 };
    const aTiempo = vencidas.filter((t) => {
      if (t.estado !== "completado" || !t.fecha_completado) return false;
      const prog = new Date(t.fecha_programada).getTime();
      const dur = Math.max(1, Number(t.duracion_dias ?? 1));
      return new Date(t.fecha_completado).getTime() <= prog + dur * 86400000;
    }).length;
    return { pct: Math.round((aTiempo / vencidas.length) * 100), num: aTiempo, den: vencidas.length };
  })();

  // Paneles limpiados por ciclo de limpieza completado.
  const ciclos = (() => {
    const ts = (trabajosQ.data as any[] | undefined) ?? [];
    return ts.filter((t) => t.estado === "completado" && String(t.servicio ?? "").toLowerCase().includes("limpieza")).length;
  })();
  // Meta de limpieza: reemplaza el KPI "Incidentes de seguridad".
  const meta = metaQ.data as any | undefined;
  const metaKpi = (() => {
    if (!meta || meta.estado === "sin_datos") {
      return { value: "—", delta: "sin trabajos activos", tone: "muted" as const };
    }
    const valor = `${meta.cumplimiento_pct}%`;
    const detalle = `${Number(meta.limpiados_dia).toLocaleString("es-SV")}/${Number(meta.meta_diaria).toLocaleString("es-SV")} paneles${meta.dia_no_laborable ? " · último día hábil" : " · hoy"}`;
    const tone: "accent" | "danger" | "muted" =
      meta.estado === "desface" ? "danger" : "accent";
    return { value: valor, delta: detalle, tone };
  })();

  // Paneles limpiados vs. parque de las plantas con al menos un trabajo cerrado.
  const panelesResumen = (() => {
    const filas = (panelesQ.data?.filas as any[] | undefined) ?? [];
    const limpiados = filas.reduce((s, f) => s + Number(f.paneles_limpiados ?? 0), 0);
    const parque = filas.reduce((s, f) => s + Number(f.paneles_planta ?? 0), 0);
    return { limpiados, parque };
  })();

  const trabajosHoyKpi = (() => {
    const s: any = stats.data;
    if (s?.dia_no_laborable) {
      return {
        value: "Pausa",
        delta: s.siguiente_dia_habil ? `Se reanuda el ${s.siguiente_dia_habil}` : "Día no laborable",
        tone: "muted" as const,
      };
    }
    return {
      value: String(s?.trabajos_hoy ?? "—"),
      delta: `${s?.trabajos_total ?? 0} totales`,
      tone: "accent" as const,
    };
  })();

  const avanceLimpiezaKpi = (() => {
    const s: any = stats.data;
    const pct = Number(s?.avance_limpieza ?? 0);
    const limp = Number(s?.avance_limpiados ?? 0);
    const parque = Number(s?.avance_parque ?? 0);
    return {
      value: `${pct}%`,
      delta: parque > 0
        ? `${limp.toLocaleString("es-SV")}/${parque.toLocaleString("es-SV")} paneles en curso`
        : "sin OT en progreso",
      tone: parque > 0 ? ("accent" as const) : ("muted" as const),
    };
  })();

  const kpis = [
    { label: "Trabajos hoy", value: trabajosHoyKpi.value, delta: trabajosHoyKpi.delta, tone: trabajosHoyKpi.tone },
    {
      label: "Paneles limpiados",
      value: panelesResumen.limpiados.toLocaleString("es-SV"),
      delta: panelesResumen.parque
        ? `de ${panelesResumen.parque.toLocaleString("es-SV")} en plantas trabajadas`
        : "sin trabajos cerrados",
      tone: "accent" as const,
    },
    { label: "Avance de limpieza", value: avanceLimpiezaKpi.value, delta: avanceLimpiezaKpi.delta, tone: avanceLimpiezaKpi.tone },
    { label: "Agua utilizada", value: (stats.data?.agua_galones ?? 0).toLocaleString("es-SV", ), delta: "galones", tone: "accent" as const },
    { label: "Cumplimiento cronograma", value: `${cumplimientoCronograma.pct}%`, delta: `${cumplimientoCronograma.num}/${cumplimientoCronograma.den} a tiempo`, tone: cumplimientoCronograma.pct >= 90 ? "accent" as const : cumplimientoCronograma.pct >= 70 ? "muted" as const : "danger" as const },
    { label: "Meta de limpieza", value: metaKpi.value, delta: metaKpi.delta, tone: metaKpi.tone },
    { label: "Equipos operativos", value: `${stats.data?.equipos_operativos ?? 0}/${stats.data?.equipos_total ?? 0}`, delta: "", tone: "muted" as const },
    { label: "Bajo stock", value: String(stats.data?.inv_bajo_stock ?? 0).padStart(2, "0"), delta: stats.data?.inv_bajo_stock ? "SKUs" : "OK", tone: stats.data?.inv_bajo_stock ? "danger" as const : "muted" as const },
  ];

  const hoy = new Date().toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", weekday: "long", day: "2-digit", month: "long" });

  async function exportarResumen() {
    const slaRows = (sla.data as any[] | undefined) ?? [];
    await exportarExcel({
      filename: `dashboard-${new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" })}.xlsx`,
      hojas: [
        {
          nombre: "KPIs",
          columnas: [
            { header: "Indicador", key: "label", width: 30 },
            { header: "Valor", key: "value", width: 18 },
          ],
          filas: kpis.map((k) => ({ label: k.label, value: k.value })),
        },
        {
          nombre: "SLA",
          columnas: [
            { header: "Folio", key: "folio", width: 16 },
            { header: "Planta", key: "planta_nombre", width: 28 },
            { header: "Cliente", key: "cliente_nombre", width: 28 },
            { header: "Servicio", key: "servicio", width: 30 },
            { header: "Estado", key: "estado", width: 14 },
            { header: "Estado SLA", key: "estado_sla", width: 14 },
            { header: "Programado", key: "fecha_programada", width: 22, fn: (r: any) => fmtFechaSV(r.fecha_programada) },
            { header: "Horas transcurridas", key: "horas_transcurridas", width: 18, format: "0.0" },
          ],
          filas: slaRows,
        },
      ],
    });
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel Operativo</h1>
          <p className="text-sm text-muted-foreground mt-1">Resumen de mantenimiento y eficiencia · {hoy}</p>
        </div>
        <div className="flex gap-2">
          <ExportButton onExport={exportarResumen} />
          <Link to="/trabajos" className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:brightness-105 transition-all">
            <Plus className="size-3.5" /> Nuevo Trabajo
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div key={kpi.label}
            className={"animate-entry p-5 bg-card border border-border rounded-lg shadow-sm " + (kpi.tone === "danger" ? "ring-2 ring-destructive/20" : "")}
            style={{ animationDelay: `${i * 60}ms` }}>
            <p className={"text-[10px] font-bold uppercase tracking-wider mb-2 " + (kpi.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{kpi.label}</p>
            <div className="flex items-baseline gap-2">
              <span className={"text-3xl font-semibold font-mono tracking-tighter " + (kpi.tone === "danger" ? "text-destructive" : "")}>{kpi.value}</span>
              <span className={"text-xs font-medium " + (kpi.tone === "accent" ? "text-accent" : kpi.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{kpi.delta}</span>
            </div>
          </div>
        ))}
      </div>

      <CumplimientoContratos />

      <PanelesLimpiadosHistorico data={panelesQ.data} loading={panelesQ.isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider">Trabajos por semana</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Últimas 12 semanas, apilado por estado</p>
            </div>
            <TrendingUp className="size-4 text-muted-foreground" />
          </div>
          <Suspense fallback={<ChartSkeleton />}>
            {series.isLoading ? <ChartSkeleton /> : <StaffCharts.TrabajosSemanaChart data={series.data?.weeks ?? []} />}
          </Suspense>
        </section>

        <section className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Distribución por tipo</h3>
          <Suspense fallback={<ChartSkeleton />}>
            {series.isLoading ? <ChartSkeleton /> : <StaffCharts.DistribucionTipoChart data={series.data?.porTipo ?? []} />}
          </Suspense>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Top 5 plantas con más trabajos</h3>
          <Suspense fallback={<ChartSkeleton />}>
            {series.isLoading ? <ChartSkeleton /> : <StaffCharts.TopPlantasChart data={series.data?.topPlantas ?? []} />}
          </Suspense>
        </section>

        <section className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider">Alertas activas</h3>
            <AlertTriangle className="size-4 text-destructive" />
          </div>
          <ul className="space-y-2 text-sm">
            <AlertaItem to="/trabajos" icon={ClipboardList} label="Trabajos SLA vencidos" count={alertas.data?.sla_vencidos ?? 0} />
            <AlertaItem to="/inventario" icon={Boxes} label="Ítems bajo stock crítico" count={alertas.data?.stock_critico ?? 0} />
            <AlertaItem to="/solicitudes" icon={CalendarPlus} label="Solicitudes pendientes > 48h" count={alertas.data?.solicitudes_estancadas ?? 0} />
            <AlertaItem to="/reportes" icon={Sparkles} label="Reportes en borrador" count={stats.data?.reportes_borrador ?? 0} tone="info" />
          </ul>
        </section>
      </div>

      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <Droplets className="size-4 text-primary" /> Agua usada para limpieza por planta
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Total acumulado: <span className="font-mono font-semibold">{Math.round(agua.data?.total ?? 0).toLocaleString("es-SV", )}</span> galones
            </p>
          </div>
        </div>
        <Suspense fallback={<ChartSkeleton />}>
          {agua.isLoading ? <ChartSkeleton /> : <StaffCharts.AguaPlantaChart data={(agua.data?.filas ?? []).slice(0, 8)} />}
        </Suspense>
        {!agua.isLoading && (agua.data?.filas?.length ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">Aún no se ha registrado consumo de agua en ningún reporte.</p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8">
        <aside className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Trabajos con SLA en riesgo</h3>
            <ul className="space-y-3 text-sm">
              {((sla.data as any[]) ?? [])
                .filter((r) => r.estado_sla === "vencido" || r.estado_sla === "en_riesgo")
                .slice(0, 6)
                .map((r) => (
                  <li key={r.id} className="flex items-start gap-3">
                    <span className={"mt-1 size-2 rounded-full " + (r.estado_sla === "vencido" ? "bg-destructive" : "bg-primary")} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{r.folio} · {r.planta_nombre}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {r.estado_sla === "vencido" ? "Vencido" : "En riesgo"} · {Math.round(r.horas_transcurridas ?? 0)}h transcurridas
                      </p>
                    </div>
                  </li>
                ))}
              {!sla.isLoading && ((sla.data as any[]) ?? []).filter((r) => r.estado_sla === "vencido" || r.estado_sla === "en_riesgo").length === 0 && (
                <li className="text-xs text-muted-foreground text-center py-4">Sin alertas SLA. ✓</li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AlertaItem({ to, icon: Icon, label, count, tone = "danger" }: { to: string; icon: any; label: string; count: number; tone?: "danger" | "info" }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary transition-colors">
        <Icon className={"size-4 " + (count > 0 ? (tone === "info" ? "text-primary" : "text-destructive") : "text-muted-foreground")} />
        <span className="flex-1 text-sm">{label}</span>
        <span className={"text-xs font-bold px-2 py-0.5 rounded " + (count > 0 ? (tone === "info" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive") : "text-muted-foreground")}>
          {count}
        </span>
      </Link>
    </li>
  );
}

function ClienteDashboard() {
  const fetchPlantas = useServerFn(listPlantas);
  const fetchTrabajos = useServerFn(listTrabajos);
  const fetchAgua = useServerFn(aguaPorPlanta);
  const plantas = useQuery({ queryKey: ["plantas"], queryFn: () => fetchPlantas() });
  const trabajos = useQuery({ queryKey: ["trabajos"], queryFn: () => fetchTrabajos() });
  const agua = useQuery({ queryKey: ["agua-por-planta"], queryFn: () => fetchAgua() });

  const rows = (plantas.data as any[] | undefined) ?? [];
  const ts = (trabajos.data as any[] | undefined) ?? [];
  const ahora = Date.now();
  const proximos = ts.filter((t) => t.estado === "programado" && new Date(t.fecha_programada).getTime() >= ahora);
  const enCurso = ts.filter((t) => t.estado === "en_progreso");
  const completados = ts.filter((t) => t.estado === "completado");
  // Los trabajos históricos no requieren firma del cliente.
  const esHistorico = (t: any) => {
    const notas = String(t.notas ?? "").toUpperCase();
    return notas.includes("HIST") && notas.includes("RICO");
  };
  const pendienteFirma = completados.filter(
    (t) => !t.firmado_at && !esHistorico(t),
  );

  const hoy = new Date().toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", weekday: "long", day: "2-digit", month: "long" });

  const kpis = [
    { label: "Mis plantas", value: rows.length },
    { label: "Trabajos en curso", value: enCurso.length },
    { label: "Próximos trabajos", value: proximos.length },
    { label: "Pendientes de firma", value: pendienteFirma.length, tone: pendienteFirma.length ? "danger" as const : undefined },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panel del Cliente</h1>
        <p className="text-sm text-muted-foreground mt-1">Resumen operativo de tus plantas · {hoy}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label}
            className={"p-5 bg-card border border-border rounded-lg shadow-sm " + (k.tone === "danger" ? "ring-2 ring-destructive/20" : "")}>
            <p className={"text-[10px] font-bold uppercase tracking-wider mb-2 " + (k.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{k.label}</p>
            <p className={"text-3xl font-semibold font-mono tracking-tighter " + (k.tone === "danger" ? "text-destructive" : "")}>{k.value}</p>
          </div>
        ))}
      </div>

      <CumplimientoContratos />

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider">Mis plantas solares</h2>
          <Link to="/plantas" className="text-xs text-primary hover:underline font-medium">Ver todas →</Link>
        </div>
        {plantas.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!plantas.isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center bg-card border border-border rounded-lg">
            Aún no tienes plantas registradas. Contacta al administrador.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((p) => {
            const tp = ts.filter((t) => t.planta_id === p.id);
            const abiertos = tp.filter((t) => t.estado === "programado" || t.estado === "en_progreso").length;
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                    <Sun className="size-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">{abiertos} abiertos</span>
                </div>
                <h3 className="font-semibold tracking-tight">{p.nombre}</h3>
                <p className="text-[10px] text-muted-foreground mb-3">{p.ubicacion ?? "—"}</p>
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Paneles</p>
                    <p className="text-sm font-mono font-semibold">{p.paneles?.toLocaleString("es-SV", ) ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Capacidad</p>
                    <p className="text-sm font-medium">{p.capacidad ?? "—"}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider">Próximos trabajos</h3>
            <Link to="/trabajos" className="text-xs text-primary hover:underline font-medium">Ver →</Link>
          </div>
          <ul className="space-y-3 text-sm">
            {proximos.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-start gap-3">
                <span className="mt-1 size-2 rounded-full bg-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.folio} · {t.servicio}</p>
                  <p className="text-[10px] text-muted-foreground">{t.planta_nombre} · {new Date(t.fecha_programada).toLocaleString("es-SV", )}</p>
                </div>
              </li>
            ))}
            {proximos.length === 0 && <li className="text-xs text-muted-foreground text-center py-3">Sin trabajos programados.</li>}
          </ul>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider">Pendientes de tu firma</h3>
            <Link to="/mis-trabajos" className="text-xs text-primary hover:underline font-medium">Firmar →</Link>
          </div>
          <ul className="space-y-3 text-sm">
            {pendienteFirma.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-start gap-3">
                <span className="mt-1 size-2 rounded-full bg-destructive" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.folio} · {t.servicio}</p>
                  <p className="text-[10px] text-muted-foreground">{t.planta_nombre} · Completado {new Date(t.fecha_completado ?? t.fecha_programada).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" })}</p>
                </div>
              </li>
            ))}
            {pendienteFirma.length === 0 && <li className="text-xs text-muted-foreground text-center py-3">Todo al día. ✓</li>}
          </ul>
        </div>
      </section>

      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
          <Droplets className="size-4 text-primary" /> Agua usada para limpieza · {Math.round(agua.data?.total ?? 0).toLocaleString("es-SV", )} gal
        </h3>
        <ul className="divide-y divide-border text-sm">
          {(agua.data?.filas ?? []).slice(0, 8).map((r: any) => (
            <li key={r.planta_id} className="flex items-center justify-between py-2">
              <span className="truncate">{r.nombre}</span>
              <span className="font-mono text-xs">{Math.round(r.galones).toLocaleString("es-SV", )} gal</span>
            </li>
          ))}
          {!agua.isLoading && (agua.data?.filas?.length ?? 0) === 0 && (
            <li className="text-xs text-muted-foreground text-center py-3">Sin registros de consumo de agua todavía.</li>
          )}
        </ul>
      </section>
    </div>
  );
}