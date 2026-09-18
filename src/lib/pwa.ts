/**
 * Registro del Service Worker (solo app publicada). Nunca se registra en
 * la vista previa de Lovable, dentro de un iframe ni en desarrollo, y admite
 * `?sw=off` como interruptor de emergencia para desinstalarlo.
 */
const SW_URL = "/sw.js";

function isBlockedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return true;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterAppSw() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => {
        const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
        return url.endsWith(SW_URL);
      })
      .map((r) => r.unregister()),
  );
}

/** Cachés en uso por la versión actual; cualquier otra se elimina al abrir la app. */
const CACHES_VIGENTES = ["easc-html-v3", "easc-code-v3", "easc-media-v3"];

/**
 * Borra cachés de versiones anteriores (por ejemplo "easc-assets", que guardaba
 * CSS y JS de forma permanente y podía mezclar estilos viejos con código nuevo).
 */
async function limpiarCachesObsoletas() {
  if (typeof caches === "undefined") return;
  try {
    const nombres = await caches.keys();
    await Promise.allSettled(
      nombres
        .filter((n) => n.startsWith("easc-") && !CACHES_VIGENTES.includes(n))
        .map((n) => caches.delete(n)),
    );
  } catch {
    /* ignorado */
  }
}

export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (isBlockedContext()) {
    void unregisterAppSw();
    void limpiarCachesObsoletas();
    return;
  }
  try {
    await limpiarCachesObsoletas();
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    const { observarActualizaciones } = await import("@/lib/app-update");
    observarActualizaciones(reg);
  } catch (e) {
    console.warn("[pwa] no se pudo registrar el service worker", e);
  }
}
