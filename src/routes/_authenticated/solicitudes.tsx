import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import { CheckCircle2, XCircle, ClipboardList, ArrowRight } from "lucide-react";
import { listSolicitudes, aprobarSolicitud, rechazarSolicitud, cancelarSolicitud } from "@/lib/solicitudes.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/solicitudes")({
  head: () => ({ meta: [{ title: "Solicitudes de Visita · EA Service Connect" }] }),
  component: Solicitudes,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

const estadoLabel: Record<string, { c: string; t: string }> = {
  pendiente: { c: "bg-primary/10 text-primary", t: "Pendiente" },
  convertida: { c: "bg-accent/10 text-accent", t: "Aprobada" },
  rechazada: { c: "bg-destructive/10 text-destructive", t: "Rechazada" },
  aprobada: { c: "bg-accent/10 text-accent", t: "Aprobada" },
};

function Solicitudes() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const role = highestRole(roles);
  const isStaff = role === "admin" || role === "supervisor";
  const fList = useServerFn(listSolicitudes);
  const fAprobar = useServerFn(aprobarSolicitud);
  const fRechazar = useServerFn(rechazarSolicitud);
  const fCancelar = useServerFn(cancelarSolicitud);

  const list = useQuery({ queryKey: ["solicitudes"], queryFn: () => fList() });
  const [filtroEstado, setFiltroEstado] = useState<string>("todas");
  const items = useMemo(() => {
    const all = (list.data as any[] | undefined) ?? [];
    return filtroEstado === "todas" ? all : all.filter((s) => s.estado === filtroEstado);
  }, [list.data, filtroEstado]);

  const [aprobando, setAprobando] = useState<any | null>(null);
  const [rechazando, setRechazando] = useState<any | null>(null);

  const aprobar = useMutation({
    mutationFn: (vars: any) => fAprobar({ data: vars }),
    onSuccess: () => { toast.success("Solicitud aprobada y trabajo creado"); qc.invalidateQueries({ queryKey: ["solicitudes"] }); qc.invalidateQueries({ queryKey: ["trabajos"] }); setAprobando(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rechazar = useMutation({
    mutationFn: (vars: any) => fRechazar({ data: vars }),
    onSuccess: () => { toast.success("Solicitud rechazada"); qc.invalidateQueries({ queryKey: ["solicitudes"] }); setRechazando(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelar = useMutation({
    mutationFn: (id: string) => fCancelar({ data: { id } }),
    onSuccess: () => { toast.success("Solicitud cancelada"); qc.invalidateQueries({ queryKey: ["solicitudes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title={isStaff ? "Solicitudes de Visita" : "Mis Solicitudes"}
        description={isStaff ? "Apruebe o rechace las visitas que los clientes han pedido desde su calendario." : "Estado de las visitas que ha solicitado para sus plantas."}
        actions={
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={inputCls + " w-full sm:w-44"}>
            <option value="todas">Todas</option>
            <option value="pendiente">Pendientes</option>
            <option value="convertida">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
          </select>
        }
      />

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {list.isLoading && <p className="p-6 text-sm text-muted-foreground">Cargando…</p>}
        {!list.isLoading && items.length === 0 && (
          <p className="p-8 text-sm text-muted-foreground text-center">No hay solicitudes.</p>
        )}
        {items.map((s: any) => (
          <div key={s.id} className="p-4 flex flex-wrap gap-4 items-start">
            <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <ClipboardList className="size-4" />
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-sm">{s.tipo} · {s.planta_nombre}</h3>
                <span className={"text-[10px] font-bold uppercase px-2 py-0.5 rounded " + (estadoLabel[s.estado]?.c ?? "")}>
                  {estadoLabel[s.estado]?.t ?? s.estado}
                </span>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {s.cliente_nombre} · Fecha solicitada: {new Date(s.fecha_preferida + "T00:00").toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", day: "2-digit", month: "long" })} · Duración: {s.duracion_dias_estimada}d
              </p>
              {s.descripcion && <p className="text-sm mt-2 text-foreground/80">{s.descripcion}</p>}
              {s.respuesta_supervisor && (
                <p className="text-xs mt-2 text-muted-foreground italic border-l-2 border-border pl-3">{s.respuesta_supervisor}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isStaff && s.estado === "pendiente" && (
                <>
                  <button onClick={() => setAprobando(s)} className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium bg-accent text-accent-foreground rounded-md hover:bg-accent/90">
                    <CheckCircle2 className="size-3.5" /> Aprobar
                  </button>
                  <button onClick={() => setRechazando(s)} className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary">
                    <XCircle className="size-3.5" /> Rechazar
                  </button>
                </>
              )}
              {!isStaff && s.estado === "pendiente" && (
                <button onClick={() => { if (confirm("¿Cancelar esta solicitud?")) cancelar.mutate(s.id); }}
                  className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary">
                  <XCircle className="size-3.5" /> Cancelar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <RecordDialog
        open={!!aprobando}
        onOpenChange={(v) => !v && setAprobando(null)}
        title={`Aprobar: ${aprobando?.tipo ?? ""}`}
        description="Se creará un trabajo programado en la fecha que confirme y la solicitud pasará a 'aprobada'."
        submitLabel={aprobar.isPending ? "Creando…" : "Aprobar y crear trabajo"}
        busy={aprobar.isPending}
        error={aprobar.error?.message}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const fechaLocal = String(f.get("fecha_programada") ?? "");
          const fechaIso = fechaLocal ? new Date(fechaLocal).toISOString() : "";
          aprobar.mutate({
            id: aprobando!.id,
            fecha_programada: fechaIso,
            duracion_dias: f.get("duracion_dias"),
            servicio: f.get("servicio"),
            respuesta: f.get("respuesta") || "Solicitud aprobada",
          });
        }}
      >
        <Field label="Servicio (texto que verá el técnico)">
          <input name="servicio" required defaultValue={aprobando?.tipo} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha y hora">
            <input name="fecha_programada" type="datetime-local" required
              defaultValue={aprobando ? (aprobando.fecha_preferida + "T09:00") : ""}
              className={inputCls} />
          </Field>
          <Field label="Duración (días)">
            <input name="duracion_dias" type="number" min={1} max={30} required
              defaultValue={aprobando?.duracion_dias_estimada ?? 1} className={inputCls} />
          </Field>
        </div>
        <Field label="Mensaje al cliente (opcional)">
          <textarea name="respuesta" rows={3} className={inputCls} placeholder="Confirmamos la visita para…" />
        </Field>
      </RecordDialog>

      <RecordDialog
        open={!!rechazando}
        onOpenChange={(v) => !v && setRechazando(null)}
        title="Rechazar solicitud"
        submitLabel={rechazar.isPending ? "Enviando…" : "Rechazar"}
        busy={rechazar.isPending}
        error={rechazar.error?.message}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          rechazar.mutate({ id: rechazando!.id, respuesta: f.get("respuesta") });
        }}
      >
        <Field label="Motivo del rechazo (visible para el cliente)">
          <textarea name="respuesta" required rows={3} className={inputCls} />
        </Field>
      </RecordDialog>
    </div>
  );
}