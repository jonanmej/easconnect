import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Camera, Check, FileText, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  listPendingWrites,
  onOfflineChange,
  isOnline,
  removePendingWrite,
  retryPendingWrite,
  type PendingWrite,
} from "@/lib/offline-sync";
import {
  onQueueChange,
  pending as pendingFotos,
  removePending,
  retryPending,
  type EvidenciaPendiente,
} from "@/lib/offline-queue";

type Fila = {
  id: string;
  tipo: "reporte" | "foto";
  titulo: string;
  detalle: string;
  intentos: number;
  error?: string | null;
  creado: number;
};

function formatoHora(ts: number) {
  return new Date(ts).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function aFilas(writes: PendingWrite[], fotos: EvidenciaPendiente[]): Fila[] {
  const a: Fila[] = writes.map((w) => ({
    id: w.id,
    tipo: "reporte",
    titulo: w.label || "Reporte diario",
    detalle: `Guardado ${formatoHora(w.created_at)}`,
    intentos: w.intentos,
    error: w.ultimo_error,
    creado: w.created_at,
  }));
  const b: Fila[] = fotos.map((f) => ({
    id: f.id,
    tipo: "foto",
    titulo: f.descripcion?.trim() || `Fotografía (${f.categoria ?? "durante"})`,
    detalle: `Capturada ${formatoHora(f.created_at)}`,
    intentos: f.intentos ?? 0,
    error: f.ultimo_error,
    creado: f.created_at,
  }));
  return [...a, ...b].sort((x, y) => x.creado - y.creado);
}

/**
 * Panel de sincronización: muestra cada reporte o fotografía guardado sin
 * conexión, su progreso, el último error y permite reintentar o descartar
 * de forma individual cuando vuelve la red.
 */
export function SyncPanel({
  open,
  onOpenChange,
  sincronizando,
  onSincronizarTodo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sincronizando?: boolean;
  onSincronizarTodo?: () => void | Promise<void>;
}) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [online, setOnline] = useState(true);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const refresh = useCallback(() => {
    setFilas(aFilas(listPendingWrites(), pendingFotos()));
    setOnline(isOnline());
  }, []);

  useEffect(() => {
    refresh();
    const off = onOfflineChange(refresh);
    const offQ = onQueueChange(refresh);
    return () => {
      off();
      offQ?.();
    };
  }, [refresh]);

  const reintentar = async (fila: Fila) => {
    setEnCurso(fila.id);
    setAviso(`Reintentando ${fila.titulo}…`);
    const ok =
      fila.tipo === "reporte" ? await retryPendingWrite(fila.id) : await retryPending(fila.id);
    setEnCurso(null);
    setAviso(ok ? `${fila.titulo} sincronizado.` : `No se pudo sincronizar ${fila.titulo}.`);
    refresh();
  };

  const descartar = (fila: Fila) => {
    if (fila.tipo === "reporte") removePendingWrite(fila.id);
    else removePending(fila.id);
    setAviso(`${fila.titulo} descartado.`);
    refresh();
  };

  const conError = filas.filter((f) => f.error).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col safe-top safe-bottom">
        <SheetHeader className="text-left">
          <SheetTitle>Sincronización offline</SheetTitle>
          <SheetDescription>
            {filas.length === 0
              ? "Todo está sincronizado con el servidor."
              : `${filas.length} registro(s) pendiente(s)${conError ? ` · ${conError} con error` : ""}.`}
          </SheetDescription>
        </SheetHeader>

        <p aria-live="polite" role="status" className="sr-only">
          {aviso}
        </p>

        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void onSincronizarTodo?.()}
            disabled={!online || sincronizando || filas.length === 0}
          >
            <RefreshCw className={sincronizando ? "size-4 animate-spin" : "size-4"} aria-hidden />
            Sincronizar todo
          </Button>
          {!online ? (
            <span className="text-xs text-muted-foreground">
              Sin conexión: se enviará automáticamente al recuperar la red.
            </span>
          ) : null}
        </div>

        <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {filas.length === 0 ? (
            <li className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              <Check className="size-4 text-accent" aria-hidden />
              No hay nada esperando envío.
            </li>
          ) : (
            filas.map((f) => (
              <li
                key={f.id}
                className="rounded-lg border border-border bg-card p-3 text-sm focus-within:ring-2 focus-within:ring-ring"
              >
                <div className="flex items-start gap-2">
                  {f.tipo === "reporte" ? (
                    <FileText className="mt-0.5 size-4 text-primary" aria-hidden />
                  ) : (
                    <Camera className="mt-0.5 size-4 text-primary" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{f.titulo}</p>
                    <p className="text-xs text-muted-foreground">{f.detalle}</p>
                    <p className="mt-1 text-xs">
                      {enCurso === f.id ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <RefreshCw className="size-3 animate-spin" aria-hidden /> Enviando…
                        </span>
                      ) : f.error ? (
                        <span className="inline-flex items-start gap-1 text-destructive">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                          <span className="break-words">
                            {f.intentos} intento(s) · {f.error}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">En espera de red</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-9"
                    onClick={() => void reintentar(f)}
                    disabled={!online || enCurso === f.id}
                  >
                    <RefreshCw className="size-4" aria-hidden />
                    Reintentar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-9 text-destructive hover:text-destructive"
                    onClick={() => descartar(f)}
                    aria-label={`Descartar ${f.titulo}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Descartar
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      </SheetContent>
    </Sheet>
  );
}