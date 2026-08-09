import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  flushPendingWrites,
  isOnline,
  onOfflineChange,
  pendingWritesCount,
} from "@/lib/offline-sync";
import { flushQueue, onQueueChange, pendingCount } from "@/lib/offline-queue";

/**
 * Estado de conexión + sincronización automática de lo guardado sin red
 * (reportes diarios y fotos). Se monta una sola vez en el AppShell.
 */
export function useOfflineSync() {
  const qc = useQueryClient();
  const [online, setOnline] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);

  const refresh = useCallback(() => {
    setOnline(isOnline());
    setPendientes(pendingWritesCount() + pendingCount());
  }, []);

  const sincronizar = useCallback(async () => {
    if (!isOnline()) return;
    setSincronizando(true);
    try {
      const escrituras = await flushPendingWrites();
      const fotos = await flushQueue().catch(() => 0);
      if (escrituras || fotos) {
        toast.success(
          `Sincronización completa: ${escrituras} reporte${escrituras === 1 ? "" : "s"} y ${fotos} foto${fotos === 1 ? "" : "s"} enviados.`,
        );
        await qc.invalidateQueries();
      }
    } finally {
      setSincronizando(false);
      refresh();
    }
  }, [qc, refresh]);

  useEffect(() => {
    refresh();
    const off = onOfflineChange(refresh);
    const offQ = onQueueChange(refresh);
    const onOnline = () => {
      void sincronizar();
    };
    window.addEventListener("online", onOnline);
    // Al montar, intenta vaciar lo que quedó de una sesión anterior.
    void sincronizar();
    return () => {
      off();
      offQ?.();
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, sincronizar]);

  return { online, pendientes, sincronizando, sincronizar };
}
