import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { listTrabajos, reprogramarTrabajo, listPlantas } from "@/lib/operations.functions";
import { getDisponibilidad, crearSolicitud } from "@/lib/solicitudes.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { ChevronLeft, ChevronRight, CalendarDays, CalendarPlus, Printer } from "lucide-react";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import { SERVICIOS_OT } from "@/lib/servicios";

export const Route = createFileRoute("/_authenticated/programacion")({
  head: () => ({
    meta: [
      { title: "Programación · EA Service Connect" },
      { name: "description", content: "Calendario operativo: arrastra trabajos entre días para reprogramar." },
    ],
  }),
  component: Programacion,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

const estadoCls: Record<string, string> = {
  programado: "bg-secondary text-foreground border-border",
  en_progreso: "bg-primary/15 text-primary border-primary/30",
  completado: "bg-accent/15 text-accent border-accent/30",
  cancelado: "bg-destructive/10 text-destructive border-destructive/30 line-through",
};

const estadoDot: Record<string, string> = {
  programado: "bg-muted-foreground",
  en_progreso: "bg-primary",
  completado: "bg-accent",
  cancelado: "bg-destructive",
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lunes = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtDayLabel(d: Date) {
  return d.toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", weekday: "short", day: "2-digit", month: "short" });
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isWorkday(d: Date) {
  const w = d.getDay();
  return w !== 0 && w !== 6;
}
function addWorkdays(start: Date, workdays: number) {
  // Devuelve las N fechas laborables consecutivas (L-V) desde start (inclusive).
  const out: Date[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  while (out.length < workdays) {
    if (isWorkday(d)) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function isoWeek(d: Date) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil((((+x - +yearStart) / 86400000) + 1) / 7);
}

type Vista = "semana" | "mes" | "anio";

function Programacion() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const role = highestRole(roles);
  const canEdit = role === "admin" || role === "supervisor";
  const isCliente = role === "cliente";
  if (isCliente) return <ClienteCalendar />;
  const fetchList = useServerFn(listTrabajos);
  const fetchMove = useServerFn(reprogramarTrabajo);
  const [vista, setVista] = useState<Vista>("semana");
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));
  const [dragId, setDragId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["trabajos"],
    queryFn: () => fetchList(),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const trabajos = (list.data as any[] | undefined) ?? [];
  // Filtro por cliente (para vista anual)
  const [clienteFilter, setClienteFilter] = useState<string>("");
  // Filtros de impresión
  const [printOpen, setPrintOpen] = useState(false);
  const [printPaper, setPrintPaper] = useState<"A4" | "A3">("A4");
  const [printOrient, setPrintOrient] = useState<"landscape" | "portrait">("landscape");
  const [printCliente, setPrintCliente] = useState<string>("");
  const [printServicio, setPrintServicio] = useState<string>("");
  const [printFolio, setPrintFolio] = useState<string>("");
  const [printing, setPrinting] = useState(false);

  const clientesUnicos = useMemo(() => {
    const map = new Map<string, string>();
    trabajos.forEach((t) => { if (t.cliente_id) map.set(t.cliente_id, t.cliente_nombre ?? "—"); });
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [trabajos]);
  const trabajosFiltrados = useMemo(() => {
    let arr = clienteFilter ? trabajos.filter((t) => t.cliente_id === clienteFilter) : trabajos;
    if (printing) {
      if (printCliente) arr = arr.filter((t) => t.cliente_id === printCliente);
      if (printServicio) arr = arr.filter((t) => String(t.servicio ?? "").toLocaleLowerCase("es") === printServicio.toLocaleLowerCase("es"));
      if (printFolio.trim()) {
        const q = printFolio.trim().toLocaleLowerCase("es");
        arr = arr.filter((t) => String(t.folio ?? "").toLocaleLowerCase("es").includes(q));
      }
    }
    return arr;
  }, [trabajos, clienteFilter, printing, printCliente, printServicio, printFolio]);

  // Inyecta @page y dispara window.print() cuando `printing` pasa a true.
  useEffect(() => {
    if (!printing) return;
    const style = document.createElement("style");
    style.id = "print-page-config";
    style.textContent = `@media print { @page { size: ${printPaper} ${printOrient}; margin: 12mm; } }`;
    document.head.appendChild(style);
    const done = () => {
      setPrinting(false);
      style.remove();
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => {
      try { window.print(); } catch (_e) { done(); }
    }, 60);
    return () => { window.clearTimeout(t); style.remove(); window.removeEventListener("afterprint", done); };
  }, [printing, printPaper, printOrient]);

  function launchPrint() {
    setPrintOpen(false);
    setPrinting(true);
  }
  function resetPrintFilters() {
    setPrintCliente(""); setPrintServicio(""); setPrintFolio("");
  }

  // Solo Lun-Vie
  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(cursor, i)), [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, any[]>();
    trabajosFiltrados.forEach((t) => {
      const dt = new Date(t.fecha_programada);
      const dur = Math.max(1, Number(t.duracion_dias ?? 1));
      // Marcar el trabajo en cada día laborable (L-V) que abarque su duración.
      const dias = addWorkdays(dt, dur);
      dias.forEach((d, i) => {
        const key = d.toDateString();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ ...t, __diaIdx: i, __duracion: dur });
      });
    });
    return map;
  }, [trabajosFiltrados]);

  const totalSemana = useMemo(
    () => days.reduce((acc, d) => acc + (byDay.get(d.toDateString())?.length ?? 0), 0),
    [days, byDay],
  );

  const move = useMutation({
    mutationFn: (vars: { id: string; fecha_programada: string }) => fetchMove({ data: vars }),
    onSuccess: () => {
      toast.success("Trabajo reprogramado");
      qc.invalidateQueries({ queryKey: ["trabajos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onDrop(targetDay: Date) {
    if (!dragId) return;
    if (!isWorkday(targetDay)) { toast.error("No se permite programar en fin de semana"); setDragId(null); return; }
    const original = trabajos.find((t) => t.id === dragId);
    if (!original) return;
    const prev = new Date(original.fecha_programada);
    if (sameDay(prev, targetDay)) { setDragId(null); return; }
    const nd = new Date(targetDay);
    nd.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
    move.mutate({ id: dragId, fecha_programada: nd.toISOString() });
    setDragId(null);
  }

  function nav(delta: number) {
    const d = new Date(cursor);
    if (vista === "semana") d.setDate(d.getDate() + delta * 7);
    else if (vista === "mes") d.setMonth(d.getMonth() + delta);
    else d.setFullYear(d.getFullYear() + delta);
    setCursor(vista === "semana" ? startOfWeek(d) : d);
  }
  function goHoy() {
    setCursor(vista === "semana" ? startOfWeek(new Date()) : new Date());
  }

  const headerTitle =
    vista === "semana"
      ? `Semana del ${cursor.toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", day: "2-digit", month: "short" })}`
      : vista === "mes"
        ? cursor.toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", month: "long", year: "numeric" })
        : String(cursor.getFullYear());

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full print-area">
      <PageHeader
        title="Programación"
        description={canEdit && vista === "semana" ? "Arrastra un trabajo a otro día para reprogramarlo." : "Calendario operativo (lunes a viernes)."}
        actions={
          <div className="inline-flex items-center gap-2 flex-wrap no-print">
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              {(["semana", "mes", "anio"] as Vista[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setVista(v)}
                  className={"px-3 h-9 font-medium " + (vista === v ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}
                >
                  {v === "semana" ? "Semana" : v === "mes" ? "Mes" : "Año"}
                </button>
              ))}
            </div>
            <button onClick={() => nav(-1)} className="h-9 px-2 grid place-items-center border border-border rounded-md hover:bg-secondary" aria-label="Anterior">
              <ChevronLeft className="size-3.5" />
            </button>
            <button onClick={goHoy} className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary">
              <CalendarDays className="size-3.5" /> Hoy
            </button>
            <button onClick={() => nav(1)} className="h-9 px-2 grid place-items-center border border-border rounded-md hover:bg-secondary" aria-label="Siguiente">
              <ChevronRight className="size-3.5" />
            </button>
            <div className="relative">
              <button
                onClick={() => setPrintOpen((v) => !v)}
                className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary"
                title="Opciones de impresión"
              >
                <Printer className="size-3.5" /> Imprimir
              </button>
              {printOpen && (
                <div className="absolute right-0 mt-2 w-80 z-30 bg-popover text-popover-foreground border border-border rounded-md shadow-lg p-3 space-y-2 text-xs">
                  <p className="font-semibold text-sm">Opciones de impresión</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-muted-foreground">Papel</span>
                      <select value={printPaper} onChange={(e) => setPrintPaper(e.target.value as any)} className="w-full h-8 px-2 rounded border border-input bg-background">
                        <option value="A4">A4</option>
                        <option value="A3">A3</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-muted-foreground">Orientación</span>
                      <select value={printOrient} onChange={(e) => setPrintOrient(e.target.value as any)} className="w-full h-8 px-2 rounded border border-input bg-background">
                        <option value="landscape">Horizontal</option>
                        <option value="portrait">Vertical</option>
                      </select>
                    </label>
                  </div>
                  <label className="space-y-1 block">
                    <span className="text-muted-foreground">Cliente</span>
                    <select value={printCliente} onChange={(e) => setPrintCliente(e.target.value)} className="w-full h-8 px-2 rounded border border-input bg-background">
                      <option value="">Todos</option>
                      {clientesUnicos.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
                    </select>
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-muted-foreground">Servicio</span>
                    <select value={printServicio} onChange={(e) => setPrintServicio(e.target.value)} className="w-full h-8 px-2 rounded border border-input bg-background">
                      <option value="">Todos</option>
                      {SERVICIOS_OT.map((s) => (<option key={s} value={s}>{s}</option>))}
                    </select>
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-muted-foreground">Orden de trabajo (folio contiene)</span>
                    <input value={printFolio} onChange={(e) => setPrintFolio(e.target.value)} placeholder="Ej: T-2026-0046" className="w-full h-8 px-2 rounded border border-input bg-background" />
                  </label>
                  <div className="flex items-center justify-between pt-1">
                    <button onClick={resetPrintFilters} className="text-muted-foreground hover:text-foreground underline underline-offset-2">Limpiar filtros</button>
                    <div className="inline-flex gap-2">
                      <button onClick={() => setPrintOpen(false)} className="h-8 px-3 rounded border border-border hover:bg-secondary">Cancelar</button>
                      <button onClick={launchPrint} className="h-8 px-3 rounded bg-primary text-primary-foreground hover:opacity-90 inline-flex items-center gap-1.5">
                        <Printer className="size-3.5" /> Imprimir / Guardar PDF
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        }
      />

      <p className="text-xs font-semibold text-muted-foreground mb-3 capitalize">{headerTitle}</p>

      {vista === "semana" && (
      <div className="bg-card border border-border rounded-xl overflow-hidden print-week-grid">
        <div className="grid grid-cols-5 border-b border-border bg-secondary text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {days.map((d) => (
            <div key={d.toISOString()} className={"p-3 text-center border-l border-border first:border-l-0 " + (sameDay(d, new Date()) ? "text-primary" : "")}>
              {fmtDayLabel(d)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5 min-h-[420px]">
          {days.map((d) => {
            const items = byDay.get(d.toDateString()) ?? [];
            return (
              <div
                key={d.toISOString()}
                onDragOver={(e) => canEdit && e.preventDefault()}
                onDrop={() => onDrop(d)}
                className={"border-l border-border first:border-l-0 p-2 space-y-1.5 " + (sameDay(d, new Date()) ? "bg-primary/[0.03]" : "")}
              >
                {items.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/60 px-1 py-2">—</p>
                )}
                {items
                  .sort((a: any, b: any) => +new Date(a.fecha_programada) - +new Date(b.fecha_programada))
                  .map((t: any) => (
                    <div
                      key={t.id}
                      data-print-card
                      draggable={canEdit && t.estado !== "completado"}
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => setDragId(null)}
                      title={`${t.folio} · ${t.cliente_nombre}`}
                      className={
                        "rounded-md p-2 text-[11px] border cursor-grab active:cursor-grabbing select-none " +
                        (estadoCls[t.estado] ?? "bg-secondary border-border") +
                        (dragId === t.id ? " opacity-50" : "")
                      }
                    >
                      <p className="font-mono text-[10px] opacity-70">
                        {new Date(t.fecha_programada).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })} · {t.folio}
                      </p>
                      <p className="font-medium leading-tight mt-0.5 line-clamp-2">{t.servicio}</p>
                      <p className="text-[10px] opacity-70 truncate">{t.planta_nombre}</p>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {vista === "mes" && (
        <MonthView cursor={cursor} byDay={byDay} canEdit={canEdit} dragId={dragId} setDragId={setDragId} onDrop={onDrop} />
      )}

      {vista === "anio" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">Filtrar por cliente:</label>
            <select
              value={clienteFilter}
              onChange={(e) => setClienteFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">Todos los clientes</option>
              {clientesUnicos.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {clientesUnicos.length} cliente{clientesUnicos.length === 1 ? "" : "s"} con trabajos
              {clienteFilter && ` · mostrando ${trabajosFiltrados.length} trabajo${trabajosFiltrados.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <YearView year={cursor.getFullYear()} byDay={byDay} onPickMonth={(m) => { setCursor(new Date(cursor.getFullYear(), m, 1)); setVista("mes"); }} />
        </>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {vista === "semana"
            ? `${totalSemana} trabajos esta semana`
            : `${trabajos.length} trabajos en total`}
        </span>
        <div className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary/40 border border-primary/30" /> En progreso</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-accent/40 border border-accent/30" /> Completado</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-secondary border border-border" /> Programado</span>
        </div>
      </div>
    </div>
  );
}

// ============== Vista Mes (L-V) ==============
function MonthView({ cursor, byDay, canEdit, dragId, setDragId, onDrop }: {
  cursor: Date; byDay: Map<string, any[]>; canEdit: boolean;
  dragId: string | null; setDragId: (id: string | null) => void; onDrop: (d: Date) => void;
}) {
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const firstMonday = startOfWeek(monthStart);
  const weeks: Date[][] = [];
  let cur = firstMonday;
  while (cur <= monthEnd || weeks.length < 5) {
    const row = Array.from({ length: 5 }, (_, i) => addDays(cur, i));
    weeks.push(row);
    cur = addDays(cur, 7);
    if (weeks.length >= 6) break;
  }
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-border bg-secondary text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <div className="p-3 text-center">Sem.</div>
        {["Lun", "Mar", "Mié", "Jue", "Vie"].map((d) => (
          <div key={d} className="p-3 text-center border-l border-border">{d}</div>
        ))}
      </div>
      {weeks.map((row, ri) => (
        <div key={ri} className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-border last:border-b-0 min-h-[110px]">
          <div className="p-2 text-center text-[11px] font-mono text-muted-foreground bg-secondary/40 border-r border-border flex items-center justify-center">
            S{isoWeek(row[0])}
          </div>
          {row.map((d) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const items = byDay.get(d.toDateString()) ?? [];
            const today = sameDay(d, new Date());
            return (
              <div
                key={d.toISOString()}
                onDragOver={(e) => canEdit && e.preventDefault()}
                onDrop={() => onDrop(d)}
                className={"border-l border-border p-1.5 " + (today ? "bg-primary/[0.04] " : inMonth ? "" : "bg-muted/30 ")}
              >
                <div className={"text-[11px] font-mono mb-1 " + (today ? "text-primary font-bold" : inMonth ? "text-foreground" : "text-muted-foreground/60")}>
                  {d.getDate()}
                </div>
                <div className="space-y-1">
                  {items.slice(0, 3).map((t: any) => (
                    <div
                      key={`${t.id}-${t.__diaIdx ?? 0}`}
                      draggable={canEdit && t.estado !== "completado"}
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => setDragId(null)}
                      title={`${t.folio} · ${t.servicio} · ${t.planta_nombre}${(t.__duracion ?? 1) > 1 ? ` · día ${(t.__diaIdx ?? 0) + 1}/${t.__duracion}` : ""}`}
                      className={
                        "rounded px-1.5 py-1 text-[10px] border cursor-grab leading-tight " +
                        (estadoCls[t.estado] ?? "bg-secondary border-border") +
                        (dragId === t.id ? " opacity-50" : "")
                      }
                    >
                      <div className="font-medium truncate">{t.planta_nombre}</div>
                      <div className="opacity-70 truncate">
                        {(t.__duracion ?? 1) > 1
                          ? `d${(t.__diaIdx ?? 0) + 1}/${t.__duracion}`
                          : t.folio}
                      </div>
                    </div>
                  ))}
                  {items.length > 3 && (
                    <p className="text-[9px] text-muted-foreground px-1">+{items.length - 3} más</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ============== Vista Año ==============
function YearView({ year, byDay, onPickMonth }: {
  year: number; byDay: Map<string, any[]>; onPickMonth: (m: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 12 }, (_, m) => (
        <MiniMonth key={m} year={year} month={m} byDay={byDay} onClick={() => onPickMonth(m)} />
      ))}
    </div>
  );
}

function MiniMonth({ year, month, byDay, onClick }: {
  year: number; month: number; byDay: Map<string, any[]>; onClick: () => void;
}) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const firstMonday = startOfWeek(first);
  const rows: Date[][] = [];
  let cur = firstMonday;
  while (cur <= last || rows.length < 5) {
    rows.push(Array.from({ length: 5 }, (_, i) => addDays(cur, i)));
    cur = addDays(cur, 7);
    if (rows.length >= 6) break;
  }
  const today = new Date();
  return (
    <button onClick={onClick} className="text-left bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
      <p className="text-xs font-bold uppercase tracking-wider mb-2 capitalize">
        {first.toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", month: "long" })}
      </p>
      <div className="grid grid-cols-[24px_repeat(5,1fr)] gap-y-0.5 text-[9px] text-muted-foreground">
        <div />
        {["L", "M", "X", "J", "V"].map((d) => (
          <div key={d} className="text-center font-bold">{d}</div>
        ))}
        {rows.map((row, ri) => (
          <Fragment key={ri}>
            <div className="font-mono text-muted-foreground/70 text-right pr-1">S{isoWeek(row[0])}</div>
            {row.map((d) => {
              const inMonth = d.getMonth() === month;
              const items = byDay.get(d.toDateString()) ?? [];
              const isToday = sameDay(d, today);
              const has = items.length > 0;
              // Prioridad de sombreado: completado > en_progreso > programado
              const estado = has
                ? (items.find((i: any) => i.estado === "completado")?.estado
                  ?? items.find((i: any) => i.estado === "en_progreso")?.estado
                  ?? items.find((i: any) => i.estado === "programado")?.estado
                  ?? items[0].estado)
                : null;
              const shade =
                estado === "completado" ? "bg-accent/25"
                : estado === "en_progreso" ? "bg-primary/25"
                : estado === "programado" ? "bg-muted-foreground/15"
                : estado === "cancelado" ? "bg-destructive/15"
                : "";
              return (
                <div
                  key={d.toISOString()}
                  className={"aspect-square grid place-items-center relative rounded " + (inMonth ? shade : "")}
                  title={has ? `${items.length} trabajo(s) · ${estado}` : ""}
                >
                  <span className={
                    "text-[10px] " +
                    (isToday ? "size-5 rounded-full bg-primary text-primary-foreground font-bold grid place-items-center"
                      : inMonth ? "text-foreground" : "text-muted-foreground/40")
                  }>
                    {d.getDate()}
                  </span>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </button>
  );
}

// =============== Vista Cliente ===============

function startOfMonth(d: Date) { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; }
function fmtMonth(d: Date) { return d.toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", month: "long", year: "numeric" }); }
function toISODateLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ClienteCalendar() {
  const qc = useQueryClient();
  const fDisp = useServerFn(getDisponibilidad);
  const fPlantas = useServerFn(listPlantas);
  const fCrear = useServerFn(crearSolicitud);

  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const desde = useMemo(() => toISODateLocal(monthStart), [monthStart]);
  const hasta = useMemo(() => {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() + 1); d.setDate(0);
    return toISODateLocal(d);
  }, [monthStart]);

  const dispQ = useQuery({
    queryKey: ["disponibilidad", desde, hasta],
    queryFn: () => fDisp({ data: { desde, hasta } }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const plantasQ = useQuery({
    queryKey: ["mis-plantas"],
    queryFn: () => fPlantas(),
    staleTime: 5 * 60_000,
  });

  // Prefetch de mes anterior y siguiente para navegación instantánea
  useEffect(() => {
    const prevStart = new Date(monthStart); prevStart.setMonth(prevStart.getMonth() - 1);
    const prevEnd = new Date(prevStart); prevEnd.setMonth(prevEnd.getMonth() + 1); prevEnd.setDate(0);
    const nextStart = new Date(monthStart); nextStart.setMonth(nextStart.getMonth() + 1);
    const nextEnd = new Date(nextStart); nextEnd.setMonth(nextEnd.getMonth() + 1); nextEnd.setDate(0);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    qc.prefetchQuery({
      queryKey: ["disponibilidad", iso(prevStart), iso(prevEnd)],
      queryFn: () => fDisp({ data: { desde: iso(prevStart), hasta: iso(prevEnd) } }),
      staleTime: 60_000,
    });
    qc.prefetchQuery({
      queryKey: ["disponibilidad", iso(nextStart), iso(nextEnd)],
      queryFn: () => fDisp({ data: { desde: iso(nextStart), hasta: iso(nextEnd) } }),
      staleTime: 60_000,
    });
  }, [monthStart, qc, fDisp]);

  const [pickDate, setPickDate] = useState<string | null>(null);

  const crear = useMutation({
    mutationFn: (vars: any) => fCrear({ data: vars }),
    onSuccess: () => {
      toast.success("Solicitud enviada. Un supervisor la revisará.");
      qc.invalidateQueries({ queryKey: ["disponibilidad"] });
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      setPickDate(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Build grid (lunes-domingo)
  const cells = useMemo(() => {
    const out: { fecha: string | null; ocupada?: boolean; today?: boolean; asignaciones?: Array<{ planta_nombre: string; folio: string; servicio: string }> }[] = [];
    const first = new Date(monthStart);
    const leading = (first.getDay() + 6) % 7;
    // Solo días laborables (Lun-Vie); el leading se limita a 0..4
    const leadingWk = Math.min(leading, 4);
    for (let i = 0; i < leadingWk; i++) out.push({ fecha: null });
    const list = (dispQ.data as Array<{ fecha: string; ocupada: boolean; asignaciones?: Array<{ planta_nombre: string; folio: string; servicio: string }> }> | undefined) ?? [];
    const today = toISODateLocal(new Date());
    list.forEach((d) => {
      const dow = new Date(d.fecha + "T00:00").getDay();
      if (dow === 0 || dow === 6) return; // omitir sábado/domingo
      out.push({ fecha: d.fecha, ocupada: d.ocupada, today: d.fecha === today, asignaciones: d.asignaciones ?? [] });
    });
    while (out.length % 5 !== 0) out.push({ fecha: null });
    return out;
  }, [dispQ.data, monthStart]);

  const plantas = (plantasQ.data as any[] | undefined) ?? [];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
      <PageHeader
        title="Solicitar Visita"
        description="Los días en rojo muestran el nombre de la planta con visita asignada. Elija un día libre para solicitar una nueva visita técnica."
        actions={
          <div className="inline-flex items-center gap-2">
            <button onClick={() => { const d = new Date(monthStart); d.setMonth(d.getMonth() - 1); setMonthStart(startOfMonth(d)); }}
              className="h-9 px-2 grid place-items-center border border-border rounded-md hover:bg-secondary" aria-label="Mes anterior">
              <ChevronLeft className="size-3.5" />
            </button>
            <button onClick={() => setMonthStart(startOfMonth(new Date()))} className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary">
              <CalendarDays className="size-3.5" /> Hoy
            </button>
            <button onClick={() => { const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); setMonthStart(startOfMonth(d)); }}
              className="h-9 px-2 grid place-items-center border border-border rounded-md hover:bg-secondary" aria-label="Mes siguiente">
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        }
      />

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 text-center font-semibold capitalize bg-secondary border-b border-border">{fmtMonth(monthStart)}</div>
        <div className="grid grid-cols-5 text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/50 border-b border-border">
          {["Lun", "Mar", "Mié", "Jue", "Vie"].map((d) => (
            <div key={d} className="p-2 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-5">
          {cells.map((c, i) => {
            if (!c.fecha) return <div key={i} className="aspect-square border-t border-l border-border first:border-l-0 bg-muted/20" />;
            const isPast = c.fecha < toISODateLocal(new Date());
            const asigns = c.asignaciones ?? [];
            const tooltip = asigns.length
              ? asigns.map((a) => `• ${a.planta_nombre} — ${a.servicio}${a.folio ? ` (${a.folio})` : ""}`).join("\n")
              : c.ocupada ? "No disponible" : isPast ? "Fecha pasada" : "Solicitar visita este día";
            return (
              <button
                key={i}
                disabled={c.ocupada || isPast}
                onClick={() => setPickDate(c.fecha!)}
                className={
                  "min-h-[92px] border-t border-l border-border first:border-l-0 p-2 text-left text-sm relative transition-colors overflow-hidden " +
                  (c.ocupada
                    ? "bg-destructive/10 text-destructive cursor-not-allowed"
                    : isPast
                      ? "bg-muted/30 text-muted-foreground/60 cursor-not-allowed"
                      : "hover:bg-accent/10 cursor-pointer") +
                  (c.today ? " ring-1 ring-primary" : "")
                }
                title={tooltip}
              >
                <span className={"font-mono " + (c.today ? "text-primary font-bold" : "")}>{Number(c.fecha.slice(-2))}</span>
                {asigns.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {asigns.slice(0, 3).map((a, ix) => (
                      <div
                        key={ix}
                        className="text-[10px] leading-tight px-1 py-0.5 rounded bg-destructive/15 text-destructive font-medium truncate"
                      >
                        {a.planta_nombre}
                      </div>
                    ))}
                    {asigns.length > 3 && (
                      <div className="text-[9px] text-destructive/80">+{asigns.length - 3} más</div>
                    )}
                  </div>
                )}
                {!c.ocupada && !isPast && (
                  <span className="absolute bottom-1 right-1 text-[9px] uppercase tracking-widest text-accent">Libre</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-accent/40 border border-accent/30" /> Disponible</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-destructive/40 border border-destructive/30" /> Ocupado</span>
      </div>

      <RecordDialog
        open={!!pickDate}
        onOpenChange={(v) => !v && setPickDate(null)}
        title={`Solicitar visita para el ${pickDate ? new Date(pickDate + "T00:00").toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", weekday: "long", day: "2-digit", month: "long" }) : ""}`}
        description="La solicitud quedará pendiente hasta que un supervisor la confirme. Recibirás un correo con el resultado."
        submitLabel={crear.isPending ? "Enviando…" : <><CalendarPlus className="size-3.5 inline mr-1.5" /> Enviar solicitud</> as any}
        busy={crear.isPending}
        error={crear.error?.message}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const planta_id = f.get("planta_id") as string;
          const planta = plantas.find((p) => p.id === planta_id);
          if (!planta) { toast.error("Selecciona una planta"); return; }
          crear.mutate({
            cliente_id: planta.cliente_id,
            planta_id,
            tipo: f.get("tipo"),
            descripcion: f.get("descripcion"),
            fecha_preferida: pickDate,
            duracion_dias_estimada: 1,
          });
        }}
      >
        <Field label="Planta">
          <select name="planta_id" required className={inputCls} defaultValue="">
            <option value="" disabled>Selecciona…</option>
            {plantas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Field>
        <Field label="Tipo de visita">
          <select name="tipo" required className={inputCls} defaultValue="">
            <option value="" disabled>Selecciona…</option>
            {SERVICIOS_OT.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Descripción / motivo">
          <textarea name="descripcion" rows={3} className={inputCls} placeholder="Describa brevemente el motivo de la visita…" />
        </Field>
      </RecordDialog>
    </div>
  );
}