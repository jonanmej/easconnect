import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { AlertTriangle, Boxes, CalendarPlus, ClipboardList, Droplets, Plus, Sparkles, Sun, TrendingUp } from "lucide-react";
import { dashboardStats, listPlantas, listTrabajos } from "@/lib/operations.functions";
import { dashboardSeries, dashboardAlertas, listTrabajosSla, aguaPorPlanta } from "@/lib/dashboard.functions";
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
                    {f.proxima_fecha ? new Date(f.proxima_fecha).toLocaleDateString("es-CL") : "—"}
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
  // Cache durante 60s para evitar recomputos en tabs/cambios rápidos.
  const qOpts = { staleTime: 60_000, refetchOnWindowFocus: false } as const;
  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => fetchStats(), ...qOpts });
  const series = useQuery({ queryKey: ["dashboard-series"], queryFn: () => fetchSeries(), ...qOpts });
  const alertas = useQuery({ queryKey: ["alertas-sidebar"], queryFn: () => fetchAlertas(), ...qOpts });
  const sla = useQuery({ queryKey: ["trabajos-sla"], queryFn: () => fetchSla(), ...qOpts });
  const agua = useQuery({ queryKey: ["agua-por-planta"], queryFn: () => fetchAgua(), ...qOpts });

  const kpis = [
    { label: "Trabajos hoy", value: String(stats.data?.trabajos_hoy ?? "—"), delta: `${stats.data?.trabajos_total ?? 0} totales`, tone: "accent" as const },
    { label: "Paneles limpiados", value: (stats.data?.paneles_limpiados ?? 0).toLocaleString(), delta: stats.data?.paneles_parque ? `de ${stats.data.paneles_parque.toLocaleString()}` : "acumulado", tone: "accent" as const },
    { label: "Avance de limpieza", value: `${stats.data?.avance_limpieza ?? 0}%`, delta: "del parque", tone: "accent" as const },
    { label: "Agua utilizada", value: (stats.data?.agua_galones ?? 0).toLocaleString(), delta: "galones", tone: "accent" as const },
    { label: "Anomalías detectadas", value: String(stats.data?.anomalias_detectadas ?? 0).padStart(2, "0"), delta: "evidencias", tone: (stats.data?.anomalias_detectadas ?? 0) > 0 ? "danger" as const : "muted" as const },
    { label: "Equipos operativos", value: `${stats.data?.equipos_operativos ?? 0}/${stats.data?.equipos_total ?? 0}`, delta: "", tone: "muted" as const },
    { label: "SLA vencidos", value: String(alertas.data?.sla_vencidos ?? 0).padStart(2, "0"), delta: "ver detalle", tone: alertas.data?.sla_vencidos ? "danger" as const : "muted" as const },
    { label: "Bajo stock", value: String(stats.data?.inv_bajo_stock ?? 0).padStart(2, "0"), delta: stats.data?.inv_bajo_stock ? "SKUs" : "OK", tone: stats.data?.inv_bajo_stock ? "danger" as const : "muted" as const },
  ];

  const hoy = new Date().toLocaleDateString("es-SV", { weekday: "long", day: "2-digit", month: "long" });

  async function exportarResumen() {
    const slaRows = (sla.data as any[] | undefined) ?? [];
    await exportarExcel({
      filename: `dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`,
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
              Total acumulado: <span className="font-mono font-semibold">{Math.round(agua.data?.total ?? 0).toLocaleString()}</span> galones
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
  const pendienteFirma = completados.filter((t) => !t.firmado_at);

  const hoy = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "2-digit", month: "long" });

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
                    <p className="text-sm font-mono font-semibold">{p.paneles?.toLocaleString() ?? "—"}</p>
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
                  <p className="text-[10px] text-muted-foreground">{t.planta_nombre} · {new Date(t.fecha_programada).toLocaleString("es-CL")}</p>
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
                  <p className="text-[10px] text-muted-foreground">{t.planta_nombre} · Completado {new Date(t.fecha_completado ?? t.fecha_programada).toLocaleDateString("es-CL")}</p>
                </div>
              </li>
            ))}
            {pendienteFirma.length === 0 && <li className="text-xs text-muted-foreground text-center py-3">Todo al día. ✓</li>}
          </ul>
        </div>
      </section>

      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
          <Droplets className="size-4 text-primary" /> Agua usada para limpieza · {Math.round(agua.data?.total ?? 0).toLocaleString()} gal
        </h3>
        <ul className="divide-y divide-border text-sm">
          {(agua.data?.filas ?? []).slice(0, 8).map((r: any) => (
            <li key={r.planta_id} className="flex items-center justify-between py-2">
              <span className="truncate">{r.nombre}</span>
              <span className="font-mono text-xs">{Math.round(r.galones).toLocaleString()} gal</span>
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