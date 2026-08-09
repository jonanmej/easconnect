import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Download, Loader2, RefreshCw, RotateCcw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_VERSION, cambiosDesde, type CambioVersion } from "@/lib/app-version";
import {
  buscarActualizacion,
  instalarActualizacion,
  limpiarError,
  onUpdateEstado,
  reiniciarApp,
  type UpdateSnapshot,
} from "@/lib/app-update";
import { safeStorage } from "@/lib/safe-storage";

const VERSION_KEY = "easc-app-version";

/**
 * Ciclo de actualización visible para el usuario:
 *  1) busca publicaciones nuevas al entrar, al volver a la pestaña y al iniciar sesión,
 *  2) la descarga ocurre en segundo plano y sólo al terminar se ofrece reiniciar,
 *  3) informa de inmediato el resultado (éxito o error) con un aviso,
 *  4) tras instalar muestra los "Cambios instalados" en modo ejecutivo.
 */
export function AppUpdateGate() {
  const [snap, setSnap] = useState<UpdateSnapshot>({
    estado: "idle",
    error: null,
    soporteSW: true,
    puedeInstalar: false,
  });
  const [oculto, setOculto] = useState(false);
  const [instalando, setInstalando] = useState(false);
  const [novedades, setNovedades] = useState<CambioVersion[] | null>(null);
  const [verDetalle, setVerDetalle] = useState(false);

  useEffect(
    () =>
      onUpdateEstado((s) => {
        setSnap(s);
        if (s.estado === "listo") setOculto(false);
      }),
    [],
  );

  // Búsqueda de actualizaciones: ingreso, cambio de pestaña, reconexión, sesión e intervalo.
  useEffect(() => {
    void buscarActualizacion();

    const alVolver = () => {
      if (document.visibilityState === "visible") void buscarActualizacion();
    };
    const alReconectar = () => void buscarActualizacion();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alReconectar);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void buscarActualizacion();
    });

    const intervalo = window.setInterval(() => void buscarActualizacion(), 30 * 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alReconectar);
      window.clearInterval(intervalo);
      sub.subscription.unsubscribe();
    };
  }, []);

  // Aviso inmediato cuando la nueva versión terminó de descargarse.
  useEffect(() => {
    if (snap.estado !== "listo") return;
    toast.success("Actualización descargada", {
      description: "Reinicia la app para aplicar los últimos cambios.",
      duration: 8000,
    });
  }, [snap.estado]);

  // Aviso inmediato de error.
  useEffect(() => {
    if (snap.estado !== "error" || !snap.error) return;
    toast.error("No se pudo actualizar", { description: snap.error, duration: 8000 });
  }, [snap.estado, snap.error]);

  // Detalle de los cambios ya instalados (una sola vez por versión).
  useEffect(() => {
    const previa = safeStorage.getItem(VERSION_KEY);
    if (previa === APP_VERSION) return;
    safeStorage.setItem(VERSION_KEY, APP_VERSION);
    if (!previa) return; // primera instalación: no mostramos changelog
    const lista = cambiosDesde(previa);
    if (lista.length) setNovedades(lista);
  }, []);

  const instalar = useCallback(async () => {
    setInstalando(true);
    const r = await instalarActualizacion();
    if (!r.ok) {
      setInstalando(false);
      toast.error("No se pudo aplicar la actualización", {
        description: r.error ?? "Intenta de nuevo en unos segundos.",
      });
    }
  }, []);

  const mostrarBanner = !oculto && (snap.estado === "listo" || snap.estado === "error");
  const esError = snap.estado === "error";

  return (
    <>
      {mostrarBanner && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed inset-x-3 z-[70] rounded-xl border border-border bg-card p-3 shadow-lg sm:left-auto sm:right-4 sm:w-80"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}
        >
          <div className="flex items-start gap-3">
            <span
              className={
                esError
                  ? "mt-0.5 rounded-lg bg-destructive/10 p-2 text-destructive"
                  : "mt-0.5 rounded-lg bg-primary/10 p-2 text-primary"
              }
            >
              {esError ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {esError ? "La actualización falló" : "Nueva versión lista"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {esError
                  ? snap.error ?? "Vuelve a intentarlo cuando tengas mejor señal."
                  : snap.soporteSW
                    ? "La actualización ya se descargó. Reinicia la app para aplicarla."
                    : "Hay una versión nueva publicada. Pulsa instalar; si la app no cambia, ciérrala por completo y vuelve a abrirla desde el ícono."}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" disabled={instalando} onClick={() => void instalar()}>
                  {instalando ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Aplicando…
                    </>
                  ) : esError ? (
                    <>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reintentar
                    </>
                  ) : (
                    "Instalar actualización"
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void reiniciarApp()}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reiniciar app
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (esError) limpiarError();
                    setOculto(true);
                  }}
                >
                  Más tarde
                </Button>
              </div>
            </div>
            <button
              type="button"
              aria-label="Buscar actualizaciones"
              title="Buscar actualizaciones"
              disabled={snap.estado === "buscando" || snap.estado === "descargando"}
              onClick={() => {
                setOculto(false);
                void buscarActualizacion({ forzar: true });
              }}
              className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {snap.estado === "buscando" || snap.estado === "descargando" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={!!novedades}
        onOpenChange={(o) => {
          if (!o) {
            setNovedades(null);
            setVerDetalle(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Cambios instalados — v{APP_VERSION}
            </DialogTitle>
            <DialogDescription>Lo esencial de esta actualización, en segundos.</DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            <ul className="space-y-2">
              {novedades?.map((c) => (
                <li key={c.version} className="flex gap-2 text-sm">
                  <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-foreground">
                    <span className="font-semibold">{c.titulo}:</span>{" "}
                    <span className="text-muted-foreground">{c.resumen}</span>
                  </span>
                </li>
              ))}
            </ul>

            <Button
              variant="ghost"
              size="sm"
              className="px-0 text-xs"
              aria-expanded={verDetalle}
              onClick={() => setVerDetalle((v) => !v)}
            >
              <ChevronDown
                className={`mr-1 h-3.5 w-3.5 transition-transform ${verDetalle ? "rotate-180" : ""}`}
              />
              {verDetalle ? "Ocultar detalle" : "Ver detalle completo"}
            </Button>

            {verDetalle && (
              <div className="space-y-4 border-t border-border pt-3">
                {novedades?.map((c) => (
                  <div key={c.version}>
                    <p className="text-sm font-semibold text-foreground">
                      {c.titulo}{" "}
                      <span className="font-normal text-muted-foreground">· v{c.version}</span>
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {c.cambios.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setNovedades(null);
                setVerDetalle(false);
              }}
            >
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
