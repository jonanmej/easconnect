import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
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
import { highestRole } from "@/lib/roles";
import { Plus, Pencil, Trash2, FileSignature, Copy, History, Archive, FileDown } from "lucide-react";
import { ReportesDiariosSection } from "@/components/ReportesDiariosSection";
import { ExportButton } from "@/components/ExportButton";
import { exportarExcel, fmtFechaSV } from "@/lib/excel";
import {
  listTrabajoRecursos,
  upsertTrabajoRecurso,
  deleteTrabajoRecurso,
  toggleRecursoFlag,
  listTrabajoEquipos,
} from "@/lib/trabajo-detalle.functions";
import { solicitarAprobacion } from "@/lib/aprobaciones.functions";
import { generarYDescargarRecursosPdf } from "@/lib/pdf/descargar";

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

function isWeekend(value: string) {
  if (!value) return false;
  const d = new Date(value);
  const day = d.getDay();
  return day === 0 || day === 6;
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
  const [tab, setTab] = useState<"diarios" | "recursos" | "ot" | "historial">("diarios");
  const [equipoIds, setEquipoIds] = useState<string[]>([]);
  const [tecExtraIds, setTecExtraIds] = useState<string[]>([]);
  const [tecFilter, setTecFilter] = useState<string>("");
  const [estadoFilter, setEstadoFilter] = useState<string>("");

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
    if (isWeekend(fecha)) {
      toast.error("No se pueden programar trabajos en sábado o domingo.");
      return;
    }
    save.mutate({
      id: editing?.id,
      planta_id: f.get("planta_id"),
      equipo_id: equipoIds[0] || null,
      equipo_ids: equipoIds,
      servicio: f.get("servicio"),
      fecha_programada: fecha,
      estado: f.get("estado"),
      tecnico_id: (f.get("tecnico_id") as string) || null,
      tecnicos_extra_ids: tecExtraIds,
      notas: f.get("notas") || null,
      duracion_dias: Number(f.get("duracion_dias") ?? 1),
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
                filename: `trabajos-${new Date().toISOString().slice(0,10)}.xlsx`,
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

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="programado">Programado</option>
          <option value="en_progreso">En progreso</option>
          <option value="completado">Completado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        {canEdit && (
          <select
            value={tecFilter}
            onChange={(e) => setTecFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="">Todos los técnicos</option>
            <option value="__sin__">Sin asignar</option>
            {(tecnicos.data as any[] | undefined)?.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-secondary border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Folio</th>
              <th className="px-4 py-3 text-left">Cliente / Planta</th>
              <th className="px-4 py-3 text-left">Servicio</th>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Estado</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.isLoading && (
              <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">Cargando…</td></tr>
            )}
            {(list.data as any[] | undefined)?.map((t) => (
              ((!estadoFilter || t.estado === estadoFilter)
                && (!tecFilter
                    || (tecFilter === "__sin__" ? !t.tecnico_id : t.tecnico_id === tecFilter))) ? (
              <tr key={t.id} className="hover:bg-secondary/40 transition-colors">
                <td className="px-4 py-4 font-mono text-xs">{t.folio}</td>
                <td className="px-4 py-4">
                  <p className="font-medium">{t.cliente_nombre}</p>
                  <p className="text-[10px] text-muted-foreground">{t.planta_nombre}</p>
                </td>
                <td className="px-4 py-4 text-xs">{t.servicio}</td>
                <td className="px-4 py-4 text-xs text-muted-foreground">
                  {new Date(t.fecha_programada).toLocaleString()}
                </td>
                <td className="px-4 py-4">
                  <span className={"inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " + (estadoCls[t.estado] ?? "bg-secondary")}>
                    {estadoLabel[t.estado] ?? t.estado}
                  </span>
                </td>
                {canEdit && (
                  <td className="px-4 py-4 text-right">
                    <div className="inline-flex gap-1">
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
                    </div>
                  </td>
                )}
              </tr>
              ) : null
            ))}
          </tbody>
        </table>
      </div>

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
                if (isWeekend(e.currentTarget.value)) {
                  toast.warning("Sábado y domingo no son días laborables.");
                }
              }}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Solo días laborables (lunes a viernes).</p>
          </Field>
          <Field label="Duración (días)">
            <input name="duracion_dias" type="number" min={1} max={60}
              defaultValue={editing?.duracion_dias ?? 1} className={inputCls} />
          </Field>
        </div>
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
          <ReportesDiariosSection trabajoId={editing.id} />
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
            max={new Date().toISOString().slice(0, 10)} />
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
                  {new Date(r.created_at).toLocaleString("es-CL")} · por {r.asignado_por_nombre}
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
  const fToggle = useServerFn(toggleRecursoFlag);
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
  const toggle = useMutation({
    mutationFn: (v: any) => fToggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trabajo-recursos", trabajoId] }),
  });

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); e.stopPropagation();
    const f = new FormData(e.currentTarget);
    add.mutate({
      categoria: f.get("categoria"),
      descripcion: f.get("descripcion"),
      cantidad: Number(f.get("cantidad") || 1),
      unidad: f.get("unidad") || "un",
      notas: f.get("notas") || null,
    });
    e.currentTarget.reset();
  }

  const rows = (list.data as any[] | undefined) ?? [];
  const [downloading, setDownloading] = useState(false);

  async function exportarPdf() {
    if (!trabajo) return;
    setDownloading(true);
    try {
      await generarYDescargarRecursosPdf({
        folio: trabajo.folio ?? trabajoId.slice(0, 8),
        cliente: clienteNombre ?? "—",
        planta: plantaNombre ?? "—",
        servicio: trabajo.servicio ?? "—",
        fecha: trabajo.fecha_programada
          ? new Date(trabajo.fecha_programada).toLocaleString("es-SV")
          : "—",
        estado: trabajo.estado ?? "—",
        notas: trabajo.notas ?? null,
        recursos: rows.map((r) => ({
          categoria: r.categoria,
          descripcion: r.descripcion,
          cantidad: Number(r.cantidad ?? 0),
          unidad: r.unidad,
          entregado: !!r.entregado,
          devuelto: !!r.devuelto,
          notas: r.notas ?? null,
        })),
        emitido_at: new Date().toLocaleDateString("es-SV", { year: "numeric", month: "long", day: "numeric" }),
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
          <button
            type="button"
            onClick={exportarPdf}
            disabled={downloading || rows.length === 0}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-[11px] font-medium border border-border rounded-md hover:bg-secondary disabled:opacity-50"
            title="Descargar checklist imprimible ISO 9001:2015"
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
              <th className="px-2 py-2 text-center">Entreg.</th>
              <th className="px-2 py-2 text-center">Devuelto</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-2 capitalize">{r.categoria}</td>
                <td className="px-2 py-2">{r.descripcion}{r.notas && <span className="block text-[10px] text-muted-foreground">{r.notas}</span>}</td>
                <td className="px-2 py-2 text-right font-mono">{r.cantidad} {r.unidad ?? ""}</td>
                <td className="px-2 py-2 text-center">
                  <input type="checkbox" checked={r.entregado} disabled={!canEdit}
                    onChange={(e) => toggle.mutate({ id: r.id, campo: "entregado", valor: e.currentTarget.checked })} />
                </td>
                <td className="px-2 py-2 text-center">
                  <input type="checkbox" checked={r.devuelto} disabled={!canEdit}
                    onChange={(e) => toggle.mutate({ id: r.id, campo: "devuelto", valor: e.currentTarget.checked })} />
                </td>
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
              <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">Sin recursos asignados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <form onSubmit={onAdd} className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3">
            <select name="categoria" required className={inputCls + " text-xs"} defaultValue="herramienta">
              {CAT_RECURSO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="col-span-4">
            <input name="descripcion" required placeholder="Descripción" className={inputCls + " text-xs"} />
          </div>
          <div className="col-span-2">
            <input name="cantidad" type="number" min="0.01" step="0.01" defaultValue={1} className={inputCls + " text-xs"} />
          </div>
          <div className="col-span-2">
            <input name="unidad" placeholder="un" className={inputCls + " text-xs"} />
          </div>
          <div className="col-span-1">
            <button type="submit" disabled={add.isPending}
              className="h-9 w-full grid place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="col-span-12">
            <input name="notas" placeholder="Notas (opcional)" className={inputCls + " text-xs"} />
          </div>
        </form>
      )}
    </div>
  );
}