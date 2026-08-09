import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cn } from "@/lib/utils";

/**
 * Chip de estado de conexión + pendientes por sincronizar. Al tocarlo fuerza
 * la sincronización de reportes y fotos guardados sin red.
 */
export function OfflineIndicator({ className }: { className?: string }) {
  const { online, pendientes, sincronizando, sincronizar } = useOfflineSync();
  const alerta = !online || pendientes > 0;

  return (
    <button
      type="button"
      onClick={() => void sincronizar()}
      disabled={sincronizando || !online}
      title={
        online
          ? pendientes > 0
            ? `${pendientes} registro(s) por sincronizar. Toca para enviarlos ahora.`
            : "Conectado y sincronizado"
          : "Sin conexión: los cambios se guardan en el dispositivo y se envían al recuperar la red."
      }
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1 transition-colors",
        alerta ? "bg-destructive/15 hover:bg-destructive/25" : "bg-accent/15 hover:bg-accent/25",
        className,
      )}
    >
      {sincronizando ? (
        <RefreshCw className="size-3 animate-spin text-accent" />
      ) : online ? (
        <Wifi className={cn("size-3", alerta ? "text-destructive" : "text-accent")} />
      ) : (
        <CloudOff className="size-3 text-destructive" />
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
    </button>
  );
}
