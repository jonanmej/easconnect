import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { listClientes } from "@/lib/operations.functions";
import {
  listActividadesInternas,
  upsertActividadInterna,
  deleteActividadInterna,
  moverActividadInterna,
  listPersonalInterno,
} from "@/lib/actividades-internas.functions";
import {
  TIPOS_ACTIVIDAD_INTERNA,
  ESTADOS_ACTIVIDAD,
  PRIORIDADES_ACTIVIDAD,
  estadoActividadLabel,
  prioridadActividadLabel,
} from "@/lib/actividades-internas";
import { generarYDescargarProgramacionPdf } from "@/lib/pdf/descargar";
import { ChevronLeft, ChevronRight, CalendarDays, CalendarPlus, FileDown, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agenda-interna")({
  head: () => ({
    meta: [
      { title: "Agenda interna · EA Service Connect" },
      {
        name: "description",
        content: "Calendario de actividades administrativas internas: reuniones, trámites, capacitaciones y más.",
      },
      { property: "og:title", content: "Agenda interna · EA Service Connect" },
      {
        property: "og:description",
        content: "Programa y consulta las actividades administrativas internas de la empresa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendaInterna,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {(error as Error)?.message}</div>
  ),
});

type Vista = "semana" | "mes" | "anio";

const estadoCls: Record<string, string> = {
  pendiente: "bg-secondary text-foreground border-border",
  en_curso: "bg-primary/15 text-primary border-primary/30",
  hecha: "bg-accent/15 text-accent border-accent/30",
  cancelada: "bg-destructive/10 text-destructive border-destructive/30 line-through",
};
const prioridadDot: Record<string, string> = {
  baja: "bg-muted-foreground",
  media: "bg-primary",
  alta: "bg-destructive",
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function toISODateLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoWeek(d: Date) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil((((+x - +yearStart) / 86400000) + 1) / 7);
}
function fmtDayLabel(d: Date) {
  return d.toLocaleDateString("es-SV", { weekday: "short", day: "2-digit", month: "short" });
}
function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" });
}
function nombrePeriodoArchivo(vista: Vista, cursor: Date) {
  const slug = (s: string) => s.replace(/[\\/:*?"<>|.]+/g, "").replace(/\s+/g, "-").trim();
  if (vista === "anio") return String(cursor.getFullYear());
  if (vista === "mes") return slug(cursor.toLocaleDateString("es-SV", { month: "long", year: "numeric" }));
  const ini = startOfWeek(cursor);
  const fin = addDays(ini, 6);
  return slug(`Semana-${ini.getDate()}-al-${fin.getDate()}-${fin.toLocaleDateString("es-SV", { month: "short" })}-${fin.getFullYear()}`);
}

/** Días que ocupa la actividad (corridos, sin saltar fines de semana ni feriados). */
function diasDeActividad(a: any): Date[] {
  const base = new Date(a.fecha);
  base.setHours(0, 0, 0, 0);
  const n = Math.max(1, Number(a.duracion_dias ?? 1));
  return Array.from({ length: n }, (_, i) => addDays(base, i));
}

function AgendaInterna() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const role = highestRole(roles);
  const canEdit = role === "admin" || role === "supervisor";

  const fetchList = useServerFn(listActividadesInternas);
  const fetchPersonal = useServerFn(listPersonalInterno);
  const fetchClientes = useServerFn(listClientes);
  const fetchUpsert = useServerFn(upsertActividadInterna);
  const fetchDelete = useServerFn(deleteActividadInterna);
  const fetchMover = useServerFn(moverActividadInterna);

  const [vista, setVista] = usePersistedState<Vista>("agendaInterna.vista", "semana");
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));
  const [fTipo, setFTipo] = usePersistedState<string>("agendaInterna.tipo", "");
  const [fEstado, setFEstado] = usePersistedState<string>("agendaInterna.estado", "");
  const [fResp, setFResp] = usePersistedState<string>("agendaInterna.resp", "");
  const [dragId, setDragId] = useState<string | null>(null);

  const { data: actividades = [], isLoading } = useQuery({
    queryKey: ["actividades-internas"],
    queryFn: () => fetchList(),
  });
  const { data: personal = [] } = useQuery({
    queryKey: ["personal-interno"],
    queryFn: () => fetchPersonal(),
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => fetchClientes(),
  });

  const tipos = useMemo(
    () => Array.from(new Set([...TIPOS_ACTIVIDAD_INTERNA, ...actividades.map((a: any) => a.tipo)])),
    [actividades],
  );

  const filtradas = useMemo(
    () =>
      (actividades as any[]).filter(
        (a) =>
          (!fTipo || a.tipo === fTipo) &&
          (!fEstado || a.estado === fEstado) &&
          (!fResp || (a.responsables ?? []).includes(fResp)),
      ),
    [actividades, fTipo, fEstado, fResp],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, any[]>();
    filtradas.forEach((a) => {
      diasDeActividad(a).forEach((d, idx) => {
        const key = toISODateLocal(d);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ ...a, _diaIdx: idx });
      });
    });
    map.forEach((arr) => arr.sort((x, y) => +new Date(x.fecha) - +new Date(y.fecha)));
    return map;
  }, [filtradas]);

  const nombrePersonal = (id: string) => personal.find((p: any) => p.id === id)?.nombre ?? "—";

  // ---------- Diálogo crear/editar ----------
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    titulo: "",
    tipo: TIPOS_ACTIVIDAD_INTERNA[0] as string,
    estado: "pendiente",
    prioridad: "media",
    fecha: toISODateLocal(new Date()),
    hora: "08:00",
    hora_fin: "",
    duracion_dias: 1,
    lugar: "",
    cliente_id: "",
    responsables: [] as string[],
    notas: "",
  });
  const [err, setErr] = useState<string | null>(null);

  function abrirNueva(fecha?: Date) {
    setEditing(null);
    setErr(null);
    setForm({
      titulo: "",
      tipo: TIPOS_ACTIVIDAD_INTERNA[0] as string,
      estado: "pendiente",
      prioridad: "media",
      fecha: toISODateLocal(fecha ?? new Date()),
      hora: "08:00",
      hora_fin: "",
      duracion_dias: 1,
      lugar: "",
      cliente_id: "",
      responsables: [],
      notas: "",
    });
    setDlgOpen(true);
  }

  function abrirEditar(a: any) {
    setEditing(a);
    setErr(null);
    const d = new Date(a.fecha);
    setForm({
      titulo: a.titulo ?? "",
      tipo: a.tipo ?? TIPOS_ACTIVIDAD_INTERNA[0],
      estado: a.estado ?? "pendiente",
      prioridad: a.prioridad ?? "media",
      fecha: toISODateLocal(d),
      hora: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      hora_fin: (a.hora_fin ?? "").slice(0, 5),
      duracion_dias: Number(a.duracion_dias ?? 1),
      lugar: a.lugar ?? "",
      cliente_id: a.cliente_id ?? "",
      responsables: a.responsables ?? [],
      notas: a.notas ?? "",
    });
    setDlgOpen(true);
  }

  const guardar = useMutation({
    mutationFn: async () => {
      const fechaIso = new Date(`${form.fecha}T${form.hora || "08:00"}:00`).toISOString();
      return fetchUpsert({
        data: {
          ...(editing ? { id: editing.id } : {}),
          titulo: form.titulo.trim(),
          tipo: form.tipo,
          estado: form.estado as any,
          prioridad: form.prioridad as any,
          fecha: fechaIso,
          duracion_dias: Number(form.duracion_dias) || 1,
          hora_fin: form.hora_fin ? `${form.hora_fin}:00` : null,
          lugar: form.lugar.trim() || null,
          cliente_id: form.cliente_id || null,
          responsables: form.responsables,
          notas: form.notas.trim() || null,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["actividades-internas"] });
      setDlgOpen(false);
      toast.success(editing ? "Actividad actualizada" : "Actividad programada");
    },
    onError: (e: any) => setErr(e?.message ?? "No se pudo guardar la actividad"),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => fetchDelete({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["actividades-internas"] });
      setDlgOpen(false);
      toast.success("Actividad eliminada");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar"),
  });

  const mover = useMutation({
    mutationFn: async (args: { id: string; fecha: string }) => {
      const a = (actividades as any[]).find((x) => x.id === args.id);
      const original = a ? new Date(a.fecha) : new Date();
      const iso = new Date(
        `${args.fecha}T${String(original.getHours()).padStart(2, "0")}:${String(original.getMinutes()).padStart(2, "0")}:00`,
      ).toISOString();
      return fetchMover({ data: { id: args.id, fecha: iso } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["actividades-internas"] });
      toast.success("Actividad reprogramada");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo reprogramar"),
  });

  // ---------- PDF ----------
  const [pdfBusy, setPdfBusy] = useState(false);
  const [paper, setPaper] = usePersistedState<"A4" | "A3">("agendaInterna.paper", "A4");

  const rangoActual = useMemo(() => {
    if (vista === "semana") {
      const ini = startOfWeek(cursor);
      return { desde: ini, hasta: addDays(ini, 6) };
    }
    if (vista === "mes") {
      const ini = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      return { desde: ini, hasta: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0) };
    }
    return {
      desde: new Date(cursor.getFullYear(), 0, 1),
      hasta: new Date(cursor.getFullYear(), 11, 31),
    };
  }, [vista, cursor]);

  const headerTitle = useMemo(() => {
    if (vista === "anio") return String(cursor.getFullYear());
    if (vista === "mes") return cursor.toLocaleDateString("es-SV", { month: "long", year: "numeric" });
    const ini = startOfWeek(cursor);
    return `${fmtDayLabel(ini)} – ${fmtDayLabel(addDays(ini, 6))}`;
  }, [vista, cursor]);

  async function descargarPdf() {
    setPdfBusy(true);
    try {
      const desdeKey = toISODateLocal(rangoActual.desde);
      const hastaKey = toISODateLocal(rangoActual.hasta);
      const items = filtradas.filter((a) => {
        const k = toISODateLocal(new Date(a.fecha));
        return k >= desdeKey && k <= hastaKey;
      });
      const trabajos = items.map((a) => ({
        id: a.id,
        folio: a.tipo,
        cliente_nombre: (a.responsables ?? []).map(nombrePersonal).join(", ") || "—",
        planta_nombre: a.lugar || a.cliente_nombre || "—",
        servicio: a.titulo,
        estado: a.estado,
        fecha_programada: a.fecha,
        duracion_dias: a.duracion_dias ?? 1,
      }));
      const filtros: { label: string; value: string }[] = [];
      if (fTipo) filtros.push({ label: "Tipo", value: fTipo });
      if (fEstado) filtros.push({ label: "Estado", value: estadoActividadLabel(fEstado) });
      if (fResp) filtros.push({ label: "Responsable", value: nombrePersonal(fResp) });
      await generarYDescargarProgramacionPdf(
        {
          vista,
          headerTitle,
          trabajos,
          filtros,
          paper,
          orientation: "landscape",
          emitido_at: new Date().toLocaleString("es-SV"),
          documento_codigo: "EA-AGI",
          documento_version: "1.0",
          documento_clasificacion: "Uso interno",
          doc_titulo: "Agenda de actividades internas",
          doc_header: "EA Service Connect · Agenda interna",
          doc_unidad: "actividad",
          labels: { ot: "Tipo", cliente: "Responsables", planta: "Lugar", servicio: "Actividad" },
        },
        `Agenda-interna-${nombrePeriodoArchivo(vista, cursor)}.pdf`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  // ---------- Navegación ----------
  function nav(dir: -1 | 1) {
    if (vista === "semana") setCursor((c) => addDays(c, dir * 7));
    else if (vista === "mes") setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
    else setCursor((c) => new Date(c.getFullYear() + dir, 0, 1));
  }

  const semanaDias = useMemo(() => {
    const ini = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(ini, i));
  }, [cursor]);

  function onDropDay(d: Date) {
    if (!canEdit || !dragId) return;
    mover.mutate({ id: dragId, fecha: toISODateLocal(d) });
    setDragId(null);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Agenda interna"
        description="Actividades administrativas de la empresa: reuniones, trámites, capacitaciones y más. Se pueden programar cualquier día, incluidos fines de semana y feriados."
        actions={
          <>
            <select value={vista} onChange={(e) => setVista(e.target.value as Vista)} className={inputCls}>
              <option value="semana">Semana</option>
              <option value="mes">Mes</option>
              <option value="anio">Año</option>
            </select>
            <select value={paper} onChange={(e) => setPaper(e.target.value as "A4" | "A3")} className={inputCls}>
              <option value="A4">A4</option>
              <option value="A3">A3</option>
            </select>
            <button
              onClick={descargarPdf}
              disabled={pdfBusy}
              className="inline-flex items-center gap-2 min-h-10 px-3 text-sm rounded-md border border-border hover:bg-secondary disabled:opacity-60"
            >
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              PDF
            </button>
            {canEdit && (
              <button
                onClick={() => abrirNueva()}
                className="inline-flex items-center gap-2 min-h-10 px-3 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <CalendarPlus className="h-4 w-4" /> Nueva actividad
              </button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => nav(-1)} className="p-2 rounded-md border border-border hover:bg-secondary" aria-label="Anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setCursor(vista === "semana" ? startOfWeek(new Date()) : new Date())}
          className="inline-flex items-center gap-2 min-h-9 px-3 text-sm rounded-md border border-border hover:bg-secondary"
        >
          <CalendarDays className="h-4 w-4" /> Hoy
        </button>
        <button onClick={() => nav(1)} className="p-2 rounded-md border border-border hover:bg-secondary" aria-label="Siguiente">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium capitalize ml-1">{headerTitle}</span>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className={inputCls}>
            <option value="">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className={inputCls}>
            <option value="">Todos los estados</option>
            {ESTADOS_ACTIVIDAD.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <select value={fResp} onChange={(e) => setFResp(e.target.value)} className={inputCls}>
            <option value="">Todo el personal</option>
            {personal.map((p: any) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando actividades…</div>
      ) : vista === "semana" ? (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {semanaDias.map((d) => {
            const items = byDay.get(toISODateLocal(d)) ?? [];
            const hoy = toISODateLocal(d) === toISODateLocal(new Date());
            return (
              <div
                key={toISODateLocal(d)}
                onDragOver={(e) => canEdit && e.preventDefault()}
                onDrop={() => onDropDay(d)}
                className={`rounded-lg border p-2 min-h-40 ${hoy ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium capitalize">{fmtDayLabel(d)}</span>
                  {canEdit && (
                    <button onClick={() => abrirNueva(d)} className="text-xs text-primary hover:underline">+</button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {items.map((a) => (
                    <ActividadChip
                      key={`${a.id}-${a._diaIdx}`}
                      a={a}
                      canEdit={canEdit}
                      onClick={() => abrirEditar(a)}
                      onDragStart={() => setDragId(a.id)}
                      nombrePersonal={nombrePersonal}
                    />
                  ))}
                  {items.length === 0 && <p className="text-xs text-muted-foreground/60">Sin actividades</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : vista === "mes" ? (
        <MesView
          cursor={cursor}
          byDay={byDay}
          canEdit={canEdit}
          onNueva={abrirNueva}
          onEditar={abrirEditar}
          onDragStart={setDragId}
          onDropDay={onDropDay}
          nombrePersonal={nombrePersonal}
        />
      ) : (
        <AnioView
          year={cursor.getFullYear()}
          byDay={byDay}
          onPickMonth={(m) => {
            setCursor(new Date(cursor.getFullYear(), m, 1));
            setVista("mes");
          }}
        />
      )}

      <RecordDialog
        open={dlgOpen}
        onOpenChange={setDlgOpen}
        title={editing ? "Editar actividad interna" : "Nueva actividad interna"}
        description="Registra reuniones, trámites, capacitaciones y otras actividades administrativas."
        submitLabel={editing ? "Guardar cambios" : "Programar"}
        busy={guardar.isPending}
        error={err}
        className="sm:max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          guardar.mutate();
        }}
      >
        <Field label="Título">
          <input
            value={form.titulo}
            onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
            className={inputCls}
            placeholder="Reunión de planificación semanal"
            required
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))} className={inputCls}>
              {TIPOS_ACTIVIDAD_INTERNA.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Lugar">
            <input
              value={form.lugar}
              onChange={(e) => setForm((f) => ({ ...f, lugar: e.target.value }))}
              className={inputCls}
              placeholder="Oficina central / Taller / Virtual"
            />
          </Field>
          <Field label="Fecha">
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Hora de inicio">
            <input
              type="time"
              value={form.hora}
              onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Hora de fin (opcional)">
            <input
              type="time"
              value={form.hora_fin}
              onChange={(e) => setForm((f) => ({ ...f, hora_fin: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Duración (días)">
            <input
              type="number"
              min={1}
              max={60}
              value={form.duracion_dias}
              onChange={(e) => setForm((f) => ({ ...f, duracion_dias: Number(e.target.value) }))}
              className={inputCls}
            />
          </Field>
          <Field label="Estado">
            <select value={form.estado} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))} className={inputCls}>
              {ESTADOS_ACTIVIDAD.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Prioridad">
            <select value={form.prioridad} onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))} className={inputCls}>
              {PRIORIDADES_ACTIVIDAD.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Cliente relacionado (opcional)">
            <select
              value={form.cliente_id}
              onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))}
              className={inputCls}
            >
              <option value="">Sin cliente</option>
              {(clientes as any[]).map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Responsables">
          <div className="max-h-40 overflow-auto rounded-md border border-border p-2 space-y-1">
            {personal.map((p: any) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.responsables.includes(p.id)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      responsables: e.target.checked
                        ? [...f.responsables, p.id]
                        : f.responsables.filter((x) => x !== p.id),
                    }))
                  }
                />
                <span className="truncate">
                  {p.nombre}
                  {p.cargo ? <span className="text-muted-foreground"> · {p.cargo}</span> : null}
                </span>
              </label>
            ))}
            {personal.length === 0 && <p className="text-xs text-muted-foreground">Sin personal registrado.</p>}
          </div>
        </Field>
        <Field label="Notas">
          <textarea
            value={form.notas}
            onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            className={`${inputCls} min-h-20`}
            placeholder="Agenda, acuerdos previos, requisitos…"
          />
        </Field>
        {editing && canEdit && (
          <button
            type="button"
            onClick={() => {
              if (confirm("¿Eliminar esta actividad?")) borrar.mutate(editing.id);
            }}
            className="inline-flex items-center gap-2 text-xs text-destructive hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar actividad
          </button>
        )}
      </RecordDialog>
    </div>
  );
}

function ActividadChip({
  a, canEdit, onClick, onDragStart, nombrePersonal,
}: {
  a: any;
  canEdit: boolean;
  onClick: () => void;
  onDragStart: () => void;
  nombrePersonal: (id: string) => string;
}) {
  const dur = Number(a.duracion_dias ?? 1);
  return (
    <button
      type="button"
      draggable={canEdit}
      onDragStart={onDragStart}
      onClick={onClick}
      className={`w-full text-left rounded-md border px-2 py-1.5 text-xs ${estadoCls[a.estado] ?? estadoCls['pendiente']}`}
    >
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${prioridadDot[a.prioridad] ?? "bg-primary"}`} />
        <span className="font-medium truncate">{a.titulo}</span>
      </span>
      <span className="block text-[11px] opacity-80 truncate">
        {fmtHora(a.fecha)} · {a.tipo}
        {dur > 1 ? ` · d${(a._diaIdx ?? 0) + 1}/${dur}` : ""}
      </span>
      {(a.responsables ?? []).length > 0 && (
        <span className="block text-[11px] opacity-70 truncate">
          {(a.responsables as string[]).map(nombrePersonal).join(", ")}
        </span>
      )}
    </button>
  );
}

function MesView({
  cursor, byDay, canEdit, onNueva, onEditar, onDragStart, onDropDay, nombrePersonal,
}: {
  cursor: Date;
  byDay: Map<string, any[]>;
  canEdit: boolean;
  onNueva: (d: Date) => void;
  onEditar: (a: any) => void;
  onDragStart: (id: string) => void;
  onDropDay: (d: Date) => void;
  nombrePersonal: (id: string) => string;
}) {
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const first = startOfWeek(monthStart);
  const rows: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    rows.push(Array.from({ length: 7 }, (_, i) => addDays(first, w * 7 + i)));
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-1 mb-1 text-[11px] text-muted-foreground">
          <div />
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} className="text-center font-medium">{d}</div>
          ))}
        </div>
        {rows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-1 mb-1">
            <div className="text-[10px] font-mono text-muted-foreground/70 pr-1 pt-2">S{isoWeek(row[0]!)}</div>
            {row.map((d) => {
              const items = byDay.get(toISODateLocal(d)) ?? [];
              const inMonth = d.getMonth() === cursor.getMonth();
              return (
                <div
                  key={toISODateLocal(d)}
                  onDragOver={(e) => canEdit && e.preventDefault()}
                  onDrop={() => onDropDay(d)}
                  className={`rounded-md border p-1.5 min-h-24 ${inMonth ? "border-border bg-card" : "border-border/50 bg-muted/30"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] ${inMonth ? "text-foreground" : "text-muted-foreground/60"}`}>
                      {d.getDate()}
                    </span>
                    {canEdit && inMonth && (
                      <button onClick={() => onNueva(d)} className="text-[11px] text-primary hover:underline">+</button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {items.map((a) => (
                      <ActividadChip
                        key={`${a.id}-${a._diaIdx}`}
                        a={a}
                        canEdit={canEdit}
                        onClick={() => onEditar(a)}
                        onDragStart={() => onDragStart(a.id)}
                        nombrePersonal={nombrePersonal}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnioView({
  year, byDay, onPickMonth,
}: {
  year: number;
  byDay: Map<string, any[]>;
  onPickMonth: (m: number) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, m) => {
        const total = Array.from(byDay.entries())
          .filter(([k]) => k.startsWith(`${year}-${String(m + 1).padStart(2, "0")}`))
          .reduce((acc, [, v]) => acc + v.length, 0);
        const nombre = new Date(year, m, 1).toLocaleDateString("es-SV", { month: "long" });
        return (
          <button
            key={m}
            onClick={() => onPickMonth(m)}
            className="rounded-lg border border-border bg-card p-4 text-left hover:border-primary/50"
          >
            <p className="text-sm font-medium capitalize">{nombre}</p>
            <p className="text-2xl font-semibold mt-1">{total}</p>
            <p className="text-xs text-muted-foreground">actividad{total === 1 ? "" : "es"} programada{total === 1 ? "" : "s"}</p>
          </button>
        );
      })}
    </div>
  );
}
