import { createFileRoute } from "@tanstack/react-router";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { ResponsiveTable } from "@/components/ResponsiveTable";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import { parseConflictoError, formatConflictoMensaje } from "@/lib/conflict-format";
import {
  listTrabajos,
  listPlantas,
  listEquipos,
  upsertTrabajo,
  deleteTrabajo,
  listTecnicos,
  listAsignacionesLog,
  crearTrabajoHistorico,
  listTrabajoTecnicosExtra,
} from "@/lib/operations.functions";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { highestRole } from "@/lib/roles";
import { Plus, Pencil, Trash2, FileSignature, Copy, History, Archive, FileDown, Search as SearchIcon } from "lucide-react";
import { ReportesDiariosSection } from "@/components/ReportesDiariosSection";
import { JornadaControl } from "@/components/JornadaControl";
import { ExportButton } from "@/components/ExportButton";
import { exportarExcel, fmtFechaSV } from "@/lib/excel";
import { exportarCSV, exportarXLSX, trabajosARows } from "@/lib/exportar";
import {
  listTrabajoRecursos,
  upsertTrabajoRecurso,
  deleteTrabajoRecurso,
  listTrabajoEquipos,
  listTrabajosConRecursos,
  copiarTrabajoRecursos,
} from "@/lib/trabajo-detalle.functions";
import { solicitarAprobacion } from "@/lib/aprobaciones.functions";
import { generarYDescargarRecursosPdf } from "@/lib/pdf/descargar";
import { motivoNoLaborableSV } from "@/lib/dias-habiles";

function SolicitarFirmaButton({ trabajoId, folio }: { trabajoId: string; folio: string }) {
  const fSolicitar = useServerFn(solicitarAprobacion);
  const m = useMutation({
    mutationFn: () => fSolicitar({ data: { trabajo_id: trabajoId } }),
    onSuccess: (r: any) => {
      navigator.clipboard?.writeText(r.link).catch(() => {});
      toast.success(`Enlace de firma copiado para ${folio}`, {
        description: r.link,
        duration: 8000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      onClick={() => m.mutate()}
      disabled={m.isPending}
      title="Generar enlace de aprobación para el cliente"
      aria-label="Solicitar firma del cliente"
      className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-primary disabled:opacity-50"
    >
      {m.isPending ? <Copy className="size-3.5 animate-pulse" /> : <FileSignature className="size-3.5" />}
    </button>
  );
}

import { SERVICIOS_OT } from "@/lib/servicios";

const CAT_RECURSO = [
  { value: "herramienta", label: "Herramienta" },
  { value: "equipo", label: "Equipo" },
  { value: "epp", label: "EPP" },
  { value: "insumo", label: "Insumo" },
  { value: "repuesto", label: "Repuesto" },
  { value: "otro", label: "Otro" },
] as const;

export const Route = createFileRoute("/_authenticated/trabajos")({
  head: () => ({
    meta: [{ title: "Trabajos · EA Service Connect" }, { name: "description", content: "Órdenes de trabajo: programadas, en progreso y completadas." }],
  }),
  validateSearch: (s: Record<string, unknown>): { alerta?: string } => ({
    alerta: typeof s.alerta === "string" ? (s.alerta as string) : undefined,
  }),
  component: Trabajos,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

const estadoLabel: Record<string, string> = {
  programado: "Programado",
  en_progreso: "En progreso",
  completado: "Completado",
  cancelado: "Cancelado",
};

const estadoCls: Record<string, string> = {
  programado: "bg-secondary text-foreground",
  en_progreso: "bg-primary/10 text-primary",
  completado: "bg-accent/10 text-accent",
  cancelado: "bg-destructive/10 text-destructive",
};

function toLocalInput(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function motivoNoLaborable(value: string): string | null {
  if (!value) return null;
  return motivoNoLaborableSV(new Date(value));
}

function Trabajos() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listTrabajos);
  const fetchPlantas = useServerFn(listPlantas);
  const fetchEquipos = useServerFn(listEquipos);
  const fetchUpsert = useServerFn(upsertTrabajo);
  const fetchDelete = useServerFn(deleteTrabajo);
  const fetchTrabajoEquipos = useServerFn(listTrabajoEquipos);
  const fetchTecnicos = useServerFn(listTecnicos);
  const fetchHistorico = useServerFn(crearTrabajoHistorico);
  const { roles } = useAuth();
  const role = highestRole(roles);
  const canEdit = ["admin", "supervisor", "tecnico"].includes(highestRole(roles) ?? "");
  const isTecnico = role === "tecnico";

  const list = useQuery({ queryKey: ["trabajos"], queryFn: () => fetchList() });
  const plantas = useQuery({ queryKey: ["plantas"], queryFn: () => fetchPlantas() });
  const equipos = useQuery({ queryKey: ["equipos"], queryFn: () => fetchEquipos() });
  const tecnicos = useQuery({ queryKey: ["tecnicos"], queryFn: () => fetchTecnicos(), enabled: canEdit });
  const [editing, setEditing] = useState<any | null>(null);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [tab, setTab] = usePersistedState<"diarios" | "recursos" | "ot" | "historial">("trabajos.tab", "diarios");
  const [equipoIds, setEquipoIds] = useState<string[]>([]);
  const [tecExtraIds, setTecExtraIds] = useState<string[]>([]);
  // Excepción de emergencia: permite programar en feriado / fin de semana.
  const [fechaSel, setFechaSel] = useState<string>("");
  const [emergencia, setEmergencia] = useState(false);
  const [emergenciaMotivo, setEmergenciaMotivo] = useState("");
  const puedeAutorizarEmergencia = role === "admin" || role === "supervisor";
  const [tecFilter, setTecFilter] = useState<string>("");
  const [estadoFilter, setEstadoFilter] = useState<string>("");
  const [plantaFilter, setPlantaFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [sortBy, setSortBy] = usePersistedState<"smart" | "fecha_asc" | "fecha_desc" | "folio" | "cliente" | "servicio" | "estado">("trabajos.sortBy", "smart");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => { setPage(1); }, [estadoFilter, plantaFilter, tecFilter, search, sortBy]);

  const { alerta } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  // Filtrado + búsqueda + ordenamiento (single source of truth)
  const filtrados = (() => {
    const q = search.trim().toLowerCase();
    const rows = ((list.data as any[] | undefined) ?? []).filter((t) =>
      (!estadoFilter || t.estado === estadoFilter)
      && (!plantaFilter || t.planta_id === plantaFilter)
      && (!tecFilter
          || (tecFilter === "__sin__" ? !t.tecnico_id : t.tecnico_id === tecFilter))
      && (!q
          || String(t.folio ?? "").toLowerCase().includes(q)
          || String(t.cliente_nombre ?? "").toLowerCase().includes(q)
          || String(t.planta_nombre ?? "").toLowerCase().includes(q)
          || String(t.servicio ?? "").toLowerCase().includes(q)
          || String(t.notas ?? "").toLowerCase().includes(q)),
    );
    const fechaMs = (t: any) => new Date(t.fecha_programada).getTime();
    const cmp: Record<string, (a: any, b: any) => number> = {
      smart: (a, b) => {
        // Orden: programados/en_progreso primero por fecha asc, luego completados por fecha desc, cancelados al final
        const rank = (t: any) => (t.estado === "programado" || t.estado === "en_progreso" ? 0 : t.estado === "completado" ? 1 : 2);
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;
        if (ra === 0) return fechaMs(a) - fechaMs(b);
        return fechaMs(b) - fechaMs(a);
      },
      fecha_asc: (a, b) => fechaMs(a) - fechaMs(b),
      fecha_desc: (a, b) => fechaMs(b) - fechaMs(a),
      folio: (a, b) => String(a.folio ?? "").localeCompare(String(b.folio ?? "")),
      cliente: (a, b) => String(a.cliente_nombre ?? "").localeCompare(String(b.cliente_nombre ?? "")),
      servicio: (a, b) => String(a.servicio ?? "").localeCompare(String(b.servicio ?? "")),
      estado: (a, b) => String(a.estado ?? "").localeCompare(String(b.estado ?? "")),
    };
    return [...rows].sort(cmp[sortBy] ?? cmp.smart);
  })();
  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const visibles = filtrados.slice(startIdx, startIdx + PAGE_SIZE);

  // Resaltar primer trabajo relacionado con la alerta entrante
  useEffect(() => {
    if (!alerta || !list.data) return;
    const now = Date.now();
    const rows = (list.data as any[]);
    let target: any = null;
    if (alerta === "sla") {
      target = rows
        .filter((t) => t.estado !== "completado" && t.estado !== "cancelado" && new Date(t.fecha_programada).getTime() < now)
        .sort((a, b) => new Date(a.fecha_programada).getTime() - new Date(b.fecha_programada).getTime())[0];
    }
    if (!target) return;
    setHighlightId(target.id);
    // Mover a la página que contiene el registro
    const idx = filtrados.findIndex((t) => t.id === target.id);
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE) + 1);
    // Limpiar el param de la URL para no re-disparar
    setTimeout(() => navigate({ search: {} as any, replace: true }), 100);
    const clr = setTimeout(() => setHighlightId(null), 6000);
    return () => clearTimeout(clr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerta, list.data]);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, currentPage]);

  // Cargar equipos asignados cuando se abre un trabajo existente
  const equiposAsignados = useQuery({
    queryKey: ["trabajo-equipos", editing?.id],
    queryFn: () => fetchTrabajoEquipos({ data: { trabajo_id: editing.id } }),
    enabled: !!editing?.id,
  });

  const fetchTecExtra = useServerFn(listTrabajoTecnicosExtra);
  const tecnicosExtraQ = useQuery({
    queryKey: ["trabajo-tecnicos-extra", editing?.id],
    queryFn: () => fetchTecExtra({ data: { trabajo_id: editing.id } }),
    enabled: !!editing?.id,
  });

  // Sincronizar selección con datos recibidos / reset al abrir
  useEffect(() => {
    if (!editing) { setEquipoIds([]); setTecExtraIds([]); setTab("diarios"); return; }
    if (!editing.id) { setEmergencia(false); setEmergenciaMotivo(""); }
    setFechaSel(toLocalInput(editing?.fecha_programada));
    if (editing.id && equiposAsignados.data) {
      setEquipoIds((equiposAsignados.data as any[]).map((e) => e.equipo_id));
    } else if (!editing.id) {
      setEquipoIds([]);
    }
    if (editing.id && tecnicosExtraQ.data) {
      setTecExtraIds((tecnicosExtraQ.data as any[]).map((e) => e.tecnico_id));
    } else if (!editing.id) {
      setTecExtraIds([]);
    }
    if (editing.id) setTab("diarios");
  }, [editing?.id, equiposAsignados.data, tecnicosExtraQ.data, isTecnico]);

  const save = useMutation({
    mutationFn: (vars: any) => fetchUpsert({ data: vars }),
    onSuccess: () => {
      toast.success("Trabajo guardado");
      qc.invalidateQueries({ queryKey: ["trabajos"] });
      qc.invalidateQueries({ queryKey: ["trabajo-equipos"] });
      setEditing(null);
    },
    onError: (e: Error) => {
      const conflictos = parseConflictoError(e.message);
      if (conflictos) {
        toast.error("Conflicto de asignación", {
          description: formatConflictoMensaje(e.message),
          duration: 8000,
        });
      } else {
        toast.error(e.message);
      }
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchDelete({ data: { id } }),
    onSuccess: () => { toast.success("Trabajo eliminado"); qc.invalidateQueries({ queryKey: ["trabajos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveHistorico = useMutation({
    mutationFn: (vars: any) => fetchHistorico({ data: vars }),
    onSuccess: () => {
      toast.success("Trabajo histórico registrado");
      qc.invalidateQueries({ queryKey: ["trabajos"] });
      setHistoricoOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmitHistorico(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    saveHistorico.mutate({
      planta_id: f.get("planta_id"),
      servicio: f.get("servicio"),
      fecha: f.get("fecha"),
      notas: (f.get("notas") as string) || null,
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const fecha = String(f.get("fecha_programada") ?? "");
    const motivoDia = motivoNoLaborable(fecha);
    if (motivoDia && !(emergencia && puedeAutorizarEmergencia)) {
      toast.error(
        `Ese día no es laborable (${motivoDia}). Si es una emergencia, activa la autorización de día no laborable.`,
      );
      return;
    }
    if (motivoDia && emergenciaMotivo.trim().length < 5) {
      toast.error("Indica la justificación de la emergencia (mínimo 5 caracteres).");
      return;
    }
    // Convertir "YYYY-MM-DDTHH:mm" (hora local del navegador) a ISO UTC
    // para que el servidor (UTC) no reinterprete el valor.
    const fechaIso = fecha ? new Date(fecha).toISOString() : "";
    save.mutate({
      id: editing?.id,
      planta_id: f.get("planta_id"),
      equipo_id: equipoIds[0] || null,
      equipo_ids: equipoIds,
      servicio: f.get("servicio"),
      fecha_programada: fechaIso,
      estado: f.get("estado"),
      tecnico_id: (f.get("tecnico_id") as string) || null,
      tecnicos_extra_ids: tecExtraIds,
      notas: f.get("notas") || null,
      duracion_dias: Number(f.get("duracion_dias") ?? 1),
      emergencia_no_laborable: !!motivoDia && emergencia,
      emergencia_motivo: motivoDia ? emergenciaMotivo.trim() : null,
    });
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title={isTecnico ? "Mis trabajos asignados" : "Órdenes de Trabajo"}
        description={isTecnico
          ? "Visualiza las órdenes asignadas a ti y registra su avance."
          : "Programa, ejecuta y cierra cada visita técnica."}
        actions={
          <>
            <ExportButton onExport={async () => {
              const rows = (list.data as any[] | undefined) ?? [];
              await exportarExcel({
                filename: `trabajos-${new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" })}.xlsx`,
                hojas: [{
                  nombre: "Trabajos",
                  columnas: [
                    { header: "Folio", key: "folio", width: 16 },
                    { header: "Cliente", key: "cliente_nombre", width: 28 },
                    { header: "Planta", key: "planta_nombre", width: 28 },
                    { header: "Servicio", key: "servicio", width: 32 },
                    { header: "Fecha programada", key: "fecha_programada", width: 22, fn: (r: any) => fmtFechaSV(r.fecha_programada) },
                    { header: "Estado", key: "estado", width: 14 },
                    { header: "Notas", key: "notas", width: 40 },
                  ],
                  filas: rows,
                }],
              });
            }} />
            <ExportButton label="Exportar filtrado (Excel)" onExport={async () => {
              const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
              const map = new Map<string, string>(
                ((tecnicos.data as any[] | undefined) ?? []).map((u) => [u.id, u.nombre]),
              );
              await exportarXLSX(trabajosARows(filtrados, map), `trabajos-filtrado-${dia}`);
            }} />
            <ExportButton label="Exportar filtrado (CSV)" onExport={async () => {
              const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
              const map = new Map<string, string>(
                ((tecnicos.data as any[] | undefined) ?? []).map((u) => [u.id, u.nombre]),
              );
              exportarCSV(trabajosARows(filtrados, map), `trabajos-filtrado-${dia}.csv`);
            }} />
            {canEdit && (
              <button
                onClick={() => setEditing({ estado: "programado", fecha_programada: new Date().toISOString() })}
                className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md"
              >
                <Plus className="size-3.5" /> Nuevo trabajo
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setHistoricoOpen(true)}
                title="Registrar un servicio ejecutado antes de usar la app"
                className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-secondary text-foreground border border-border rounded-md hover:bg-secondary/70"
              >
                <Archive className="size-3.5" /> Cargar histórico
              </button>
            )}
          </>
        }
      />

      {isTecnico && (
        <div className="mb-4">
          <JornadaControl />
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="relative w-full">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar folio, cliente, planta, servicio…"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          title="Ordenar por"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto"
        >
          <option value="smart">Orden inteligente (próximos primero)</option>
          <option value="fecha_asc">Fecha ascendente</option>
          <option value="fecha_desc">Fecha descendente</option>
          <option value="folio">Folio</option>
          <option value="cliente">Cliente</option>
          <option value="servicio">Servicio</option>
          <option value="estado">Estado</option>
        </select>
      </div>
      <div className="mb-4 grid grid-cols-1 xs:grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="h-9 w-full min-w-0 sm:w-auto rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="programado">Programado</option>
          <option value="en_progreso">En progreso</option>
          <option value="completado">Completado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select
          value={plantaFilter}
          onChange={(e) => setPlantaFilter(e.target.value)}
          className="h-9 w-full min-w-0 sm:w-auto sm:max-w-[240px] rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todas las plantas</option>
          {[...((plantas.data as any[] | undefined) ?? [])]
            .sort((a, b) =>
              String(a.cliente_nombre ?? "").localeCompare(String(b.cliente_nombre ?? "")) ||
              String(a.nombre ?? "").localeCompare(String(b.nombre ?? "")),
            )
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}{p.cliente_nombre ? ` — ${p.cliente_nombre}` : ""}
              </option>
            ))}
        </select>
        {canEdit && (
          <select
            value={tecFilter}
            onChange={(e) => setTecFilter(e.target.value)}
            className="h-9 w-full min-w-0 sm:w-auto rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos los técnicos</option>
            <option value="__sin__">Sin asignar</option>
            {(tecnicos.data as any[] | undefined)?.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        )}
      </div>

      <ResponsiveTable
        data={visibles}
        rowKey={(t) => t.id}
        emptyMessage={list.isLoading ? "Cargando…" : "Sin resultados"}
        cardClassName={(t) =>
          highlightId === t.id
            ? "bg-destructive/10 ring-2 ring-destructive/60 animate-pulse"
            : undefined
        }
        columns={[
          { key: "folio", header: "Folio", mobileLabel: "Folio", cell: (t) => <span className="font-mono text-xs">{t.folio}</span> },
          {
            key: "cliente_planta",
            header: "Cliente / Planta",
            primary: true,
            cell: (t) => (
              <>
                <p className="font-medium">{t.cliente_nombre}</p>
                <p className="text-[10px] text-muted-foreground">{t.planta_nombre}</p>
              </>
            ),
          },
          { key: "servicio", header: "Servicio", secondary: true, cell: (t) => <span className="text-xs">{t.servicio}</span> },
          {
            key: "fecha",
            header: "Fecha",
            cell: (t) => (
              <span className="text-xs text-muted-foreground">
                {new Date(t.fecha_programada).toLocaleString("es-SV", { timeZone: "America/El_Salvador" })}
              </span>
            ),
          },
          {
            key: "estado",
            header: "Estado",
            cell: (t) => (
              <span className={"inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " + (estadoCls[t.estado] ?? "bg-secondary")}>
                {estadoLabel[t.estado] ?? t.estado}
              </span>
            ),
          },
        ]}
        onRowClick={(t) => {
          if (highlightId === t.id && highlightRef.current) {
            // no-op: el resaltado se maneja vía scroll effect existente
          }
        }}
        rowActions={
          canEdit
            ? (t) => (
                <>
                  {t.estado === "completado" && !t.firmado_at && !(t.notas ?? "").startsWith("[HISTÓRICO]") && (
                    <SolicitarFirmaButton trabajoId={t.id} folio={t.folio} />
                  )}
                  {t.firmado_at && (
                    <span
                      className="size-8 grid place-items-center rounded-md text-accent"
                      title={`Firmado por ${t.firmado_por ?? "cliente"}`}
                    >
                      <FileSignature className="size-3.5" />
                    </span>
                  )}
                  <button onClick={() => setEditing(t)} className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" aria-label="Editar">
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Eliminar ${t.folio}?`)) remove.mutate(t.id); }}
                    className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )
            : undefined
        }
      />

      {filtrados.length > PAGE_SIZE && (
        (() => {
          const endIdx = Math.min(startIdx + PAGE_SIZE, filtrados.length);
          return (
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <span>Mostrando {startIdx + 1}–{endIdx} de {filtrados.length}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="h-8 px-3 rounded-md border border-border bg-background hover:bg-secondary disabled:opacity-40"
              >
                Anterior
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  aria-current={n === currentPage ? "page" : undefined}
                  className={
                    "h-8 min-w-8 px-2 rounded-md border text-xs " +
                    (n === currentPage
                      ? "bg-primary text-primary-foreground border-primary font-semibold"
                      : "bg-background border-border hover:bg-secondary")
                  }
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-8 px-3 rounded-md border border-border bg-background hover:bg-secondary disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
          );
        })()
      )}

      <RecordDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing?.id ? `Editar ${editing.folio ?? "trabajo"}` : "Nuevo trabajo"}
        busy={save.isPending}
        error={save.error ? formatConflictoMensaje(save.error.message) : null}
        onSubmit={onSubmit}
        className={editing?.id ? "max-w-[95vw] md:max-w-3xl lg:max-w-4xl" : undefined}
      >
        {editing?.id && (
          <div className="flex gap-1 border-b border-border -mt-2 mb-2 overflow-x-auto -mx-1 px-1">
            {(([
              { k: "diarios", l: "Reporte diario" },
              { k: "recursos", l: "Recursos" },
              { k: "ot", l: "Información de OT" },
              { k: "historial", l: "Historial de asignaciones" },
            ] as const).filter((t) => !isTecnico || (t.k !== "ot" && t.k !== "historial"))).map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setTab(t.k)}
                className={
                  "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0 " +
                  (tab === t.k
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground")
                }
              >
                {t.l}
              </button>
            ))}
          </div>
        )}

        <div className={editing?.id && tab !== "ot" ? "hidden" : "space-y-3"}>
        <Field label="Planta">
          <select name="planta_id" required defaultValue={editing?.planta_id ?? ""} className={inputCls}>
            <option value="">— Selecciona planta —</option>
            {(plantas.data as any[] | undefined)?.map((p) => (
              <option key={p.id} value={p.id}>{p.cliente_nombre} · {p.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Servicio">
          <select name="servicio" required defaultValue={editing?.servicio ?? ""} className={inputCls}>
            <option value="">— Selecciona servicio —</option>
            {SERVICIOS_OT.map((s) => <option key={s} value={s}>{s}</option>)}
            {editing?.servicio && !SERVICIOS_OT.includes(editing.servicio) && (
              <option value={editing.servicio}>{editing.servicio} (legado)</option>
            )}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha y hora">
            <input
              name="fecha_programada"
              type="datetime-local"
              required
              defaultValue={toLocalInput(editing?.fecha_programada)}
              className={inputCls}
              onChange={(e) => {
                const valor = e.currentTarget.value;
                setFechaSel(valor);
                const motivo = motivoNoLaborable(valor);
                if (motivo) {
                  toast.warning(
                    motivo === "feriado"
                      ? "Ese día es feriado; requiere autorización de emergencia."
                      : "Sábado y domingo requieren autorización de emergencia.",
                  );
                } else {
                  setEmergencia(false);
                }
              }}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Días laborables (lunes a viernes, sin feriados). En emergencias se puede autorizar un día no laborable.
            </p>
          </Field>
          <Field label="Duración (días)">
            <input name="duracion_dias" type="number" min={1} max={60}
              defaultValue={editing?.duracion_dias ?? 1} className={inputCls} />
          </Field>
        </div>
        {motivoNoLaborable(fechaSel) && (
          <div className="rounded-md border border-destructive/40 bg-destructive/[0.06] p-3 space-y-2">
            <p className="text-[11px] font-semibold text-destructive">
              La fecha elegida cae en {motivoNoLaborable(fechaSel)}.
            </p>
            {puedeAutorizarEmergencia ? (
              <>
                <label className="flex items-start gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    checked={emergencia}
                    onChange={(e) => setEmergencia(e.currentTarget.checked)}
                    className="mt-0.5"
                  />
                  <span>Autorizar trabajo en día no laborable (emergencia)</span>
                </label>
                {emergencia && (
                  <input
                    value={emergenciaMotivo}
                    onChange={(e) => setEmergenciaMotivo(e.currentTarget.value)}
                    placeholder="Justificación de la emergencia (obligatoria)"
                    maxLength={300}
                    className={inputCls}
                  />
                )}
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Solo un administrador o supervisor puede autorizar trabajo en días no laborables.
              </p>
            )}
          </div>
        )}
        <Field label="Estado">
            <select name="estado" defaultValue={editing?.estado ?? "programado"} className={inputCls}>
              <option value="programado">Programado</option>
              <option value="en_progreso">En progreso</option>
              <option value="completado">Completado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </Field>
        <Field label="Técnico asignado">
          <select name="tecnico_id" defaultValue={editing?.tecnico_id ?? ""} className={inputCls}>
            <option value="">— Sin asignar —</option>
            {(tecnicos.data as any[] | undefined)?.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          {tecnicos.isLoading && (
            <p className="text-[10px] text-muted-foreground mt-1">Cargando técnicos…</p>
          )}
          {tecnicos.data && (tecnicos.data as any[]).length === 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              No hay usuarios con rol técnico o supervisor. Crea uno en Usuarios.
            </p>
          )}
        </Field>
        <Field label={`Técnicos adicionales (${tecExtraIds.length})`}>
          <div className="border border-border rounded-md max-h-40 overflow-y-auto divide-y divide-border">
            {(tecnicos.data as any[] | undefined)?.length ? (
              (tecnicos.data as any[]).map((t) => {
                const principal = (document.querySelector('select[name="tecnico_id"]') as HTMLSelectElement | null)?.value;
                const isPrincipal = principal === t.id;
                const checked = tecExtraIds.includes(t.id);
                return (
                  <label key={t.id} className={"flex items-center gap-2 px-3 py-2 text-xs cursor-pointer " + (isPrincipal ? "opacity-50" : "hover:bg-secondary/40")}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPrincipal}
                      onChange={(ev) => {
                        setTecExtraIds((prev) =>
                          ev.currentTarget.checked
                            ? [...prev, t.id]
                            : prev.filter((x) => x !== t.id),
                        );
                      }}
                    />
                    <span>{t.nombre}</span>
                    {isPrincipal && <span className="ml-auto text-[10px] text-muted-foreground">(principal)</span>}
                  </label>
                );
              })
            ) : (
              <p className="px-3 py-3 text-xs text-muted-foreground">Sin técnicos disponibles.</p>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Marca técnicos de apoyo. Se valida conflicto de fechas y reciben notificación.
          </p>
        </Field>
        <Field label={`Equipos asignados (${equipoIds.length})`}>
          <div className="border border-border rounded-md max-h-48 overflow-y-auto divide-y divide-border">
            {(equipos.data as any[] | undefined)?.length ? (
              (equipos.data as any[]).map((e) => {
                const checked = equipoIds.includes(e.id);
                return (
                  <label key={e.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(ev) => {
                        setEquipoIds((prev) =>
                          ev.currentTarget.checked
                            ? [...prev, e.id]
                            : prev.filter((x) => x !== e.id),
                        );
                      }}
                    />
                    <span className="font-mono text-[10px] text-muted-foreground">{e.codigo}</span>
                    <span>{e.nombre}</span>
                    {e.tipo && <span className="ml-auto text-[10px] text-muted-foreground capitalize">{e.tipo}</span>}
                  </label>
                );
              })
            ) : (
              <p className="px-3 py-3 text-xs text-muted-foreground">No hay equipos registrados.</p>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Selecciona uno o más equipos para esta OT.</p>
        </Field>
        <Field label="Notas">
          <textarea name="notas" rows={3} defaultValue={editing?.notas ?? ""} className={inputCls} />
        </Field>
        </div>

        {editing?.id && tab === "diarios" && (
          <ReportesDiariosSection
            trabajoId={editing.id}
            readOnly
            hint="El llenado de reportes diarios y sus fotos se realiza desde el módulo A.T. (Terreno). Aquí puedes consultarlos."
          />
        )}
        {editing?.id && tab === "recursos" && (
          <RecursosSection
            trabajoId={editing.id}
            canEdit={canEdit}
            trabajo={editing}
            plantaNombre={(plantas.data as any[] | undefined)?.find((p) => p.id === editing.planta_id)?.nombre ?? "—"}
            clienteNombre={(plantas.data as any[] | undefined)?.find((p) => p.id === editing.planta_id)?.cliente_nombre ?? "—"}
          />
        )}
        {editing?.id && tab === "historial" && (
          <HistorialAsignacionesSection trabajoId={editing.id} />
        )}
      </RecordDialog>

      <RecordDialog
        open={historicoOpen}
        onOpenChange={(v) => !v && setHistoricoOpen(false)}
        title="Cargar trabajo histórico"
        busy={saveHistorico.isPending}
        error={saveHistorico.error ? saveHistorico.error.message : null}
        onSubmit={onSubmitHistorico}
      >
        <p className="text-[11px] text-muted-foreground -mt-1 mb-1">
          Registra un servicio ejecutado antes de la puesta en marcha de la app.
          Se guarda como <strong>completado</strong> y se marca con el prefijo
          <code className="mx-1">[HISTÓRICO]</code> en las notas.
        </p>
        <Field label="Planta">
          <select name="planta_id" required className={inputCls} defaultValue="">
            <option value="">— Selecciona planta —</option>
            {(plantas.data as any[] | undefined)?.map((p) => (
              <option key={p.id} value={p.id}>{p.cliente_nombre} · {p.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Servicio">
          <select name="servicio" required className={inputCls} defaultValue="">
            <option value="">— Selecciona servicio —</option>
            {SERVICIOS_OT.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Fecha de ejecución">
          <input name="fecha" type="date" required className={inputCls}
            max={new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" })} />
          <p className="text-[10px] text-muted-foreground mt-1">
            Debe ser una fecha pasada (anterior a hoy).
          </p>
        </Field>
        <Field label="Notas">
          <textarea name="notas" rows={3} className={inputCls}
            placeholder="Detalle del servicio realizado, observaciones, etc." />
        </Field>
      </RecordDialog>
    </div>
  );
}

function HistorialAsignacionesSection({ trabajoId }: { trabajoId: string }) {
  const fLog = useServerFn(listAsignacionesLog);
  const q = useQuery({
    queryKey: ["asignaciones-log", trabajoId],
    queryFn: () => fLog({ data: { trabajo_id: trabajoId } }),
  });
  const rows = (q.data as any[] | undefined) ?? [];
  return (
    <div className="pt-2 border-t border-border">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
        <History className="size-3.5" /> Historial de reasignaciones
      </p>
      {q.isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
      {!q.isLoading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">Aún no se han registrado asignaciones para este trabajo.</p>
      )}
      {rows.length > 0 && (
        <ol className="relative border-l border-border ml-2 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="ml-4">
              <span className="absolute -left-1.5 mt-1 size-3 rounded-full bg-primary" />
              <div className="text-xs">
                {r.tecnico_anterior_nombre ? (
                  <p>
                    Reasignado de <strong>{r.tecnico_anterior_nombre}</strong> a{" "}
                    <strong>{r.tecnico_nuevo_nombre}</strong>
                  </p>
                ) : (
                  <p>Asignado a <strong>{r.tecnico_nuevo_nombre}</strong></p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(r.created_at).toLocaleString("es-SV", { timeZone: "America/El_Salvador" })} · por {r.asignado_por_nombre}
                </p>
                {r.motivo && (
                  <p className="text-[10px] text-muted-foreground italic mt-0.5">"{r.motivo}"</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RecursosSection({
  trabajoId, canEdit, trabajo, plantaNombre, clienteNombre,
}: {
  trabajoId: string;
  canEdit: boolean;
  trabajo?: any;
  plantaNombre?: string;
  clienteNombre?: string;
}) {
  const qc = useQueryClient();
  const fList = useServerFn(listTrabajoRecursos);
  const fUp = useServerFn(upsertTrabajoRecurso);
  const fDel = useServerFn(deleteTrabajoRecurso);
  const list = useQuery({
    queryKey: ["trabajo-recursos", trabajoId],
    queryFn: () => fList({ data: { trabajo_id: trabajoId } }),
  });
  const add = useMutation({
    mutationFn: (v: any) => fUp({ data: { trabajo_id: trabajoId, ...v } }),
    onSuccess: () => { toast.success("Recurso agregado"); qc.invalidateQueries({ queryKey: ["trabajo-recursos", trabajoId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => fDel({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["trabajo-recursos", trabajoId] }); },
  });

  // Copiar desde otro trabajo (cualquier planta / cliente)
  const fListSrc = useServerFn(listTrabajosConRecursos);
  const fCopy = useServerFn(copiarTrabajoRecursos);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyQuery, setCopyQuery] = useState("");
  const [copyMode, setCopyMode] = useState<"agregar" | "reemplazar">("agregar");
  const srcList = useQuery({
    queryKey: ["trabajos-con-recursos"],
    queryFn: () => fListSrc(),
    enabled: copyOpen,
  });
  const copyMut = useMutation({
    mutationFn: (source_trabajo_id: string) =>
      fCopy({ data: { source_trabajo_id, target_trabajo_id: trabajoId, modo: copyMode } }),
    onSuccess: (r: any) => {
      toast.success(`${r.copiados} recurso${r.copiados === 1 ? "" : "s"} copiado${r.copiados === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["trabajo-recursos", trabajoId] });
      setCopyOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // No usamos <form> anidado (RecordDialog ya monta un <form> padre).
  // Un <form> dentro de otro es HTML inválido: React ignora el submit
  // del interno y el "+" no guardaba nada. Usamos refs + click handler.
  const addFormRef = useRef<HTMLDivElement>(null);
  function onAdd() {
    const root = addFormRef.current;
    if (!root) return;
    const cat = (root.querySelector('[name="categoria"]') as HTMLSelectElement | null)?.value;
    const desc = (root.querySelector('[name="descripcion"]') as HTMLInputElement | null)?.value?.trim();
    const cant = Number((root.querySelector('[name="cantidad"]') as HTMLInputElement | null)?.value || 1);
    const unidad = (root.querySelector('[name="unidad"]') as HTMLInputElement | null)?.value?.trim() || "un";
    const notas = (root.querySelector('[name="notas"]') as HTMLInputElement | null)?.value?.trim() || null;
    if (!desc) { toast.error("Descripción requerida"); return; }
    add.mutate({ categoria: cat, descripcion: desc, cantidad: cant, unidad, notas }, {
      onSuccess: () => {
        (root.querySelector('[name="descripcion"]') as HTMLInputElement | null)?.setAttribute("value", "");
        (root.querySelectorAll('input[name]') as NodeListOf<HTMLInputElement>).forEach((el) => {
          if (el.name === "cantidad") el.value = "1";
          else if (el.name === "unidad") el.value = "";
          else el.value = "";
        });
      },
    });
  }

  const rows = (list.data as any[] | undefined) ?? [];
  const [downloading, setDownloading] = useState(false);
  const { user } = useAuth();

  async function exportarPdf() {
    if (!trabajo) return;
    setDownloading(true);
    try {
      // Fecha de salida = último día laborable (L-V) que abarca la duración del trabajo.
      function lastWorkdayEnd(fechaIso: string, duracion: number): Date | null {
        if (!fechaIso) return null;
        const d = new Date(fechaIso);
        d.setHours(0, 0, 0, 0);
        let placed = 0;
        let last = new Date(d);
        const total = Math.max(1, Number(duracion || 1));
        while (placed < total) {
          const w = d.getDay();
          if (w !== 0 && w !== 6) { last = new Date(d); placed++; }
          d.setDate(d.getDate() + 1);
        }
        return last;
      }
      const fechaSalidaDate =
        (trabajo.fecha_fin ? new Date(trabajo.fecha_fin) : null) ??
        lastWorkdayEnd(trabajo.fecha_programada, trabajo.duracion_dias ?? 1);
      let elaboradoPor: string | null = null;
      if (user?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("display_name, nombres, apellidos")
          .eq("id", user.id)
          .maybeSingle();
        elaboradoPor =
          (prof?.nombres && prof?.apellidos
            ? `${prof.nombres} ${prof.apellidos}`.trim()
            : prof?.display_name) ||
          user.email ||
          null;
      }
      await generarYDescargarRecursosPdf({
        folio: trabajo.folio ?? trabajoId.slice(0, 8),
        cliente: clienteNombre ?? "—",
        planta: plantaNombre ?? "—",
        servicio: trabajo.servicio ?? "—",
        fecha: trabajo.fecha_programada
          ? new Date(trabajo.fecha_programada).toLocaleString("es-SV", { timeZone: "America/El_Salvador" })
          : "—",
        estado: trabajo.estado ?? "—",
        notas: trabajo.notas ?? null,
        trabajo_a_realizar: trabajo.servicio ?? null,
        fecha_entrada: trabajo.fecha_programada
          ? new Date(trabajo.fecha_programada).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" })
          : null,
        fecha_salida: fechaSalidaDate
          ? fechaSalidaDate.toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" })
          : null,
        elaborado_por: elaboradoPor,
        recursos: rows.map((r) => ({
          categoria: r.categoria,
          descripcion: r.descripcion,
          cantidad: Number(r.cantidad ?? 0),
          unidad: r.unidad,
          entregado: !!r.entregado,
          devuelto: !!r.devuelto,
          notas: r.notas ?? null,
        })),
        emitido_at: new Date().toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", year: "numeric", month: "long", day: "numeric" }),
        documento_codigo: `EA-REC-${trabajo.folio ?? trabajoId.slice(0, 8)}`,
        documento_version: "1.0",
        documento_clasificacion: "Uso interno",
      }, `EA-Service-Connect-Recursos-${trabajo.folio ?? trabajoId.slice(0, 8)}.pdf`);
      toast.success("PDF descargado");
    } catch (e: any) {
      toast.error(e.message ?? "Error al generar PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="pt-2 border-t border-border">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recursos para la visita</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{rows.length} ítem{rows.length === 1 ? "" : "s"}</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => setCopyOpen(true)}
              className="h-8 px-3 inline-flex items-center gap-1.5 text-[11px] font-medium border border-border rounded-md hover:bg-secondary"
              title="Copiar recursos desde otro trabajo (cualquier cliente / planta)"
            >
              <Copy className="size-3.5" />
              Copiar de otro trabajo
            </button>
          )}
          <button
            type="button"
            onClick={exportarPdf}
            disabled={downloading || rows.length === 0}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-[11px] font-medium border border-border rounded-md hover:bg-secondary disabled:opacity-50"
            title="Descargar checklist imprimible"
          >
            <FileDown className="size-3.5" />
            {downloading ? "Generando…" : "PDF imprimible"}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">
        Herramientas, EPP, equipos, insumos y repuestos que el técnico debe llevar a la empresa.
      </p>
      <div className="border border-border rounded-md overflow-x-auto mb-3">
        <table className="w-full text-xs">
          <thead className="bg-secondary text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">Cat.</th>
              <th className="px-2 py-2 text-left">Descripción</th>
              <th className="px-2 py-2 text-right">Cant.</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-2 capitalize">{r.categoria}</td>
                <td className="px-2 py-2">{r.descripcion}{r.notas && <span className="block text-[10px] text-muted-foreground">{r.notas}</span>}</td>
                <td className="px-2 py-2 text-right font-mono">{r.cantidad} {r.unidad ?? ""}</td>
                {canEdit && (
                  <td className="px-2 py-2 text-right">
                    <button type="button" onClick={() => del.mutate(r.id)}
                      className="size-7 grid place-items-center rounded hover:bg-secondary text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={canEdit ? 4 : 3} className="px-2 py-3 text-center text-muted-foreground">Sin recursos asignados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div ref={addFormRef} className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3">
            <select name="categoria" required className={inputCls + " text-xs"} defaultValue="herramienta">
              {CAT_RECURSO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="col-span-4">
            <input name="descripcion" required placeholder="Descripción" className={inputCls + " text-xs"}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }} />
          </div>
          <div className="col-span-2">
            <input name="cantidad" type="number" min="0.01" step="0.01" defaultValue={1} className={inputCls + " text-xs"} />
          </div>
          <div className="col-span-2">
            <input name="unidad" placeholder="un" className={inputCls + " text-xs"} />
          </div>
          <div className="col-span-1">
            <button type="button" onClick={onAdd} disabled={add.isPending}
              className="h-9 w-full grid place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="col-span-12">
            <input name="notas" placeholder="Notas (opcional)" className={inputCls + " text-xs"} />
          </div>
        </div>
      )}
      <RecordDialog
        open={copyOpen}
        onOpenChange={(v) => { if (!v) setCopyOpen(false); }}
        title="Copiar recursos desde otro trabajo"
        description="Elige un trabajo origen. Puedes agregar sus recursos a este, o reemplazar los actuales."
        submitLabel="Cerrar"
        onSubmit={(e) => { e.preventDefault(); setCopyOpen(false); }}
      >
        <div className="flex items-center gap-2 mb-2">
          <input
            value={copyQuery}
            onChange={(e) => setCopyQuery(e.target.value)}
            placeholder="Buscar por folio, planta, cliente o servicio…"
            className={inputCls + " text-xs flex-1"}
          />
          <select
            value={copyMode}
            onChange={(e) => setCopyMode(e.target.value as any)}
            className={inputCls + " text-xs w-40"}
            title="Cómo aplicar los recursos"
          >
            <option value="agregar">Agregar</option>
            <option value="reemplazar">Reemplazar</option>
          </select>
        </div>
        <div className="border border-border rounded-md max-h-[360px] overflow-y-auto">
          {srcList.isLoading && (
            <p className="p-4 text-xs text-muted-foreground text-center">Cargando…</p>
          )}
          {srcList.data && (() => {
            const q = copyQuery.trim().toLowerCase();
            const items = (srcList.data as any[])
              .filter((t) => t.id !== trabajoId)
              .filter((t) => {
                if (!q) return true;
                return (
                  (t.folio ?? "").toLowerCase().includes(q) ||
                  (t.planta_nombre ?? "").toLowerCase().includes(q) ||
                  (t.cliente_nombre ?? "").toLowerCase().includes(q) ||
                  (t.servicio ?? "").toLowerCase().includes(q)
                );
              })
              .slice(0, 100);
            if (items.length === 0) {
              return <p className="p-4 text-xs text-muted-foreground text-center">Sin trabajos con recursos.</p>;
            }
            return (
              <ul className="divide-y divide-border">
                {items.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">
                        <span className="font-mono">{t.folio ?? "—"}</span> · {t.planta_nombre}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {t.cliente_nombre} · {t.servicio} · {t.count} recurso{t.count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={copyMut.isPending}
                      onClick={() => copyMut.mutate(t.id)}
                      className="h-8 px-3 text-[11px] font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-50 shrink-0"
                    >
                      {copyMut.isPending ? "Copiando…" : "Usar este"}
                    </button>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      </RecordDialog>
    </div>
  );
}