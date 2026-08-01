import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import { Sparkles, Wand2, Eye, FileDown, Mail, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { listClientes, listPlantas } from "@/lib/operations.functions";
import { SERVICIOS_OT } from "@/lib/servicios";
import { listReportes, generarReporte, getReporte, marcarReporteEnviado, getReporteParaPDF, getResponsableReporte, eliminarReporte } from "@/lib/reportes.functions";
import { getReportesPeriodoPref, setReportesPeriodoPref } from "@/lib/profile.functions";
import { enviarReporteAprobacion, aprobarReporte, rechazarReporte, crearNuevaVersionReporte, listAuditoriaReporte } from "@/lib/reportes-workflow.functions";
import { enviarNotificacionReporte } from "@/lib/notificaciones.functions";
import { generarYDescargarPdf, buildEvidencias, withAspect } from "@/lib/pdf/descargar";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { ExportButton } from "@/components/ExportButton";
import { exportarExcel, fmtFechaSV } from "@/lib/excel";
import { exportarCSV, reportesARows } from "@/lib/exportar";
import { Sparkles as _Sparkles, Send, CheckCircle2, XCircle, History, GitBranch } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({
    meta: [{ title: "Reportes · EA Service Connect" }, { name: "description", content: "Reportes ejecutivos generados para clientes." }],
  }),
  component: Reportes,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

type R = {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  planta_id: string | null;
  planta_nombre: string | null;
  periodo: string;
  titulo: string;
  insight_resumen: string | null;
  estado: "borrador" | "enviado" | "aprobado" | "rechazado";
  model_used: string | null;
  created_at: string;
  desde?: string | null;
  hasta?: string | null;
  version?: number | null;
  enviado_por?: string | null;
  aprobado_por?: string | null;
  rechazado_por?: string | null;
  motivo_rechazo?: string | null;
};

/**
 * Calcula el alcance temporal de un reporte: "dia" cuando cubre una sola
 * fecha SV (o el periodo legacy es un día puntual) y "rango" cuando abarca
 * varios días. Devuelve null si no es determinable.
 */
function scopeDeReporte(r: R): { tipo: "dia" | "rango"; dias: number; etiqueta: string } | null {
  const tz = "America/El_Salvador";
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  let d1: Date | null = null;
  let d2: Date | null = null;
  if (r.desde && r.hasta) {
    d1 = new Date(r.desde);
    d2 = new Date(r.hasta);
  } else if (r.periodo) {
    const m = /^(\d{4}-\d{2}-\d{2})$/.exec(r.periodo.trim());
    if (m) {
      d1 = new Date(`${m[1]}T00:00:00`);
      d2 = new Date(`${m[1]}T23:59:59`);
    }
  }
  if (!d1 || !d2 || isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  const s1 = fmt(d1);
  const s2 = fmt(d2);
  if (s1 === s2) {
    return { tipo: "dia", dias: 1, etiqueta: `Diario · ${d1.toLocaleDateString("es-SV", { timeZone: tz, day: "2-digit", month: "short" })}` };
  }
  const ms = new Date(s2).getTime() - new Date(s1).getTime();
  const dias = Math.max(2, Math.round(ms / 86400000) + 1);
  return {
    tipo: "rango",
    dias,
    etiqueta: `Rango · ${dias} días (${d1.toLocaleDateString("es-SV", { timeZone: tz, day: "2-digit", month: "short" })} → ${d2.toLocaleDateString("es-SV", { timeZone: tz, day: "2-digit", month: "short" })})`,
  };
}

function Reportes() {
  const qc = useQueryClient();
  const fList = useServerFn(listReportes);
  const fClientes = useServerFn(listClientes);
  const fPlantas = useServerFn(listPlantas);
  const fGen = useServerFn(generarReporte);
  const fGet = useServerFn(getReporte);
  const fSend = useServerFn(marcarReporteEnviado);
  const fPdf = useServerFn(getReporteParaPDF);
  const fResp = useServerFn(getResponsableReporte);
  const fEmail = useServerFn(enviarNotificacionReporte);
  const fDel = useServerFn(eliminarReporte);
  const fEnviarApro = useServerFn(enviarReporteAprobacion);
  const fAprobar = useServerFn(aprobarReporte);
  const fRechazar = useServerFn(rechazarReporte);
  const fNuevaVer = useServerFn(crearNuevaVersionReporte);
  const fAud = useServerFn(listAuditoriaReporte);
  const { roles } = useAuth();
  const canEdit = ["admin", "supervisor"].includes(highestRole(roles) ?? "");
  const isCliente = highestRole(roles) === "cliente";

  const list = useQuery({ queryKey: ["reportes"], queryFn: () => fList() });
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: () => fClientes() });
  const plantas = useQuery({ queryKey: ["plantas"], queryFn: () => fPlantas() });

  const [openGen, setOpenGen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<string>("");
  const [viewing, setViewing] = useState<string | null>(null);

  // Filtros de listado para separar clientes/plantas y alcance temporal.
  const [filtroCliente, setFiltroCliente] = useState<string>("");
  const [filtroPlanta, setFiltroPlanta] = useState<string>("");
  const [filtroAlcance, setFiltroAlcance] = useState<"todos" | "dia" | "rango">("todos");
  const [agrupar, setAgrupar] = useState<"none" | "cliente" | "planta">("none");

  const plantasFiltradas = useMemo(() => {
    const all = (plantas.data as any[] | undefined) ?? [];
    return selectedCliente ? all.filter((p) => p.cliente_id === selectedCliente) : all;
  }, [plantas.data, selectedCliente]);

  const gen = useMutation({
    mutationFn: (v: any) => fGen({ data: v }),
    onSuccess: () => { toast.success("Reporte generado"); qc.invalidateQueries({ queryKey: ["reportes"] }); setOpenGen(false); setSelectedCliente(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  const send = useMutation({
    mutationFn: (id: string) => fSend({ data: { id } }),
    onSuccess: () => { toast.success("Marcado como enviado"); qc.invalidateQueries({ queryKey: ["reportes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => fDel({ data: { id } }),
    onSuccess: () => { toast.success("Reporte eliminado"); qc.invalidateQueries({ queryKey: ["reportes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const enviarApro = useMutation({
    mutationFn: (id: string) => fEnviarApro({ data: { id } }),
    onSuccess: () => { toast.success("Enviado a aprobación"); qc.invalidateQueries({ queryKey: ["reportes"] }); qc.invalidateQueries({ queryKey: ["reporte-auditoria"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const aprobar = useMutation({
    mutationFn: (id: string) => fAprobar({ data: { id } }),
    onSuccess: () => { toast.success("Reporte aprobado"); qc.invalidateQueries({ queryKey: ["reportes"] }); qc.invalidateQueries({ queryKey: ["reporte-auditoria"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rechazar = useMutation({
    mutationFn: (vars: { id: string; motivo: string }) => fRechazar({ data: vars }),
    onSuccess: () => { toast.success("Reporte rechazado"); qc.invalidateQueries({ queryKey: ["reportes"] }); qc.invalidateQueries({ queryKey: ["reporte-auditoria"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const nuevaVer = useMutation({
    mutationFn: (id: string) => fNuevaVer({ data: { id } }),
    onSuccess: () => { toast.success("Nueva versión creada"); qc.invalidateQueries({ queryKey: ["reportes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function descargarPdf(
    id: string,
    modo: "ejecutivo" | "interno",
    calidad: "normal" | "correo" = "normal",
  ) {
    setDownloadingId(id + modo + (calidad === "correo" ? "-correo" : ""));
    try {
      const data: any = await fPdf({ data: { id, variante: modo } });
      const evidencias = await buildEvidencias(data.evidencias, calidad);
      // Las imágenes extraídas de los PDFs subidos ya vienen como dataURL
      // desde el servidor; se agregan al final del set de evidencias.
      const evidenciasPdfRaw = (data.evidencias_pdf ?? []) as { trabajo: string; descripcion?: string | null; dataUrl: string }[];
      const evidenciasPdf = await withAspect(evidenciasPdfRaw, calidad);
      const evidenciasFinal = [...evidencias, ...evidenciasPdf];
      const firma = await fResp({ data: { reporte_id: id } }).catch(() => null);
      const res = await generarYDescargarPdf({
        ...data,
        modo,
        responsable: firma?.nombre ?? null,
        responsable_cargo: firma?.cargo ?? null,
        documento_codigo: `EA-${modo === "ejecutivo" ? "REP-EJE" : "REP-INT"}-${(data.periodo ?? "").toString().slice(0, 10).replace(/\s+/g, "")}`,
        documento_version: "1.0",
        documento_clasificacion: modo === "ejecutivo" ? "Confidencial · Cliente" : "Uso interno",
        evidencias: evidenciasFinal,
      }, (() => {
        const servicio = String(data.servicio ?? "General")
          .replace(/[\\/:*?"<>|]+/g, "")
          .replace(/\s+/g, "_")
          .trim() || "General";
        const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
        const suf = modo === "interno" ? "-interno" : "";
        const sufCorreo = calidad === "correo" ? "-correo" : "";
        return `Reporte-${servicio}-${fecha}${suf}${sufCorreo}.pdf`;
      })());
      const mb = res?.bytes ? (res.bytes / (1024 * 1024)).toFixed(1) : null;
      toast.success(
        mb
          ? `PDF descargado (${mb} MB)${calidad === "correo" ? " · optimizado para Outlook" : ""}`
          : "PDF descargado",
      );
    } catch (e: any) {
      toast.error(e.message ?? "Error al generar PDF");
    } finally {
      setDownloadingId(null);
    }
  }

  const emailMut = useMutation({
    mutationFn: (vars: { id: string; tipo: "reporte_ejecutivo" | "reporte_interno" }) =>
      fEmail({ data: { reporte_id: vars.id, tipo: vars.tipo } }),
    onSuccess: () => { toast.success("Correo enviado al cliente"); qc.invalidateQueries({ queryKey: ["reportes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const detail = useQuery({
    queryKey: ["reporte", viewing],
    queryFn: () => fGet({ data: { id: viewing! } }),
    enabled: !!viewing,
  });

  function onGenSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const planta_id = f.get("planta_id") as string;
    const servicio = (f.get("servicio") as string) || "";
    const desde = (f.get("desde") as string) || "";
    const hasta = (f.get("hasta") as string) || "";
    if (!desde || !hasta) {
      toast.error('Selecciona las fechas "Desde" y "Hasta".');
      return;
    }
    if (desde > hasta) {
      toast.error('La fecha "Desde" no puede ser posterior a "Hasta".');
      return;
    }
    gen.mutate({
      cliente_id: f.get("cliente_id"),
      planta_id: planta_id || null,
      periodo: f.get("periodo"),
      desde,
      hasta,
      proveedor: "auto",
      servicio: servicio || null,
    });
  }

  const items = (list.data as R[] | undefined) ?? [];
  // Plantas disponibles según el cliente seleccionado en los filtros.
  const plantasFiltro = useMemo(() => {
    const all = (plantas.data as any[] | undefined) ?? [];
    return filtroCliente ? all.filter((p) => p.cliente_id === filtroCliente) : all;
  }, [plantas.data, filtroCliente]);

  // Muestra dinámicamente los filtros: el filtro de Cliente solo tiene sentido
  // si el usuario ve reportes de más de un cliente (staff con RLS abierta).
  // El filtro de Planta se muestra cuando entre los reportes visibles hay
  // más de una planta (o más de una si además se contabiliza el "sin planta"
  // como opción extra).
  const clientesEnItems = useMemo(
    () => new Set(items.map((r) => r.cliente_id)).size,
    [items],
  );
  const mostrarFiltroCliente = !isCliente && clientesEnItems > 1;
  const plantasEnScope = useMemo(() => {
    const base = filtroCliente ? items.filter((r) => r.cliente_id === filtroCliente) : items;
    const set = new Set<string>();
    let sinPlanta = false;
    for (const r of base) {
      if (r.planta_id) set.add(r.planta_id);
      else sinPlanta = true;
    }
    return set.size + (sinPlanta ? 1 : 0);
  }, [items, filtroCliente]);
  const mostrarFiltroPlanta = plantasEnScope > 1;

  // Si el filtro deja de tener sentido (cliente único, o cliente elegido con
  // una sola planta), limpia el valor almacenado para no dejar filtros
  // "fantasma" activos.
  useEffect(() => {
    if (!mostrarFiltroCliente && filtroCliente) setFiltroCliente("");
  }, [mostrarFiltroCliente, filtroCliente]);
  useEffect(() => {
    if (!mostrarFiltroPlanta && filtroPlanta) setFiltroPlanta("");
  }, [mostrarFiltroPlanta, filtroPlanta]);
  // Si "Agrupar por" apunta a una dimensión que ya no se muestra, resetea.
  useEffect(() => {
    if (agrupar === "cliente" && !mostrarFiltroCliente) setAgrupar("none");
    if (agrupar === "planta" && !mostrarFiltroPlanta) setAgrupar("none");
  }, [agrupar, mostrarFiltroCliente, mostrarFiltroPlanta]);

  // Aplica los filtros de cliente, planta y alcance al listado.
  const itemsFiltrados = useMemo(() => {
    return items.filter((r) => {
      if (filtroCliente && r.cliente_id !== filtroCliente) return false;
      if (filtroPlanta) {
        if (filtroPlanta === "__sin__") { if (r.planta_id) return false; }
        else if (r.planta_id !== filtroPlanta) return false;
      }
      if (filtroAlcance !== "todos") {
        const sc = scopeDeReporte(r);
        if (!sc) return false;
        if (sc.tipo !== filtroAlcance) return false;
      }
      return true;
    });
  }, [items, filtroCliente, filtroPlanta, filtroAlcance]);

  // Agrupación opcional por cliente o por planta.
  const grupos = useMemo(() => {
    if (agrupar === "none") return [{ key: "__all__", label: "", rows: itemsFiltrados }];
    const map = new Map<string, { key: string; label: string; rows: R[] }>();
    for (const r of itemsFiltrados) {
      let key: string; let label: string;
      if (agrupar === "cliente") {
        key = r.cliente_id; label = r.cliente_nombre;
      } else {
        key = r.planta_id ?? "__sin__";
        label = r.planta_nombre ?? `Sin planta · ${r.cliente_nombre}`;
      }
      if (!map.has(key)) map.set(key, { key, label, rows: [] });
      map.get(key)!.rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [itemsFiltrados, agrupar]);

  const borradores = items.filter((r) => r.estado === "borrador").length;
  const enviados = items.filter((r) => r.estado === "enviado").length;
  const aprobados = items.filter((r) => r.estado === "aprobado").length;
  const rechazados = items.filter((r) => r.estado === "rechazado").length;

  const auditoria = useQuery({
    queryKey: ["reporte-auditoria", viewing],
    queryFn: () => fAud({ data: { reporte_id: viewing! } }),
    enabled: !!viewing && canEdit,
  });

  function estadoBadge(estado: R["estado"]) {
    const map: Record<string, string> = {
      borrador: "bg-primary/10 text-primary",
      enviado: "bg-amber-100 text-amber-800",
      aprobado: "bg-emerald-100 text-emerald-800",
      rechazado: "bg-destructive/10 text-destructive",
    };
    return (
      <span className={"inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " + (map[estado] ?? "bg-secondary text-foreground")}>
        {estado}
      </span>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Reportes Ejecutivos"
        description={
          isCliente
            ? "Informes ejecutivos del periodo con KPIs, hallazgos y recomendaciones."
            : "La IA analiza datos reales de trabajos, mantenimientos y equipos para generar un informe profesional por cliente."
        }
        actions={
          <>
            {!isCliente && (
              <>
            <ExportButton onExport={async () => {
              await exportarExcel({
                filename: `reportes-${new Date().toISOString().slice(0,10)}.xlsx`,
                hojas: [{
                  nombre: "Reportes",
                  columnas: [
                    { header: "Fecha", key: "created_at", width: 22, fn: (r: any) => fmtFechaSV(r.created_at) },
                    { header: "Cliente", key: "cliente_nombre", width: 28 },
                    { header: "Planta", key: "planta_nombre", width: 28 },
                    { header: "Periodo", key: "periodo", width: 18 },
                    { header: "Título", key: "titulo", width: 40 },
                    { header: "Estado", key: "estado", width: 14 },
                    { header: "Modelo IA", key: "model_used", width: 24 },
                  ],
                  filas: items,
                }],
              });
            }} />
            <ExportButton label="Exportar CSV" onExport={async () => {
              const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
              exportarCSV(reportesARows(items), `reportes-${dia}.csv`);
            }} />
              </>
            )}
            {canEdit && (
              <button onClick={() => setOpenGen(true)}
                className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
                <Wand2 className="size-3.5" /> Generar nuevo
              </button>
            )}
          </>
        }
      />

      {highestRole(roles) !== "cliente" && (
        <section className="relative overflow-hidden bg-slate-900 text-white rounded-xl p-6 md:p-8 mb-8">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary/40" />
          <div className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
            <div className="w-full h-20 bg-gradient-to-b from-primary/40 to-transparent animate-scanline" />
          </div>
          <div className="relative flex flex-wrap gap-6 items-start justify-between">
            <div className="max-w-2xl">
              {/* Badge de modelo oculto a todos los roles */}
              <h2 className="text-xl font-semibold mb-2">Convierte tus bitácoras en informes ejecutivos</h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                La IA toma los trabajos completados, mantenimientos y telemetría del periodo y produce KPIs, hallazgos y recomendaciones priorizadas para el cliente.
              </p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-center">
              <Stat label="Generados" value={items.length} />
              <Stat label="Borradores" value={borradores} tone="primary" />
              <Stat label="En revisión" value={enviados} tone="accent" />
              <Stat label="Aprobados" value={aprobados} tone="accent" />
              <Stat label="Rechazados" value={rechazados} tone="primary" />
            </div>
          </div>
        </section>
      )}

      {list.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {/* Filtros: cliente / planta / alcance / agrupación */}
      <div className="bg-card border border-border rounded-xl p-3 sm:p-4 mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {mostrarFiltroCliente && (
        <label className="text-xs font-medium text-muted-foreground space-y-1 block">
          <span className="uppercase tracking-wider">Cliente</span>
          <select
            value={filtroCliente}
            onChange={(e) => { setFiltroCliente(e.target.value); setFiltroPlanta(""); }}
            className={inputCls}
          >
            <option value="">Todos los clientes</option>
            {(clientes.data as any[] | undefined)?.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
        )}
        {mostrarFiltroPlanta && (
        <label className="text-xs font-medium text-muted-foreground space-y-1 block">
          <span className="uppercase tracking-wider">Planta</span>
          <select
            value={filtroPlanta}
            onChange={(e) => setFiltroPlanta(e.target.value)}
            className={inputCls}
          >
            <option value="">Todas las plantas</option>
            <option value="__sin__">Sin planta (consolidado del cliente)</option>
            {plantasFiltro.map((p: any) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </label>
        )}
        <label className="text-xs font-medium text-muted-foreground space-y-1 block">
          <span className="uppercase tracking-wider">Alcance</span>
          <select
            value={filtroAlcance}
            onChange={(e) => setFiltroAlcance(e.target.value as any)}
            className={inputCls}
          >
            <option value="todos">Todos</option>
            <option value="dia">Solo diarios (1 día)</option>
            <option value="rango">Solo rangos (varios días)</option>
          </select>
        </label>
        <label className="text-xs font-medium text-muted-foreground space-y-1 block">
          <span className="uppercase tracking-wider">Agrupar por</span>
          <select
            value={agrupar}
            onChange={(e) => setAgrupar(e.target.value as any)}
            className={inputCls}
          >
            <option value="none">Sin agrupar</option>
            {mostrarFiltroCliente && <option value="cliente">Cliente</option>}
            {mostrarFiltroPlanta && <option value="planta">Planta</option>}
          </select>
        </label>
        <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Mostrando <b className="text-foreground">{itemsFiltrados.length}</b> de {items.length} reportes.</span>
          {(filtroCliente || filtroPlanta || filtroAlcance !== "todos" || agrupar !== "none") && (
            <button
              type="button"
              onClick={() => { setFiltroCliente(""); setFiltroPlanta(""); setFiltroAlcance("todos"); setAgrupar("none"); }}
              className="h-7 px-2 rounded-md border border-border hover:bg-secondary"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {grupos.map((g) => (
          <div key={g.key} className="space-y-3">
            {agrupar !== "none" && (
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
                {g.label} <span className="text-muted-foreground/70 font-normal normal-case">· {g.rows.length} reporte{g.rows.length === 1 ? "" : "s"}</span>
              </h3>
            )}
            {g.rows.map((r) => {
              const sc = scopeDeReporte(r);
              return (
          <div key={r.id} className="bg-card border border-border rounded-xl p-4 sm:p-5 grid grid-cols-[auto_minmax(0,1fr)] gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-6 hover:border-primary/40 transition-colors">
            <div className="size-12 shrink-0 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0 sm:flex-1 sm:min-w-[240px]">
              <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-semibold tracking-tight truncate min-w-0 flex-1">
                {r.titulo}
              </h4>
              {sc && (
                <span className={
                  "inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider " +
                  (sc.tipo === "dia"
                    ? "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                    : "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300")
                } title={sc.etiqueta}>
                  {sc.tipo === "dia" ? "Diario" : `Rango · ${sc.dias}d`}
                </span>
              )}
              <span className={
                "inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider " +
                (r.planta_id
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300")
              }>
                {r.planta_id ? "Planta" : "Cliente"}
              </span>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5 truncate">
                {r.cliente_nombre}{r.planta_nombre ? ` · ${r.planta_nombre}` : ""} · {r.periodo} · {new Date(r.created_at).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" })}
              </p>
              {r.insight_resumen && <p className="text-sm mt-2 text-foreground/80 line-clamp-2">{r.insight_resumen}</p>}
            </div>
            <div className="col-span-2 flex flex-wrap items-center gap-2 sm:gap-3">
              {estadoBadge(r.estado)}
              {r.version && r.version > 1 && (
                <span className="text-[10px] font-mono text-muted-foreground">v{r.version}</span>
              )}
              <button onClick={() => setViewing(r.id)} className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary">
                <Eye className="size-3.5" /> Ver
              </button>
              {canEdit && r.estado === "borrador" && (
                <button onClick={() => enviarApro.mutate(r.id)} disabled={enviarApro.isPending}
                  className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-amber-300 text-amber-800 rounded-md hover:bg-amber-50 disabled:opacity-50">
                  <Send className="size-3.5" /> Enviar a aprobación
                </button>
              )}
              {canEdit && r.estado === "enviado" && r.enviado_por !== undefined && (
                <>
                  <button onClick={() => aprobar.mutate(r.id)} disabled={aprobar.isPending}
                    className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-emerald-400 text-emerald-700 rounded-md hover:bg-emerald-50 disabled:opacity-50">
                    <CheckCircle2 className="size-3.5" /> Aprobar
                  </button>
                  <button onClick={() => {
                    const motivo = prompt("Motivo del rechazo:");
                    if (motivo && motivo.trim().length >= 4) rechazar.mutate({ id: r.id, motivo: motivo.trim() });
                  }} disabled={rechazar.isPending}
                    className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-destructive/40 text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-50">
                    <XCircle className="size-3.5" /> Rechazar
                  </button>
                </>
              )}
              {isCliente && r.estado === "enviado" && (
                <>
                  <button onClick={() => aprobar.mutate(r.id)} disabled={aprobar.isPending}
                    className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-emerald-400 text-emerald-700 rounded-md hover:bg-emerald-50 disabled:opacity-50">
                    <CheckCircle2 className="size-3.5" /> Aprobar trabajo
                  </button>
                  <button onClick={() => {
                    const motivo = prompt("Motivo del rechazo (mínimo 4 caracteres):");
                    if (motivo && motivo.trim().length >= 4) rechazar.mutate({ id: r.id, motivo: motivo.trim() });
                  }} disabled={rechazar.isPending}
                    className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-destructive/40 text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-50">
                    <XCircle className="size-3.5" /> Rechazar
                  </button>
                </>
              )}
              {canEdit && (r.estado === "rechazado" || r.estado === "aprobado") && (
                <button onClick={() => nuevaVer.mutate(r.id)} disabled={nuevaVer.isPending}
                  className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary disabled:opacity-50"
                  title="Crear nueva versión a partir de este reporte">
                  <GitBranch className="size-3.5" /> Nueva versión
                </button>
              )}
              <button onClick={() => descargarPdf(r.id, "ejecutivo")} disabled={downloadingId === r.id + "ejecutivo"}
                className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
                <FileDown className="size-3.5" /> {downloadingId === r.id + "ejecutivo" ? "Generando…" : "PDF Ejec."}
              </button>
              {canEdit && (
                <button onClick={() => descargarPdf(r.id, "interno")} disabled={downloadingId === r.id + "interno"}
                  className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary disabled:opacity-50">
                  <FileDown className="size-3.5" /> PDF Interno
                </button>
              )}
              {canEdit && r.estado === "aprobado" && (
                <button onClick={() => emailMut.mutate({ id: r.id, tipo: "reporte_ejecutivo" })} disabled={emailMut.isPending}
                  className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary disabled:opacity-50"
                  title="Enviar email al cliente (solo si está aprobado)">
                  <Mail className="size-3.5" /> Enviar al cliente
                </button>
              )}
              {canEdit && (
                <button onClick={() => { if (confirm(`¿Eliminar el reporte "${r.titulo}"? Esta acción no se puede deshacer.`)) del.mutate(r.id); }}
                  disabled={del.isPending}
                  className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-destructive/40 text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-50"
                  title="Eliminar reporte">
                  <Trash2 className="size-3.5" /> Eliminar
                </button>
              )}
            </div>
          </div>
              );
            })}
          </div>
        ))}
        {!list.isLoading && itemsFiltrados.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Aún no hay reportes. Genera el primero.</p>
        )}
      </div>

      <RecordDialog
        open={openGen}
        onOpenChange={(v) => { setOpenGen(v); if (!v) setSelectedCliente(""); }}
        title="Generar reporte ejecutivo IA"
        description="La IA puede tardar 20-60 segundos. No cierres la ventana."
        submitLabel={gen.isPending ? "Generando con IA…" : "Generar"}
        busy={gen.isPending}
        error={gen.error?.message}
        onSubmit={onGenSubmit}
      >
        <Field label="Cliente">
          <select name="cliente_id" required value={selectedCliente} onChange={(e) => setSelectedCliente(e.target.value)} className={inputCls}>
            <option value="" disabled>Selecciona…</option>
            {(clientes.data as any[] | undefined)?.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Planta (opcional · todas si vacío)">
          <select name="planta_id" defaultValue="" className={inputCls}>
            <option value="">Todas las plantas del cliente</option>
            {plantasFiltradas.map((p: any) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Servicio (opcional · todos si vacío)">
          <select name="servicio" defaultValue="" className={inputCls}>
            <option value="">Todos los servicios</option>
            {SERVICIOS_OT.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <PeriodoTrimestralFields />
      </RecordDialog>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{(detail.data as any)?.titulo ?? "Reporte"}</DialogTitle>
            <DialogDescription>
              {!isCliente && (detail.data as any)?.model_used
                ? `Modelo: ${(detail.data as any).model_used}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {detail.data && (
            <article className="text-sm leading-relaxed space-y-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1 [&_h3]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_strong]:font-semibold">
              <ReactMarkdown>{(detail.data as any).contenido_markdown}</ReactMarkdown>
            </article>
          )}
          {canEdit && (
            <section className="mt-6 border-t border-border pt-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <History className="size-4" /> Auditoría del reporte
              </h3>
              {auditoria.isLoading ? (
                <p className="text-xs text-muted-foreground">Cargando historial…</p>
              ) : !(auditoria.data as any[] | undefined)?.length ? (
                <p className="text-xs text-muted-foreground">Sin movimientos registrados.</p>
              ) : (
                <ul className="space-y-2">
                  {(auditoria.data as any[]).map((a) => (
                    <li key={a.id} className="text-xs bg-secondary/40 rounded p-2 border border-border/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold uppercase tracking-wider">
                          {a.accion}
                          {a.version ? ` · v${a.version}` : ""}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(a.created_at).toLocaleString("es-SV", { timeZone: "America/El_Salvador" })}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        Por <span className="text-foreground">{a.actor_nombre}</span>
                        {a.estado_anterior && a.estado_nuevo
                          ? ` · ${a.estado_anterior} → ${a.estado_nuevo}`
                          : a.estado_nuevo ? ` · estado: ${a.estado_nuevo}` : ""}
                      </div>
                      {a.comentario && <p className="mt-1">{a.comentario}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "primary" | "accent" }) {
  return (
    <div className="bg-white/5 rounded-lg p-3 border border-white/10 min-w-[80px]">
      <p className={"text-2xl font-mono font-semibold " + (tone === "primary" ? "text-primary" : tone === "accent" ? "text-accent" : "")}>
        {String(value).padStart(2, "0")}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">{label}</p>
    </div>
  );
}

function quarterInfo(dateStr: string) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateStr);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const q = Math.floor((month - 1) / 3) + 1;
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    label: `Q${q} ${year}`,
    inicio: `${year}-${pad(startMonth)}-01`,
    fin: `${year}-${pad(endMonth)}-${pad(lastDay)}`,
    key: `${year}-Q${q}`,
  };
}

function fmtSV(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

const PERIODO_STORAGE_KEY = "reportes:periodo-form";

function PeriodoTrimestralFields() {
  const fGetPref = useServerFn(getReportesPeriodoPref);
  const fSetPref = useServerFn(setReportesPeriodoPref);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [manual, setManual] = useState(false);
  const [periodo, setPeriodo] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [modo, setModo] = useState<"rango" | "dia">("rango");
  const [diaEspecifico, setDiaEspecifico] = useState("");

  // Rehidratar: primero cache local (rápido), luego perfil (autoritativo cross-device).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERIODO_STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { desde?: string; hasta?: string; periodo?: string; manual?: boolean };
        if (s.desde) setDesde(s.desde);
        if (s.hasta) setHasta(s.hasta);
        if (s.periodo) setPeriodo(s.periodo);
        if (s.manual) setManual(true);
      }
    } catch { /* ignore */ }
    fGetPref()
      .then((pref) => {
        if (pref) {
          if (pref.desde) setDesde(pref.desde);
          if (pref.hasta) setHasta(pref.hasta);
          if (pref.periodo) setPeriodo(pref.periodo);
          if (typeof pref.manual === "boolean") setManual(pref.manual);
        }
      })
      .catch(() => { /* silencioso: usar cache local */ })
      .finally(() => setHydrated(true));
  }, []);

  // Validación de rango.
  const invalidRange = desde && hasta && desde > hasta ? true : false;

  // Trimestre(s) que abarca el rango seleccionado.
  const trimestre = useMemo(() => {
    const qD = quarterInfo(desde);
    const qH = quarterInfo(hasta);
    if (!qD && !qH) return null;
    if (qD && qH && qD.key !== qH.key) {
      return { label: `${qD.label} – ${qH.label}`, inicio: qD.inicio, fin: qH.fin };
    }
    const q = qD ?? qH!;
    return { label: q.label, inicio: q.inicio, fin: q.fin };
  }, [desde, hasta]);

  // Rango exacto seleccionado (coincide siempre con las fechas del formulario).
  const rangoSeleccionado = useMemo(() => {
    if (!desde || !hasta || invalidRange) return null;
    return { inicio: desde, fin: hasta };
  }, [desde, hasta, invalidRange]);

  // Auto-completar etiqueta si el usuario no la editó manualmente.
  useEffect(() => {
    if (manual) return;
    setPeriodo(trimestre?.label ?? "");
  }, [trimestre, manual]);

  // Persistir en localStorage + perfil (debounced).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PERIODO_STORAGE_KEY, JSON.stringify({ desde, hasta, periodo, manual }));
    } catch { /* ignore */ }
    if (invalidRange) return; // no persistimos estados inválidos en el perfil
    const t = setTimeout(() => {
      fSetPref({ data: { desde: desde || null, hasta: hasta || null, periodo: periodo || null, manual } })
        .catch(() => { /* silencioso */ });
    }, 600);
    return () => clearTimeout(t);
  }, [desde, hasta, periodo, manual, hydrated, invalidRange]);

  // Sincronizar el modo "día específico" con desde/hasta y etiqueta.
  useEffect(() => {
    if (modo !== "dia") return;
    if (!diaEspecifico) return;
    setDesde(diaEspecifico);
    setHasta(diaEspecifico);
    if (!manual) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(diaEspecifico);
      setPeriodo(m ? `${m[3]}-${m[2]}-${m[1]}` : diaEspecifico);
    }
  }, [modo, diaEspecifico, manual]);

  return (
    <>
      <Field label="Cobertura del reporte">
        <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setModo("rango")}
            className={"px-3 h-9 " + (modo === "rango" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-secondary")}
          >Rango de fechas</button>
          <button
            type="button"
            onClick={() => setModo("dia")}
            className={"px-3 h-9 border-l border-border " + (modo === "dia" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-secondary")}
          >Un día específico</button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Elige "Un día específico" para generar el reporte ejecutivo con lo reportado ese día únicamente.
        </p>
      </Field>
      {modo === "dia" && (
        <Field label="Día del reporte">
          <input
            type="date"
            required
            value={diaEspecifico}
            onChange={(e) => setDiaEspecifico(e.currentTarget.value)}
            className={inputCls}
          />
          {/* Hidden mirrors para que el submit reciba desde/hasta */}
          <input type="hidden" name="desde" value={diaEspecifico} />
          <input type="hidden" name="hasta" value={diaEspecifico} />
        </Field>
      )}
      <Field label="Etiqueta del periodo (trimestre auto)">
        <input
          name="periodo"
          required
          value={periodo}
          onChange={(e) => { setManual(true); setPeriodo(e.currentTarget.value); }}
          placeholder="Q2 2026"
          className={inputCls}
        />
        {trimestre && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Trimestre {trimestre.label}: <span className="font-mono">{fmtSV(trimestre.inicio)}</span> → <span className="font-mono">{fmtSV(trimestre.fin)}</span>
            {manual && <> · <button type="button" className="underline" onClick={() => { setManual(false); setPeriodo(trimestre.label); }}>usar automático</button></>}
          </p>
        )}
        {rangoSeleccionado && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Rango del reporte: <span className="font-mono">{fmtSV(rangoSeleccionado.inicio)}</span> → <span className="font-mono">{fmtSV(rangoSeleccionado.fin)}</span>
          </p>
        )}
      </Field>
      {modo === "rango" && (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde">
          <input name="desde" type="date" required value={desde} max={hasta || undefined}
            onChange={(e) => setDesde(e.currentTarget.value)}
            aria-invalid={invalidRange || undefined}
            className={inputCls + (invalidRange ? " border-destructive" : "")} />
        </Field>
        <Field label="Hasta">
          <input name="hasta" type="date" required value={hasta} min={desde || undefined}
            onChange={(e) => setHasta(e.currentTarget.value)}
            aria-invalid={invalidRange || undefined}
            className={inputCls + (invalidRange ? " border-destructive" : "")} />
        </Field>
      </div>
      )}
      {modo === "rango" && invalidRange && (
        <p className="text-[11px] text-destructive">La fecha "Desde" no puede ser posterior a "Hasta".</p>
      )}
    </>
  );
}