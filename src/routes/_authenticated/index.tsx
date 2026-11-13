import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatCapacidadKwp } from "@/lib/potencia";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState, useMemo } from "react";
import { Boxes, CalendarPlus, ClipboardList, Droplets, FileDown, Plus, Sparkles, Sun, TrendingUp } from "lucide-react";
import { dashboardStats, listPlantas, listTrabajos } from "@/lib/operations.functions";
import { dashboardSeries, dashboardAlertas, listTrabajosSla, aguaPorPlanta, panelesLimpiadosPorPlanta, metaCumplimientoLimpieza } from "@/lib/dashboard.functions";
import { cumplimientoAnual } from "@/lib/contratos.functions";
import { colorCliente } from "@/lib/color-cliente";
import { ExportButton } from "@/components/ExportButton";
import { exportarExcel, fmtFechaSV } from "@/lib/excel";
import { generarYDescargarCumplimientoPdf } from "@/lib/pdf/descargar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { isoWeekFromISODate, fechaKeySV } from "@/lib/semana-iso";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ResponsiveTable";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { MisAsignacionesHoy } from "@/components/dashboard/MisAsignacionesHoy";

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
      { property: "og:description", content: "Panel operativo de mantenimiento solar y térmico." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }],
  }),
  component: Index,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {(error as Error)?.message}</div>,
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
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold">Paneles limpiados · por trabajo</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Paneles limpiados por trabajo (completado o en curso) para cada cliente y planta con registro diario ingresado.
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-mono tabular-nums font-semibold text-accent">
            {totalPaneles.toLocaleString("es-SV")}
          </p>
          <p className="text-xs text-muted-foreground">
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
        <div className="table-scroll overflow-x-auto" role="region" aria-label="Tabla desplazable horizontalmente" tabIndex={0}>
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-xs text-muted-foreground">
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
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{f.ciclos.length}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-accent">
                    {Number(f.paneles_limpiados).toLocaleString("es-SV")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
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
                            <span className="font-mono tabular-nums text-muted-foreground">{c.folio}</span>
                            <span className="text-muted-foreground">
                              {c.fecha ? new Date(c.fecha).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" }) : "—"}
                            </span>
                            <span className="font-mono tabular-nums font-semibold">{Number(c.paneles).toLocaleString("es-SV")}</span>
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
    </div>
  );
}

function CumplimientoContratos() {
  const fCump = useServerFn(cumplimientoAnual);
  const cump = useQuery({ queryKey: ["cumplimiento-anual"], queryFn: () => fCump(), staleTime: 60_000 });
  const data = cump.data;
  const filas = (data?.filas as any[] | undefined) ?? [];
  const [clienteSel, setClienteSel] = useState<string>("all");
  const [downloading, setDownloading] = useState(false);
  const clientesDisp = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of filas) if (f.cliente_id) map.set(f.cliente_id, f.cliente_nombre ?? "—");
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [filas]);
  // Cumplimiento agrupado por cliente: cada cliente con su propio resumen.
  const gruposCliente = useMemo(() => {
    const visibles = clienteSel === "all" ? filas : filas.filter((f) => f.cliente_id === clienteSel);
    const map = new Map<string, { cliente_id: string; cliente_nombre: string; filas: any[] }>();
    for (const f of visibles) {
      const id = f.cliente_id ?? "sin-cliente";
      const g = map.get(id) ?? { cliente_id: id, cliente_nombre: f.cliente_nombre ?? "Sin cliente", filas: [] as any[] };
      g.filas.push(f);
      map.set(id, g);
    }
    return Array.from(map.values())
      .map((g) => {
        const contratados = g.filas.reduce((s, r) => s + (r.cantidad_anual ?? 0), 0);
        const completados = g.filas.reduce((s, r) => s + (r.completados ?? 0), 0);
        return {
          ...g,
          filas: g.filas.sort((a, b) => String(a.planta_nombre).localeCompare(String(b.planta_nombre), "es")),
          contratados,
          completados,
          pct: contratados > 0 ? Math.round((completados / contratados) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => a.cliente_nombre.localeCompare(b.cliente_nombre, "es"));
  }, [filas, clienteSel]);
  async function exportarPdf() {
    if (!data) return;
    setDownloading(true);
    try {
      const filtradas = clienteSel === "all" ? filas : filas.filter((f) => f.cliente_id === clienteSel);
      const clienteNombre = clienteSel === "all"
        ? (clientesDisp.length === 1 ? clientesDisp[0].nombre : "Todos los clientes")
        : (clientesDisp.find((c) => c.id === clienteSel)?.nombre ?? "Cliente");
      const total_contratado = filtradas.reduce((s, r) => s + (r.cantidad_anual ?? 0), 0);
      const total_completado = filtradas.reduce((s, r) => s + (r.completados ?? 0), 0);
      const total_programado = filtradas.reduce((s, r) => s + (r.programados ?? 0), 0);
      const pct = total_contratado > 0 ? Math.round((total_completado / total_contratado) * 1000) / 10 : 0;
      await generarYDescargarCumplimientoPdf({
        cliente: clienteNombre,
        anio: data.anio,
        filas: filtradas.map((f) => ({
          contrato_id: f.contrato_id,
          planta_nombre: f.planta_nombre,
          servicio: f.servicio,
          cantidad_anual: f.cantidad_anual,
          completados: f.completados,
          programados: f.programados,
          cumplimiento_pct: Number(f.cumplimiento_pct),
          proxima_fecha: f.proxima_fecha,
        })),
        total_contratado,
        total_completado,
        total_programado,
        cumplimiento_pct: pct,
        emitido_at: new Date().toLocaleString("es-SV", { timeZone: "America/El_Salvador" }),
      }, `Cumplimiento-${clienteNombre.replace(/\s+/g, "_")}-${data.anio}.pdf`);
    } catch (e: any) {
      (await import("sonner")).toast.error(e?.message ?? "No se pudo generar el PDF");
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div>
      <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold break-words">Cumplimiento de servicios contratados {data ? `· ${data.anio}` : ""}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data ? `${data.total_completado} de ${data.total_contratado} completados (${data.cumplimiento_pct}%)` : "Cargando…"}
          </p>
        </div>
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-3 w-full sm:w-auto">
          {clientesDisp.length > 1 && (
            <select
              value={clienteSel}
              onChange={(e) => setClienteSel(e.target.value)}
              className="h-9 w-full min-w-0 sm:w-auto px-2 text-xs border border-border rounded-md bg-background"
              aria-label="Filtrar por cliente"
            >
              <option value="all">Todos los clientes</option>
              {clientesDisp.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={exportarPdf}
            disabled={downloading || !data || filas.length === 0}
            className="h-9 w-full min-w-0 sm:w-auto min-h-9 px-3 inline-flex items-center justify-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary disabled:opacity-50"
          >
            <FileDown className="size-3.5" /> {downloading ? "Generando…" : "Exportar PDF"}
          </button>
          <p className="text-2xl font-mono tabular-nums font-semibold">{data?.cumplimiento_pct ?? 0}%</p>
        </div>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden mb-4">
        <div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, data?.cumplimiento_pct ?? 0)}%` }} />
      </div>
      {filas.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Aún no hay contratos definidos para el año en curso.</p>
      ) : (
        <div className="space-y-5">
        {gruposCliente.map((g) => (
          <div key={g.cliente_id ?? g.cliente_nombre} className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: colorCliente(g.cliente_id ?? g.cliente_nombre) }} />
              <h3 className="text-sm font-semibold">{g.cliente_nombre}</h3>
              <span className="text-xs text-muted-foreground">
                {g.completados} de {g.contratados} completados
              </span>
              <span className="ml-auto inline-flex items-center gap-2">
                <span className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <span className="block h-full bg-accent" style={{ width: `${Math.min(100, g.pct)}%` }} />
                </span>
                <span className="font-mono tabular-nums text-xs font-semibold">{g.pct}%</span>
              </span>
            </div>
            <ResponsiveTable
          data={g.filas}
          rowKey={(f) => f.contrato_id}
          columns={[
            { key: "planta", header: "Planta", primary: true, cell: (f) => f.planta_nombre },
            { key: "servicio", header: "Servicio", secondary: true, cell: (f) => f.servicio },
            { key: "contratados", header: "Contratados", align: "right", cell: (f) => <span className="font-mono tabular-nums">{f.cantidad_anual}</span> },
            { key: "completados", header: "Completados", align: "right", cell: (f) => <span className="font-mono tabular-nums text-accent">{f.completados}</span> },
            { key: "programados", header: "Programados", align: "right", cell: (f) => <span className="font-mono tabular-nums">{f.programados}</span> },
            {
              key: "cumplimiento",
              header: "Cumplimiento",
              align: "right",
              cell: (f) => (
                <span className="inline-flex items-center gap-2">
                  <span className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <span className="block h-full bg-accent" style={{ width: `${Math.min(100, Number(f.cumplimiento_pct))}%` }} />
                  </span>
                  <span className="font-mono tabular-nums text-xs">{Number(f.cumplimiento_pct)}%</span>
                </span>
              ),
            },
            {
              key: "proxima",
              header: "Próxima",
              cell: (f) => (
                <span className="text-xs text-muted-foreground">
                  {f.proxima_fecha ? new Date(f.proxima_fecha).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" }) : "—"}
                </span>
              ),
            },
          ]}
        />
          </div>
        ))}
        </div>
      )}
    </div>
  );
}

function StaffDashboard() {
  const { roles } = useAuth();
  const esTecnico = highestRole(roles) === "tecnico";
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

  // Cumplimiento del cronograma: calculado en el servidor (dashboardStats).
  const cumplimientoCronograma = (stats.data as any)?.cumplimiento_cronograma ?? { pct: 100, num: 0, den: 0 };

  // Métrica guía: OT finalizadas en la semana ISO actual (hora de El Salvador),
  // tomada de la misma serie del gráfico "Trabajos por semana".
  const semanas = (series.data?.weeks as any[] | undefined) ?? [];
  const finSemana = semanas.length >= 2 ? Number(semanas[semanas.length - 1].completado ?? 0) : null;
  const finAnterior = semanas.length >= 2 ? Number(semanas[semanas.length - 2].completado ?? 0) : null;
  const semanaActualNum = isoWeekFromISODate(fechaKeySV(new Date()));
  const difSemana = finSemana !== null && finAnterior !== null ? finSemana - finAnterior : 0;
  const comparacionSemana = difSemana > 0
    ? `+${difSemana} vs. semana anterior`
    : difSemana < 0 ? `−${Math.abs(difSemana)} vs. semana anterior` : "igual que la semana anterior";

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
          filas: [
            { label: "Órdenes finalizadas esta semana", value: String(finSemana ?? 0) },
            ...kpis.map((k) => ({ label: k.label, value: k.value })),
          ],
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

  const slaRiesgo = ((sla.data as any[]) ?? []).filter((r) => r.estado_sla === "vencido" || r.estado_sla === "en_riesgo");
  const kpiBy = (label: string) => kpis.find((k) => k.label === label)!;
  const principales = [
    { ...kpiBy("Trabajos hoy"), pct: null as number | null },
    { ...kpiBy("Avance de limpieza"), pct: Number((stats.data as any)?.avance_limpieza ?? 0) },
    { ...kpiBy("Meta de limpieza"), pct: meta && meta.estado !== "sin_datos" ? Number(meta.cumplimiento_pct ?? 0) : null },
    { ...kpiBy("Cumplimiento cronograma"), pct: cumplimientoCronograma.pct },
  ];
  const secundarios = ["Paneles limpiados", "Agua utilizada", "Equipos operativos", "Bajo stock"].map(kpiBy);

  return (
    <div className="dashboard-screen p-4 md:p-6 xl:p-8 max-w-[112rem] mx-auto w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Panel operativo</h1>
          <p className="text-sm text-muted-foreground mt-1">Resumen de mantenimiento y eficiencia · {hoy}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton onExport={exportarResumen} />
          {esTecnico ? <Button asChild><Link to="/terreno">
            <ClipboardList className="size-3.5" /> Ir a mis asignaciones
          </Link></Button> : <Button asChild><Link to="/trabajos">
            <Plus className="size-3.5" /> Nuevo trabajo
          </Link></Button>}
        </div>
      </div>

      {esTecnico && <MisAsignacionesHoy />}

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Requiere atención</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <AtencionCard to="/trabajos" icon={ClipboardList} label="SLA vencidos" destino="Ver trabajos" count={alertas.data?.sla_vencidos ?? 0} />
          <AtencionCard to="/inventario" icon={Boxes} label="Ítems en stock crítico" destino="Ver inventario" count={alertas.data?.stock_critico ?? 0} />
          <AtencionCard to="/solicitudes" icon={CalendarPlus} label="Solicitudes pendientes > 48 h" destino="Ver solicitudes" count={alertas.data?.solicitudes_estancadas ?? 0} />
          <AtencionCard to="/reportes" icon={Sparkles} label="Reportes en borrador" destino="Ver reportes" count={stats.data?.reportes_borrador ?? 0} tone="info" />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Indicadores</h2>
        <div className="dashboard-kpi p-5 bg-card border border-border rounded-lg flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Órdenes finalizadas esta semana</p>
            {finSemana === null ? (
              <div className="mt-2 space-y-2"><Skeleton className="h-10 w-20" /><Skeleton className="h-4 w-44" /></div>
            ) : (
              <>
                <p className="mt-2 text-4xl font-semibold font-display tabular-nums">{finSemana}</p>
                <p className={"mt-1 text-xs tabular-nums " + (difSemana > 0 ? "text-accent" : difSemana < 0 ? "text-destructive" : "text-muted-foreground")}>{comparacionSemana}</p>
              </>
            )}
          </div>
          <p className="shrink-0 text-sm font-medium text-muted-foreground tabular-nums">Semana {String(semanaActualNum).padStart(2, "0")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {principales.map((kpi) => (
            <div key={kpi.label} className={"dashboard-kpi p-5 bg-card border rounded-lg " + (kpi.tone === "danger" ? "border-destructive/50" : "border-border")}>
              <p className={"text-sm font-medium " + (kpi.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{kpi.label}</p>
              <p className={"mt-2 text-3xl font-semibold font-display tabular-nums " + (kpi.tone === "danger" ? "text-destructive" : "")}>{kpi.value}</p>
              {kpi.delta && <p className={"mt-1 text-xs " + (kpi.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{kpi.delta}</p>}
              {kpi.pct !== null && (
                <div className="mt-3 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className={"h-full " + (kpi.tone === "danger" ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.max(0, Math.min(100, kpi.pct))}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="dashboard-kpi bg-card border border-border rounded-lg grid grid-cols-2 lg:grid-cols-4 divide-border [&>*]:border-border">
          {secundarios.map((kpi, i) => (
            <div key={kpi.label} className={"p-4 min-w-0 " + (i % 2 === 1 ? "border-l " : "") + (i >= 2 ? "border-t lg:border-t-0 " : "") + (i === 2 ? "lg:border-l" : "")}>
              <p className={"text-xs font-medium " + (kpi.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{kpi.label}</p>
              <p className={"mt-1 text-xl font-semibold tabular-nums " + (kpi.tone === "danger" ? "text-destructive" : "")}>{kpi.value}</p>
              {kpi.delta && <p className={"text-xs " + (kpi.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{kpi.delta}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-card border border-border rounded-xl p-5 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Trabajos por semana</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Últimas 12 semanas, apilado por estado</p>
            </div>
            <TrendingUp className="size-4 text-muted-foreground" />
          </div>
          <Suspense fallback={<ChartSkeleton />}>
            {series.isLoading ? <ChartSkeleton /> : <StaffCharts.TrabajosSemanaChart data={series.data?.weeks ?? []} />}
          </Suspense>
        </section>

        <section className="bg-card border border-border rounded-xl p-5 min-w-0">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-base font-semibold">SLA en riesgo</h2>
            <Link to="/trabajos" className="text-xs text-primary hover:underline font-medium">Ver trabajos</Link>
          </div>
          <ul className="divide-y divide-border text-sm">
            {slaRiesgo.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.folio} · {r.planta_nombre}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{Math.round(r.horas_transcurridas ?? 0)} h transcurridas</p>
                </div>
                <span className={"shrink-0 text-xs font-semibold px-2 py-0.5 rounded " + (r.estado_sla === "vencido" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                  {r.estado_sla === "vencido" ? "Vencido" : "En riesgo"}
                </span>
              </li>
            ))}
            {!sla.isLoading && slaRiesgo.length === 0 && (
              <li className="text-xs text-muted-foreground text-center py-4">Sin alertas SLA. ✓</li>
            )}
          </ul>
        </section>
      </div>

      <section className="bg-card border border-border rounded-xl p-5 min-w-0">
        <Tabs defaultValue="cumplimiento" className="min-w-0">
          <div className="mb-4 min-w-0">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-max">
              <TabsTrigger value="cumplimiento">Cumplimiento de contratos</TabsTrigger>
              <TabsTrigger value="paneles">Paneles limpiados</TabsTrigger>
              <TabsTrigger value="agua">Agua por planta</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="cumplimiento" className="min-w-0"><CumplimientoContratos /></TabsContent>
          <TabsContent value="paneles" className="min-w-0"><PanelesLimpiadosHistorico data={panelesQ.data} loading={panelesQ.isLoading} /></TabsContent>
          <TabsContent value="agua" className="min-w-0">
            <div className="mb-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Droplets className="size-4 text-primary" /> Agua usada para limpieza por planta
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total acumulado: <span className="font-mono tabular-nums font-semibold">{Math.round(agua.data?.total ?? 0).toLocaleString("es-SV")}</span> galones
              </p>
            </div>
            <Suspense fallback={<ChartSkeleton />}>
              {agua.isLoading ? <ChartSkeleton /> : <StaffCharts.AguaPlantaChart data={(agua.data?.filas ?? []).slice(0, 8)} />}
            </Suspense>
            {!agua.isLoading && (agua.data?.filas?.length ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">Aún no se ha registrado consumo de agua en ningún reporte.</p>
            )}
          </TabsContent>
        </Tabs>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card border border-border rounded-xl p-5 min-w-0">
          <h2 className="text-base font-semibold mb-4">Top 5 plantas con más trabajos</h2>
          <Suspense fallback={<ChartSkeleton />}>
            {series.isLoading ? <ChartSkeleton /> : <StaffCharts.TopPlantasChart data={series.data?.topPlantas ?? []} />}
          </Suspense>
        </section>
        <section className="bg-card border border-border rounded-xl p-5 min-w-0">
          <h2 className="text-base font-semibold mb-4">Distribución por tipo</h2>
          <Suspense fallback={<ChartSkeleton />}>
            {series.isLoading ? <ChartSkeleton /> : <StaffCharts.DistribucionTipoChart data={series.data?.porTipo ?? []} />}
          </Suspense>
        </section>
      </div>
    </div>
  );
}

function AtencionCard({ to, icon: Icon, label, destino, count, tone = "danger" }: { to: string; icon: any; label: string; destino: string; count: number; tone?: "danger" | "info" }) {
  const activo = count > 0;
  const color = !activo ? "text-muted-foreground" : tone === "info" ? "text-primary" : "text-destructive";
  const borde = !activo ? "border-border" : tone === "info" ? "border-primary/40" : "border-destructive/40";
  return (
    <Link to={to} className={"flex items-center gap-4 p-4 bg-card border rounded-lg hover:bg-secondary transition-colors min-w-0 " + borde}>
      <span className={"text-3xl font-semibold font-display tabular-nums shrink-0 " + color}>{count}</span>
      <span className="min-w-0 flex-1">
        <span className={"flex items-start gap-1.5 text-sm font-medium leading-snug " + (activo ? "" : "text-muted-foreground")}>
          <Icon className={"size-4 shrink-0 " + color} /> <span className="min-w-0">{label}</span>
        </span>
        <span className="block text-xs text-muted-foreground">{destino} →</span>
      </span>
    </Link>
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
  const proximos = ts.filter((t) => t.estado === "programado" && !(t as any).pausada_at && new Date(t.fecha_programada).getTime() >= ahora);
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
    <div className="dashboard-screen p-4 md:p-6 xl:p-8 max-w-[112rem] mx-auto w-full space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Panel del Cliente</h1>
        <p className="text-sm text-muted-foreground mt-1">Resumen operativo de tus plantas · {hoy}</p>
      </div>

      {trabajos.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">Cargando trabajos pendientes de firma…</p>
      ) : trabajos.isError ? (
        <p className="text-sm text-destructive" role="alert">No se pudieron cargar los trabajos pendientes de firma.</p>
      ) : pendienteFirma.length > 0 ? (
        <section className="bg-card border border-destructive/50 rounded-lg p-5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-base font-semibold tabular-nums">
              Tienes {pendienteFirma.length} {pendienteFirma.length === 1 ? "trabajo pendiente" : "trabajos pendientes"} de firma
            </h2>
            <Button asChild><Link to="/mis-trabajos">Firmar ahora</Link></Button>
          </div>
          <ul className="space-y-3 text-sm">
            {pendienteFirma.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-start gap-3">
                <span className="mt-1 size-2 shrink-0 rounded-full bg-destructive" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium break-words"><span className="tabular-nums">{t.folio}</span> · {t.servicio}</p>
                  <p className="text-xs text-muted-foreground break-words">{t.planta_nombre} · Completado {new Date(t.fecha_completado ?? t.fecha_programada).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" })}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Todo al día: no tienes trabajos pendientes de firma.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label}
            className={"dashboard-kpi p-5 bg-card border border-border rounded-lg shadow-sm " + (k.tone === "danger" ? "ring-2 ring-destructive/20" : "")}>
            <p className={"text-xs font-medium mb-3 " + (k.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{k.label}</p>
            <p className={"text-3xl font-semibold font-display tabular-nums " + (k.tone === "danger" ? "text-destructive" : "")}>{k.value}</p>
          </div>
        ))}
      </div>

      <section className="bg-card border border-border rounded-xl p-5"><CumplimientoContratos /></section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Mis plantas solares</h2>
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
            const abiertos = tp.filter((t) => (t.estado === "programado" && !(t as any).pausada_at) || t.estado === "en_progreso").length;
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                    <Sun className="size-5" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">{abiertos} abiertos</span>
                </div>
                <h3 className="font-semibold">{p.nombre}</h3>
                <p className="text-xs text-muted-foreground mb-3">{p.ubicacion ?? "—"}</p>
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Paneles</p>
                    <p className="text-sm font-mono tabular-nums font-semibold">{p.paneles?.toLocaleString("es-SV", ) ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Capacidad</p>
                    <p className="text-sm font-medium">{formatCapacidadKwp((p as any).capacidad_kwp)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Próximos trabajos</h2>
            <Link to="/trabajos" className="text-xs text-primary hover:underline font-medium">Ver →</Link>
          </div>
          <ul className="space-y-3 text-sm">
            {proximos.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-start gap-3">
                <span className="mt-1 size-2 rounded-full bg-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.folio} · {t.servicio}</p>
                  <p className="text-xs text-muted-foreground">{t.planta_nombre} · {new Date(t.fecha_programada).toLocaleString("es-SV", )}</p>
                </div>
              </li>
            ))}
            {proximos.length === 0 && <li className="text-xs text-muted-foreground text-center py-3">Sin trabajos programados.</li>}
          </ul>
        </div>
      </section>

      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Droplets className="size-4 text-primary" /> Agua usada para limpieza · {Math.round(agua.data?.total ?? 0).toLocaleString("es-SV", )} gal
        </h2>
        <ul className="divide-y divide-border text-sm">
          {(agua.data?.filas ?? []).slice(0, 8).map((r: any) => (
            <li key={r.planta_id} className="flex items-center justify-between py-2">
              <span className="truncate">{r.nombre}</span>
              <span className="font-mono tabular-nums text-xs">{Math.round(r.galones).toLocaleString("es-SV", )} gal</span>
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