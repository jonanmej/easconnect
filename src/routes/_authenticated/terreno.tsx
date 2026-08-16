import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { listTrabajos, upsertTrabajo, listTecnicos } from "@/lib/operations.functions";
import { useAuth } from "@/lib/auth-context";
import { Camera, Images, Play, CheckCircle2, RefreshCw, WifiOff, Wifi, User as UserIcon, ClipboardList, X, Users, History } from "lucide-react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { enqueue, flushQueue, onQueueChange, pendingCount } from "@/lib/offline-queue";
import { ReportesDiariosSection } from "@/components/ReportesDiariosSection";

export const Route = createFileRoute("/_authenticated/terreno")({
  head: () => ({
    meta: [
      { title: "A.T. · EA Service Connect" },
      { name: "description", content: "Vista móvil para técnicos en terreno: iniciar, evidenciar y completar." },
    ],
  }),
  component: Terreno,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Error: {error.message}</div>
  ),
});

function Terreno() {
  const { user, roles } = useAuth();
  const isStaff = roles.includes("admin") || roles.includes("supervisor");
  const isSupervisor = roles.includes("supervisor");
  const soloMonitoreo = isStaff && !isSupervisor;
  const fList = useServerFn(listTrabajos);
  const fSave = useServerFn(upsertTrabajo);
  const fTecnicos = useServerFn(listTecnicos);
  const qc = useQueryClient();

  const trabajos = useQuery({ queryKey: ["terreno-trabajos"], queryFn: () => fList() });
  const tecnicos = useQuery({ queryKey: ["terreno-tecnicos"], queryFn: () => fTecnicos() });
  const tecMap = new Map<string, string>(
    (tecnicos.data ?? []).map((t: any) => [t.id, t.nombre]),
  );

  const mEstado = useMutation({
    mutationFn: (v: { id: string; estado: string; planta_id: string; servicio: string; fecha_programada: string; tecnico_id: string | null }) =>
      fSave({ data: v as any }),
    onSuccess: () => {
      toast.success("Estado actualizado");
      qc.invalidateQueries({ queryKey: ["terreno-trabajos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  // Permite volver a trabajos ya cerrados para subir un reporte diario que no
  // se pudo registrar el día correspondiente (reportes atrasados).
  const [verAtrasados, setVerAtrasados] = usePersistedState<boolean>("terreno.verAtrasados", false);
  const [queueCount, setQueueCount] = useState(0);
  useEffect(() => {
    setQueueCount(pendingCount());
    const off = onQueueChange(() => setQueueCount(pendingCount()));
    const onOn = async () => {
      setOnline(true);
      if (pendingCount() > 0) {
        toast.info("Subiendo evidencias pendientes…");
        const r = await flushQueue();
        if (r.subidas) toast.success(`${r.subidas} evidencia${r.subidas === 1 ? "" : "s"} sincronizada${r.subidas === 1 ? "" : "s"}`);
      }
    };
    const onOff = () => setOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    return () => {
      off();
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, []);

  const hace30dias = Date.now() - 30 * 86400000;
  const list = ((trabajos.data as any[] | undefined) ?? [])
    .filter((t) =>
      isStaff
        ? true
        : Array.isArray(t.tecnicos_ids)
          ? t.tecnicos_ids.includes(user?.id ?? "")
          : t.tecnico_id === user?.id,
    )
    .filter((t) => {
      if (t.estado === "cancelado") return false;
      if (t.estado !== "completado") return true;
      if (!verAtrasados) return false;
      // Solo cierres recientes: evita arrastrar el histórico completo.
      const ref = new Date(t.fecha_completado ?? t.fecha_programada).getTime();
      return isNaN(ref) ? true : ref >= hace30dias;
    })
    .sort((a, b) => {
      // En progreso primero, luego programados y al final los completados.
      const rank = (s: string) => (s === "en_progreso" ? 0 : s === "completado" ? 2 : 1);
      const rd = rank(a.estado) - rank(b.estado);
      if (rd !== 0) return rd;
      return String(a.fecha_programada).localeCompare(String(b.fecha_programada));
    })
    .slice(0, 50);

  async function sincronizar() {
    if (!pendingCount()) {
      toast.message("No hay evidencias pendientes.");
      return;
    }
    const r = await flushQueue();
    if (r.errores) toast.warning(`${r.subidas} subidas, ${r.errores} con error.`);
    else if (r.subidas) toast.success(`${r.subidas} evidencias sincronizadas.`);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      <PageHeader title="A.T." description="Asistencia técnica: trabajos programados con asignación de técnico." />

      {soloMonitoreo ? (
        <p className="text-xs text-muted-foreground border border-dashed border-border rounded-md px-3 py-2">
          Vista de monitoreo: admin y supervisores visualizan los trabajos y técnicos asignados, sin ejecutar acciones de campo.
        </p>
      ) : (
      <div className="flex items-center justify-between text-xs">
        <div className={"inline-flex items-center gap-1.5 px-2 py-1 rounded-full " + (online ? "bg-accent/15 text-accent" : "bg-destructive/15 text-destructive")}>
          {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
          {online ? "Conectado" : "Sin conexión"}
        </div>
        <div className="flex items-center gap-2">
        <button
          onClick={() => setVerAtrasados(!verAtrasados)}
          title="Muestra trabajos ya cerrados (últimos 30 días) para subir un reporte diario atrasado"
          className={
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border " +
            (verAtrasados
              ? "bg-primary text-primary-foreground border-primary"
              : "border-input bg-background hover:bg-secondary")
          }
        >
          <History className="size-3.5" />
          Reportes atrasados
        </button>
        <button
          onClick={sincronizar}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-secondary"
        >
          <RefreshCw className="size-3.5" />
          {queueCount > 0 ? `Sincronizar (${queueCount})` : "Sincronizar"}
        </button>
        </div>
      </div>
      )}

      {verAtrasados && !soloMonitoreo && (
        <p className="text-[11px] text-muted-foreground border border-dashed border-border rounded-md px-3 py-2">
          Se incluyen trabajos completados de los últimos 30 días. Puedes abrir su reporte diario y
          registrarlo con la fecha en que se ejecutó el trabajo, aunque la subas después.
        </p>
      )}

      <div className="space-y-3">
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground p-4 border border-dashed border-border rounded-md text-center">
            {isStaff ? "No hay trabajos asignados pendientes." : "No tienes trabajos pendientes asignados."}
          </p>
        )}
        {list.length > 0 && (
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
            {isStaff ? "Trabajos activos" : "Mis trabajos asignados"} · {list.length}
          </p>
        )}
        {list.map((t) => (
          <TrabajoCard
            key={t.id}
            trabajo={t}
            tecnicoNombre={t.tecnico_id ? (tecMap.get(t.tecnico_id) ?? "Técnico desconocido") : "Sin asignar"}
            equipo={(Array.isArray(t.tecnicos_ids) ? t.tecnicos_ids : t.tecnico_id ? [t.tecnico_id] : []).map(
              (id: string) => ({
                id,
                nombre: tecMap.get(id) ?? "Técnico",
                principal: id === t.tecnico_id,
                yo: id === (user?.id ?? ""),
              }),
            )}
            soloLectura={soloMonitoreo}
            onIniciar={() =>
              mEstado.mutate({ id: t.id, estado: "en_progreso", planta_id: t.planta_id, servicio: t.servicio, fecha_programada: t.fecha_programada, tecnico_id: t.tecnico_id ?? null })
            }
            onCompletar={() =>
              mEstado.mutate({ id: t.id, estado: "completado", planta_id: t.planta_id, servicio: t.servicio, fecha_programada: t.fecha_programada, tecnico_id: t.tecnico_id ?? null })
            }
            online={online}
          />
        ))}
      </div>
    </div>
  );
}

function TrabajoCard({
  trabajo,
  tecnicoNombre,
  equipo,
  soloLectura,
  onIniciar,
  onCompletar,
  online,
}: {
  trabajo: any;
  tecnicoNombre: string;
  equipo: Array<{ id: string; nombre: string; principal: boolean; yo: boolean }>;
  soloLectura: boolean;
  onIniciar: () => void;
  onCompletar: () => void;
  online: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [reporteOpen, setReporteOpen] = useState(false);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      enqueue({ trabajo_id: trabajo.id, descripcion: null, data_url: dataUrl });
      if (online) {
        flushQueue().then((r) => {
          if (r.subidas) toast.success("Evidencia subida");
          else toast.message("Evidencia en cola");
        });
      } else {
        toast.info("Evidencia guardada para subir cuando vuelvas a tener señal.");
      }
    };
    reader.readAsDataURL(file);
    e.currentTarget.value = "";
  }

  const inProgress = trabajo.estado === "en_progreso";
  const completado = trabajo.estado === "completado";

  return (
    <article className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-primary font-semibold">{trabajo.folio}</div>
          <div className="font-medium">{trabajo.servicio}</div>
          <div className="text-xs text-muted-foreground">{trabajo.planta_nombre} · {trabajo.cliente_nombre}</div>
        </div>
        <span className={"text-[10px] font-bold uppercase px-2 py-0.5 rounded " + (inProgress ? "bg-primary/15 text-primary" : completado ? "bg-accent/15 text-accent" : "bg-secondary text-foreground")}>
          {inProgress ? "En progreso" : completado ? "Completado" : "Programado"}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {new Date(trabajo.fecha_programada).toLocaleString("es-SV", { timeZone: "America/El_Salvador", dateStyle: "medium", timeStyle: "short" })}
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <UserIcon className="size-3.5 text-muted-foreground" />
        <span className={trabajo.tecnico_id ? "text-foreground" : "text-muted-foreground italic"}>
          {tecnicoNombre}
        </span>
      </div>

      {equipo.length > 0 && (
        <div className="rounded-md border border-border/70 bg-secondary/20 p-2 space-y-1">
          <p className="inline-flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground">
            <Users className="size-3" />
            Equipo asignado ({equipo.length})
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {equipo.map((m) => (
              <li
                key={m.id}
                className={
                  "text-[11px] px-2 py-0.5 rounded-full border " +
                  (m.yo
                    ? "border-primary/40 bg-primary/10 text-primary font-semibold"
                    : "border-border bg-background text-foreground")
                }
              >
                {m.nombre}
                {m.principal ? " · responsable" : ""}
                {m.yo ? " (tú)" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {soloLectura || completado ? null : (
      <div className="grid grid-cols-3 gap-2 pt-2">
        <button
          type="button"
          disabled={inProgress}
          onClick={onIniciar}
          className="h-12 inline-flex flex-col items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
        >
          <Play className="size-4 mb-0.5" />
          Iniciar
        </button>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="h-12 inline-flex flex-col items-center justify-center rounded-md border border-input bg-background text-[10px] font-semibold"
          >
            <Camera className="size-4 mb-0.5" />
            Cámara
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="h-12 inline-flex flex-col items-center justify-center rounded-md border border-input bg-background text-[10px] font-semibold"
          >
            <Images className="size-4 mb-0.5" />
            Galería
          </button>
        </div>
        <button
          type="button"
          onClick={onCompletar}
          className="h-12 inline-flex flex-col items-center justify-center rounded-md bg-accent text-accent-foreground text-xs font-semibold"
        >
          <CheckCircle2 className="size-4 mb-0.5" />
          Completar
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPickFile}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />
      </div>
      )}

      {!soloLectura && (inProgress || completado) && (
        <button
          type="button"
          onClick={() => setReporteOpen(true)}
          className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10"
        >
          <ClipboardList className="size-4" />
          {completado ? "Registrar reporte atrasado" : "Reporte diario del día"}
        </button>
      )}

      <Link
        to="/trabajos"
        className="block text-center text-[11px] text-muted-foreground hover:text-foreground"
      >
        Ver detalle completo →
      </Link>

      {reporteOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setReporteOpen(false)}
        >
          <div
            className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-background rounded-t-xl sm:rounded-xl border border-border shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-background">
              <div className="min-w-0">
                <p className="text-[11px] uppercase text-primary font-semibold">{trabajo.folio}</p>
                <p className="text-sm font-medium truncate">{trabajo.servicio}</p>
              </div>
              <button
                type="button"
                onClick={() => setReporteOpen(false)}
                className="size-8 grid place-items-center rounded-md hover:bg-secondary"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-4">
              <ReportesDiariosSection
                trabajoId={trabajo.id}
                hint={
                  completado
                    ? "Trabajo ya cerrado: puedes registrar un reporte atrasado indicando la fecha real en que se ejecutó la labor."
                    : "Este es el único punto de captura del reporte diario y sus fotos. Cada técnico puede registrar su avance por fase (diagnóstico, intervención y cierre) dentro del mismo trabajo."
                }
              />
            </div>
          </div>
        </div>
      )}
    </article>
  );
}