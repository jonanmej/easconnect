import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { listTrabajos, reprogramarTrabajo } from "@/lib/operations.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/programacion")({
  head: () => ({
    meta: [
      { title: "Programación · SOLAROS" },
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
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "short" });
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function Programacion() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canEdit = ["admin", "supervisor"].includes(highestRole(roles) ?? "");
  const fetchList = useServerFn(listTrabajos);
  const fetchMove = useServerFn(reprogramarTrabajo);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dragId, setDragId] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["trabajos"], queryFn: () => fetchList() });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, any[]>();
    days.forEach((d) => map.set(d.toDateString(), []));
    (list.data as any[] | undefined)?.forEach((t) => {
      const dt = new Date(t.fecha_programada);
      const key = dt.toDateString();
      if (map.has(key)) map.get(key)!.push(t);
    });
    return map;
  }, [list.data, days]);

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
    const original = (list.data as any[] | undefined)?.find((t) => t.id === dragId);
    if (!original) return;
    const prev = new Date(original.fecha_programada);
    if (sameDay(prev, targetDay)) { setDragId(null); return; }
    const nd = new Date(targetDay);
    nd.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
    move.mutate({ id: dragId, fecha_programada: nd.toISOString() });
    setDragId(null);
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Programación Semanal"
        description={canEdit ? "Arrastra un trabajo a otro día para reprogramarlo." : "Vista de calendario semanal."}
        actions={
          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="h-9 px-2 grid place-items-center border border-border rounded-md hover:bg-secondary"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary"
            >
              <CalendarDays className="size-3.5" /> Hoy
            </button>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="h-9 px-2 grid place-items-center border border-border rounded-md hover:bg-secondary"
              aria-label="Semana siguiente"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        }
      />

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-secondary text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {days.map((d) => (
            <div key={d.toISOString()} className={"p-3 text-center border-l border-border first:border-l-0 " + (sameDay(d, new Date()) ? "text-primary" : "")}>
              {fmtDayLabel(d)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 min-h-[420px]">
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
                        {new Date(t.fecha_programada).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} · {t.folio}
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

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{totalSemana} trabajos esta semana</span>
        <div className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary/40 border border-primary/30" /> En progreso</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-accent/40 border border-accent/30" /> Completado</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-secondary border border-border" /> Programado</span>
        </div>
      </div>
    </div>
  );
}