import { useState } from "react";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { SyncPanel } from "@/components/SyncPanel";
import { cn } from "@/lib/utils";

/**
 * Chip de estado de conexión + pendientes por sincronizar. Al tocarlo fuerza
 * la sincronización de reportes y fotos guardados sin red.
 */
export function OfflineIndicator({ className }: { className?: string }) {
  const { online, pendientes, sincronizando, sincronizar } = useOfflineSync();
  const alerta = !online || pendientes > 0;
  const [abierto, setAbierto] = useState(false);

  return (
    <>
    <button
      type="button"
      onClick={() => setAbierto(true)}
      aria-haspopup="dialog"
      aria-expanded={abierto}
      title={
        online
          ? pendientes > 0
            ? `${pendientes} registro(s) por sincronizar. Abre el panel de sincronización.`
            : "Conectado y sincronizado. Abre el panel de sincronización."
          : "Sin conexión: los cambios se guardan en el dispositivo y se envían al recuperar la red."
      }
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-full px-3 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        alerta ? "bg-destructive/15 hover:bg-destructive/25" : "bg-accent/15 hover:bg-accent/25",
        className,
      )}
    >
      {sincronizando ? (
        <RefreshCw className="size-3 animate-spin text-accent" aria-hidden />
      ) : online ? (
        <Wifi className={cn("size-3", alerta ? "text-destructive" : "text-accent")} aria-hidden />
      ) : (
        <CloudOff className="size-3 text-destructive" aria-hidden />
      )}
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-wide",
          alerta ? "text-destructive" : "text-accent",
        )}
      >
        {!online
          ? pendientes > 0
            ? `Sin red · ${pendientes}`
            : "Sin red"
          : pendientes > 0
            ? `Pendientes ${pendientes}`
            : "En línea"}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {online ? "Conectado" : "Sin conexión"}
        {pendientes > 0 ? `, ${pendientes} registros pendientes de sincronizar` : ", sin pendientes"}
      </span>
    </button>
    <SyncPanel
      open={abierto}
      onOpenChange={setAbierto}
      sincronizando={sincronizando}
      onSincronizarTodo={sincronizar}
    />
    </>
  );
}
