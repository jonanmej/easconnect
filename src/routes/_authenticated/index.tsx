import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { agendaHoy } from "@/lib/mock-data";
import plantaIso from "@/assets/planta-iso.jpg";
import { Plus, FileDown } from "lucide-react";
import { dashboardStats, listEquipos } from "@/lib/operations.functions";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard · SOLAROS" },
      { name: "description", content: "Panel operativo: trabajos, robots, eficiencia y reportes IA en tiempo real." },
      { property: "og:title", content: "Dashboard · SOLAROS" },
      { property: "og:description", content: "Panel operativo de mantenimiento solar y térmico." },
    ],
  }),
  component: Index,
});

function Index() {
  const fetchStats = useServerFn(dashboardStats);
  const fetchEquipos = useServerFn(listEquipos);
  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => fetchStats() });
  const equipos = useQuery({ queryKey: ["equipos"], queryFn: () => fetchEquipos() });

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
    { label: "Trabajos Hoy", value: String(stats.data?.trabajos_hoy ?? "—"), delta: `${stats.data?.trabajos_total ?? 0} totales`, tone: "accent" as const },
    { label: "Equipos Operativos", value: `${stats.data?.equipos_operativos ?? 0}/${stats.data?.equipos_total ?? 0}`, delta: "", tone: "muted" as const },
    { label: "Salud Promedio", value: String(stats.data?.eficiencia ?? "--"), delta: "%", tone: "accent" as const },
    { label: "Alertas", value: String(stats.data?.alertas ?? 0).padStart(2, "0"), delta: stats.data?.alertas ? "Ver" : "OK", tone: stats.data?.alertas ? "danger" as const : "muted" as const },
    { label: "Bajo Stock", value: String(stats.data?.inv_bajo_stock ?? 0).padStart(2, "0"), delta: stats.data?.inv_bajo_stock ? "SKUs" : "OK", tone: stats.data?.inv_bajo_stock ? "danger" as const : "muted" as const },
    { label: "Reportes Borrador", value: String(stats.data?.reportes_borrador ?? 0).padStart(2, "0"), delta: "por enviar", tone: "muted" as const },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel Operativo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Resumen de mantenimiento y eficiencia · martes 23 de junio
          </p>
        </div>
        <div className="flex gap-2">
          <button className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary transition-colors">
            <FileDown className="size-3.5" /> Exportar
          </button>
          <button className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:brightness-105 transition-all">
            <Plus className="size-3.5" /> Nuevo Trabajo
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <div
            key={kpi.label}
            className={
              "animate-entry p-5 bg-card border border-border rounded-lg shadow-sm " +
              (kpi.tone === "danger" ? "ring-2 ring-destructive/20" : "")
            }
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <p
              className={
                "text-[10px] font-bold uppercase tracking-wider mb-2 " +
                (kpi.tone === "danger" ? "text-destructive" : "text-muted-foreground")
              }
            >
              {kpi.label}
            </p>
            <div className="flex items-baseline gap-2">
              <span
                className={
                  "text-3xl font-semibold font-mono tracking-tighter " +
                  (kpi.tone === "danger" ? "text-destructive" : "")
                }
              >
                {kpi.value}
              </span>
              <span
                className={
                  "text-xs font-medium " +
                  (kpi.tone === "accent"
                    ? "text-accent"
                    : kpi.tone === "danger"
                      ? "text-destructive"
                      : "text-muted-foreground")
                }
              >
                {kpi.delta}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* AI Executive Report */}
          <section className="animate-entry relative overflow-hidden bg-slate-900 text-white rounded-xl p-6" style={{ animationDelay: "240ms" }}>
            <div className="absolute top-0 left-0 w-full h-1 bg-primary/40" />
            <div className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
              <div className="w-full h-20 bg-gradient-to-b from-primary/40 to-transparent animate-scanline" />
            </div>

            <div className="flex justify-between items-start mb-4 relative">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-primary mb-1">
                  Análisis IA de Rendimiento
                </h2>
                <p className="text-sm text-slate-400">
                  Generado hace 12 min · Planta Solar Atacama III
                </p>
              </div>
              <button className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold uppercase tracking-wide transition-colors">
                Exportar PDF
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-slate-300">
                  La limpieza robotizada en el sector C4 incrementó la captación fotónica en un{" "}
                  <span className="text-white font-bold">12.4%</span>. Se recomienda adelantar el
                  mantenimiento del Motor Térmico S-42 por una vibración anómala detectada en los
                  logs de consumo.
                </p>
                <div className="flex flex-wrap gap-2">
                  <div className="text-xs px-2 py-1 bg-primary/20 text-primary border border-primary/30 rounded">
                    Acción: Limpiar Sector C5
                  </div>
                  <div className="text-xs px-2 py-1 bg-accent/20 text-accent border border-accent/30 rounded">
                    Potencial: +4.2 MWh
                  </div>
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-white/5">
                <p className="text-[10px] font-mono text-slate-500 mb-3">
                  TELEMETRÍA_ROBOT_SC-01
                </p>
                <div className="h-24 flex items-end gap-1">
                  {[40, 60, 30, 90, 50, 100, 30, 70, 55, 85].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-primary/60 rounded-t-sm"
                      style={{ height: `${h}%`, opacity: 0.4 + (h / 100) * 0.6 }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Equipment status */}
          <section className="animate-entry space-y-4" style={{ animationDelay: "300ms" }}>
            <div className="flex justify-between items-end">
              <h3 className="text-sm font-bold uppercase tracking-wider">Estado de Equipos</h3>
              <Link
                to="/equipos"
                className="text-xs text-primary hover:underline font-medium"
              >
                Ver todos →
              </Link>
            </div>
            <div className="bg-card border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-secondary border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Equipo</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-left">Última Actividad</th>
                    <th className="px-4 py-3 text-right">Salud</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(equipos.data as any[] | undefined)?.slice(0, 4).map((e) => (
                    <tr key={e.id} className="hover:bg-secondary/50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-8 bg-secondary rounded grid place-items-center text-[10px] font-bold text-muted-foreground">
                            {e.codigo}
                          </div>
                          <div>
                            <p className="font-medium">{e.nombre}</p>
                            <p className="text-[10px] text-muted-foreground">{e.tipo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={
                            "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                            (statusStyles[e.estado] ?? "bg-secondary")
                          }
                        >
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
        </div>

        <aside className="animate-entry space-y-6" style={{ animationDelay: "360ms" }}>
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold uppercase tracking-wider">Agenda de Hoy</h3>
              <button className="size-6 grid place-items-center hover:bg-secondary rounded-full transition-colors text-muted-foreground">
                +
              </button>
            </div>
            <div className="space-y-6">
              {agendaHoy.map((a) => (
                <div
                  key={a.time}
                  className={
                    "relative pl-4 border-l-2 " +
                    (a.accent === "primary"
                      ? "border-primary"
                      : a.accent === "accent"
                        ? "border-accent"
                        : "border-border")
                  }
                >
                  <p
                    className={
                      "text-[10px] font-bold uppercase mb-1 " +
                      (a.accent === "primary"
                        ? "text-primary"
                        : a.accent === "accent"
                          ? "text-accent"
                          : "text-muted-foreground")
                    }
                  >
                    {a.time}
                  </p>
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.place}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-secondary/50 border border-dashed border-border rounded-xl p-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
              Vista de Planta
            </p>
            <img
              src={plantaIso}
              alt="Diagrama isométrico de planta solar"
              loading="lazy"
              width={1024}
              height={1024}
              className="w-full aspect-square object-cover rounded-lg bg-background border border-border"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
