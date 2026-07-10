import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Coffee, StopCircle, Timer, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  getJornadaHoy,
  iniciarJornada,
  iniciarAlmuerzo,
  finalizarAlmuerzo,
  finalizarJornada,
  calcularResumen,
} from "@/lib/jornadas.functions";

const LIMITE_ALMUERZO_MIN = 60;

function fmtHora(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-SV", {
    timeZone: "America/El_Salvador",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min < 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function JornadaControl() {
  const qc = useQueryClient();
  const fGet = useServerFn(getJornadaHoy);
  const fIni = useServerFn(iniciarJornada);
  const fAlmIni = useServerFn(iniciarAlmuerzo);
  const fAlmFin = useServerFn(finalizarAlmuerzo);
  const fFin = useServerFn(finalizarJornada);

  const { data: jornada, isLoading } = useQuery({
    queryKey: ["jornada-hoy"],
    queryFn: () => fGet(),
    refetchOnWindowFocus: true,
  });

  // Tick cada 30s para actualizar los timers en vivo
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["jornada-hoy"] });

  const iniM = useMutation({ mutationFn: () => fIni(), onSuccess: () => { invalidate(); toast.success("Jornada iniciada"); }, onError: (e: Error) => toast.error(e.message) });
  const almIniM = useMutation({ mutationFn: () => fAlmIni(), onSuccess: () => { invalidate(); toast.success("Almuerzo iniciado"); }, onError: (e: Error) => toast.error(e.message) });
  const almFinM = useMutation({ mutationFn: () => fAlmFin(), onSuccess: () => { invalidate(); toast.success("Regreso registrado"); }, onError: (e: Error) => toast.error(e.message) });
  const [notas, setNotas] = useState("");
  const [confirmFin, setConfirmFin] = useState(false);
  const finM = useMutation({
    mutationFn: () => fFin({ data: { notas: notas.trim() || undefined } }),
    onSuccess: () => { invalidate(); toast.success("Jornada finalizada"); setNotas(""); setConfirmFin(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        Cargando jornada…
      </div>
    );
  }

  const j: any = jornada ?? null;
  const cerrada = !!j?.hora_fin;
  const enAlmuerzo = !!(j?.almuerzo_inicio && !j?.almuerzo_fin);

  // === Estado 0: sin jornada ===
  if (!j) {
    return (
      <Panel tone="idle">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-full bg-primary/10 grid place-items-center">
            <Timer className="size-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Sin jornada iniciada</p>
            <p className="text-[11px] text-muted-foreground">Marca tu inicio para comenzar a contar horas.</p>
          </div>
          <button
            onClick={() => iniM.mutate()}
            disabled={iniM.isPending}
            className="h-9 px-4 inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            <Play className="size-4" /> Iniciar jornada
          </button>
        </div>
      </Panel>
    );
  }

  // === Estado final: jornada cerrada ===
  if (cerrada) {
    const r = calcularResumen(j);
    return (
      <Panel tone="done">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-full bg-accent/15 grid place-items-center">
            <CheckCircle2 className="size-4 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Jornada finalizada</p>
            <p className="text-[11px] text-muted-foreground">
              {fmtHora(j.hora_inicio)} – {fmtHora(j.hora_fin)} · almuerzo {fmtDur(r.almMin)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-muted-foreground">Efectivas</p>
            <p className="text-lg font-mono font-semibold">{fmtDur(r.efectivosMin)}</p>
          </div>
        </div>
        {j.almuerzo_excedido && (
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-destructive">
            <AlertTriangle className="size-3" /> Almuerzo excedió el límite de {LIMITE_ALMUERZO_MIN} min.
          </p>
        )}
      </Panel>
    );
  }

  // === Estado 1: en jornada (con o sin almuerzo) ===
  const now = Date.now();
  const totalMin = Math.max(0, Math.round((now - new Date(j.hora_inicio).getTime()) / 60000));
  const almMinActual = enAlmuerzo
    ? Math.max(0, Math.round((now - new Date(j.almuerzo_inicio).getTime()) / 60000))
    : (j.almuerzo_inicio && j.almuerzo_fin
        ? Math.round((new Date(j.almuerzo_fin).getTime() - new Date(j.almuerzo_inicio).getTime()) / 60000)
        : 0);
  const efectivosMin = Math.max(0, totalMin - almMinActual);

  const almExc = almMinActual > LIMITE_ALMUERZO_MIN;
  const almAviso = almMinActual > LIMITE_ALMUERZO_MIN - 5;

  return (
    <Panel tone={enAlmuerzo ? (almExc ? "danger" : almAviso ? "warn" : "lunch") : "active"}>
      <div className="flex items-start gap-3">
        <div className={`size-9 rounded-full grid place-items-center ${enAlmuerzo ? "bg-amber-500/15" : "bg-primary/10"}`}>
          {enAlmuerzo ? <Coffee className="size-4 text-amber-600" /> : <Timer className="size-4 text-primary" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {enAlmuerzo ? "En almuerzo" : "En jornada"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Inicio {fmtHora(j.hora_inicio)}
            {j.almuerzo_inicio && !enAlmuerzo && ` · almuerzo ${fmtHora(j.almuerzo_inicio)}–${fmtHora(j.almuerzo_fin)} (${fmtDur(almMinActual)})`}
            {enAlmuerzo && ` · desde ${fmtHora(j.almuerzo_inicio)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase text-muted-foreground">
            {enAlmuerzo ? "Almuerzo" : "Efectivas"}
          </p>
          <p className={`text-lg font-mono font-semibold ${almExc ? "text-destructive" : almAviso ? "text-amber-600" : ""}`}>
            {fmtDur(enAlmuerzo ? almMinActual : efectivosMin)}
          </p>
        </div>
      </div>

      {enAlmuerzo && (
        <p className={`mt-2 inline-flex items-center gap-1 text-[11px] ${almExc ? "text-destructive font-semibold" : almAviso ? "text-amber-600" : "text-muted-foreground"}`}>
          <AlertTriangle className="size-3" />
          {almExc
            ? `Excediste el límite de ${LIMITE_ALMUERZO_MIN} min. Se notificará a administración.`
            : almAviso
              ? `Quedan pocos minutos del almuerzo (límite ${LIMITE_ALMUERZO_MIN} min).`
              : `Límite ${LIMITE_ALMUERZO_MIN} min.`}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!enAlmuerzo && !j.almuerzo_inicio && (
          <button
            onClick={() => almIniM.mutate()}
            disabled={almIniM.isPending}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-input text-xs font-medium hover:bg-secondary disabled:opacity-50"
          >
            <Coffee className="size-3.5" /> Iniciar almuerzo
          </button>
        )}
        {enAlmuerzo && (
          <button
            onClick={() => almFinM.mutate()}
            disabled={almFinM.isPending}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-amber-500 text-white text-xs font-medium disabled:opacity-50"
          >
            <Play className="size-3.5" /> Regresar de almuerzo
          </button>
        )}
        {!confirmFin ? (
          <button
            onClick={() => setConfirmFin(true)}
            disabled={enAlmuerzo}
            className="ml-auto h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-destructive/40 text-destructive text-xs font-medium hover:bg-destructive/10 disabled:opacity-50"
            title={enAlmuerzo ? "Cierra el almuerzo primero" : ""}
          >
            <StopCircle className="size-3.5" /> Finalizar jornada
          </button>
        ) : (
          <div className="w-full mt-1 space-y-2">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.currentTarget.value)}
              placeholder="Notas de cierre (opcional)"
              rows={2}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setConfirmFin(false); setNotas(""); }}
                className="h-8 px-3 rounded-md border border-input text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={() => finM.mutate()}
                disabled={finM.isPending}
                className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-destructive text-destructive-foreground text-xs font-medium disabled:opacity-50"
              >
                <StopCircle className="size-3.5" />
                {finM.isPending ? "Cerrando…" : "Confirmar cierre"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Panel({ tone, children }: { tone: "idle" | "active" | "lunch" | "warn" | "danger" | "done"; children: React.ReactNode }) {
  const toneCls: Record<typeof tone, string> = {
    idle: "border-border bg-card",
    active: "border-primary/30 bg-primary/5",
    lunch: "border-amber-500/30 bg-amber-500/5",
    warn: "border-amber-500/50 bg-amber-500/10",
    danger: "border-destructive/40 bg-destructive/5",
    done: "border-accent/30 bg-accent/5",
  };
  return <div className={`rounded-lg border p-3 ${toneCls[tone]}`}>{children}</div>;
}