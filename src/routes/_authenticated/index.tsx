import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, CalendarPlus, ClipboardList, Plus, Sparkles, Sun, TrendingUp } from "lucide-react";
import { dashboardStats, listEquipos, listPlantas, listTrabajos } from "@/lib/operations.functions";
import { dashboardSeries, dashboardAlertas, listTrabajosSla } from "@/lib/dashboard.functions";
import { ExportButton } from "@/components/ExportButton";
import { exportarExcel, fmtFechaSV } from "@/lib/excel";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";

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

const COLORS = ["#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#64748B"];

function Index() {
  const { roles } = useAuth();
  if (highestRole(roles) === "cliente") return <ClienteDashboard />;
  return <StaffDashboard />;
}

function StaffDashboard() {
  const fetchStats = useServerFn(dashboardStats);
  const fetchEquipos = useServerFn(listEquipos);
  const fetchSeries = useServerFn(dashboardSeries);
  const fetchAlertas = useServerFn(dashboardAlertas);
  const fetchSla = useServerFn(listTrabajosSla);
  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => fetchStats() });
  const equipos = useQuery({ queryKey: ["equipos"], queryFn: () => fetchEquipos() });
  const series = useQuery({ queryKey: ["dashboard-series"], queryFn: () => fetchSeries() });
  const alertas = useQuery({ queryKey: ["alertas-sidebar"], queryFn: () => fetchAlertas() });
  const sla = useQuery({ queryKey: ["trabajos-sla"], queryFn: () => fetchSla() });

  const statusStyles: Record<string, string> = {
    operativo: "bg-accent/10 text-accent",
    mantenimiento: "bg-amber-100 text-amber-700",
    disponible: "bg-secondary text-foreground",
    fuera_servicio: "bg-destructive/10 text-destructive",
  };
  const statusLabel: Record<string, string> = {
    operativo: "Operativo",
    mantenimiento: "Mantenimiento",
    disponible: "Disponible",
    fuera_servicio: "Fuera de servicio",
  };

  const kpis = [
    { label: "Trabajos hoy", value: String(stats.data?.trabajos_hoy ?? "—"), delta: `${stats.data?.trabajos_total ?? 0} totales`, tone: "accent" as const },
    { label: "Equipos operativos", value: `${stats.data?.equipos_operativos ?? 0}/${stats.data?.equipos_total ?? 0}`, delta: "", tone: "muted" as const },
    { label: "Salud promedio", value: String(stats.data?.eficiencia ?? "--"), delta: "%", tone: "accent" as const },
    { label: "SLA vencidos", value: String(alertas.data?.sla_vencidos ?? 0).padStart(2, "0"), delta: "ver detalle", tone: alertas.data?.sla_vencidos ? "danger" as const : "muted" as const },
    { label: "Bajo stock", value: String(stats.data?.inv_bajo_stock ?? 0).padStart(2, "0"), delta: stats.data?.inv_bajo_stock ? "SKUs" : "OK", tone: stats.data?.inv_bajo_stock ? "danger" as const : "muted" as const },
    { label: "Solicitudes >48h", value: String(alertas.data?.solicitudes_estancadas ?? 0).padStart(2, "0"), delta: "por aprobar", tone: alertas.data?.solicitudes_estancadas ? "danger" as const : "muted" as const },
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

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider">Trabajos por semana</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Últimas 12 semanas, apilado por estado</p>
            </div>
            <TrendingUp className="size-4 text-muted-foreground" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series.data?.weeks ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="programado" stackId="a" fill="#3B82F6" name="Programados" />
                <Bar dataKey="en_progreso" stackId="a" fill="#F59E0B" name="En progreso" />
                <Bar dataKey="completado" stackId="a" fill="#10B981" name="Completados" />
                <Bar dataKey="cancelado" stackId="a" fill="#94A3B8" name="Cancelados" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Distribución por tipo</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={series.data?.porTipo ?? []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {(series.data?.porTipo ?? []).map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Top 5 plantas con más trabajos</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series.data?.topPlantas ?? []} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="nombre" type="category" tick={{ fontSize: 11 }} width={140} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#F59E0B" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-end">
            <h3 className="text-sm font-bold uppercase tracking-wider">Estado de Equipos</h3>
            <Link to="/equipos" className="text-xs text-primary hover:underline font-medium">Ver todos →</Link>
          </div>
          <div className="bg-card border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-secondary border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Equipo</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Ubicación</th>
                  <th className="px-4 py-3 text-right">Salud</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(equipos.data as any[] | undefined)?.slice(0, 5).map((e) => (
                  <tr key={e.id} className="hover:bg-secondary/50 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="size-8 bg-secondary rounded grid place-items-center text-[10px] font-bold text-muted-foreground">{e.codigo}</div>
                        <div>
                          <p className="font-medium">{e.nombre}</p>
                          <p className="text-[10px] text-muted-foreground">{e.tipo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={"inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase " + (statusStyles[e.estado] ?? "bg-secondary")}>
                        {statusLabel[e.estado] ?? e.estado}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{e.planta_nombre ?? e.ubicacion ?? "—"}</td>
                    <td className="px-4 py-4 text-right font-mono">{e.salud != null ? `${e.salud}%` : "—"}</td>
                  </tr>
                ))}
                {!equipos.isLoading && (equipos.data as any[] | undefined)?.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">Aún no hay equipos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

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