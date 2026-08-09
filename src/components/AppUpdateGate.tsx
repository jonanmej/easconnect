import { useEffect, useState } from "react";
import { Download, Sparkles } from "lucide-react";
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
  onUpdateDisponible,
} from "@/lib/app-update";
import { safeStorage } from "@/lib/safe-storage";

const VERSION_KEY = "easc-app-version";

/**
 * Gestiona el ciclo de actualización de la app instalada:
 *  1) al entrar a la app o iniciar sesión busca nuevas publicaciones,
 *  2) pide al usuario instalar la actualización detectada,
 *  3) tras instalarla muestra el detalle de los cambios.
 */
export function AppUpdateGate() {
  const [disponible, setDisponible] = useState(false);
  const [instalando, setInstalando] = useState(false);
  const [novedades, setNovedades] = useState<CambioVersion[] | null>(null);

  // 1) Suscripción a la disponibilidad de una versión nueva
  useEffect(() => onUpdateDisponible(setDisponible), []);

  // 2) Búsqueda de actualizaciones al ingresar, al volver a la pestaña y al iniciar sesión
  useEffect(() => {
    void buscarActualizacion();

    const alVolver = () => {
      if (document.visibilityState === "visible") void buscarActualizacion();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", () => void buscarActualizacion());

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void buscarActualizacion();
    });

    const intervalo = window.setInterval(() => void buscarActualizacion(), 30 * 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.clearInterval(intervalo);
      sub.subscription.unsubscribe();
    };
  }, []);

  // 3) Detalle de los cambios ya instalados (una sola vez por versión)
  useEffect(() => {
    const previa = safeStorage.getItem(VERSION_KEY);
    if (previa === APP_VERSION) return;
    safeStorage.setItem(VERSION_KEY, APP_VERSION);
    if (!previa) return; // primera instalación: no mostramos changelog
    const lista = cambiosDesde(previa);
    if (lista.length) setNovedades(lista);
  }, []);

  return (
    <>
      {disponible && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed inset-x-3 z-[70] rounded-xl border border-border bg-card p-3 shadow-lg sm:left-auto sm:right-4 sm:w-80"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
              <Download className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Actualización disponible</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Se publicó una versión nueva de EA Service Connect. Instálala para continuar con
                los últimos cambios.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={instalando}
                  onClick={() => {
                    setInstalando(true);
                    void instalarActualizacion();
                  }}
                >
                  {instalando ? "Instalando…" : "Instalar ahora"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDisponible(false)}>
                  Más tarde
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!novedades} onOpenChange={(o) => !o && setNovedades(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Actualización instalada — v{APP_VERSION}
            </DialogTitle>
            <DialogDescription>Esto es lo nuevo en la app:</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
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
          <DialogFooter>
            <Button onClick={() => setNovedades(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
