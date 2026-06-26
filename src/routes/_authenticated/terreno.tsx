import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { listTrabajos, upsertTrabajo, listTecnicos } from "@/lib/operations.functions";
import { useAuth } from "@/lib/auth-context";
import { Camera, Play, CheckCircle2, RefreshCw, WifiOff, Wifi, User as UserIcon } from "lucide-react";
import { enqueue, flushQueue, onQueueChange, pendingCount } from "@/lib/offline-queue";

export const Route = createFileRoute("/_authenticated/terreno")({
  head: () => ({
    meta: [
      { title: "Terreno · EA Service Connect" },
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

  const list = ((trabajos.data as any[] | undefined) ?? [])
    .filter((t) => (isStaff ? true : t.tecnico_id === user?.id))
    .filter((t) => t.estado !== "completado" && t.estado !== "cancelado")
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
      <PageHeader title="Terreno" description="Trabajos programados y con asignación de técnico." />

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
        <button
          onClick={sincronizar}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-secondary"
        >
          <RefreshCw className="size-3.5" />
          {queueCount > 0 ? `Sincronizar (${queueCount})` : "Sincronizar"}
        </button>
      </div>
      )}

      <div className="space-y-3">
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground p-4 border border-dashed border-border rounded-md text-center">
            {isStaff ? "No hay trabajos asignados pendientes." : "No tienes trabajos pendientes asignados."}
          </p>
        )}
        {list.map((t) => (
          <TrabajoCard
            key={t.id}
            trabajo={t}
            tecnicoNombre={t.tecnico_id ? (tecMap.get(t.tecnico_id) ?? "Técnico desconocido") : "Sin asignar"}
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
  soloLectura,
  onIniciar,
  onCompletar,
  online,
}: {
  trabajo: any;
  tecnicoNombre: string;
  soloLectura: boolean;
  onIniciar: () => void;
  onCompletar: () => void;
  online: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

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

  return (
    <article className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-primary font-semibold">{trabajo.folio}</div>
          <div className="font-medium">{trabajo.servicio}</div>
          <div className="text-xs text-muted-foreground">{trabajo.planta_nombre} · {trabajo.cliente_nombre}</div>
        </div>
        <span className={"text-[10px] font-bold uppercase px-2 py-0.5 rounded " + (inProgress ? "bg-primary/15 text-primary" : "bg-secondary text-foreground")}>
          {inProgress ? "En progreso" : "Programado"}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {new Date(trabajo.fecha_programada).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <UserIcon className="size-3.5 text-muted-foreground" />
        <span className={trabajo.tecnico_id ? "text-foreground" : "text-muted-foreground italic"}>
          {tecnicoNombre}
        </span>
      </div>

      {soloLectura ? null : (
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
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="h-12 inline-flex flex-col items-center justify-center rounded-md border border-input bg-background text-xs font-semibold"
        >
          <Camera className="size-4 mb-0.5" />
          Evidencia
        </button>
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
      </div>
      )}

      <Link
        to="/trabajos"
        className="block text-center text-[11px] text-muted-foreground hover:text-foreground"
      >
        Ver detalle completo →
      </Link>
    </article>
  );
}