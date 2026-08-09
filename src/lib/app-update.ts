/**
 * Detección de actualizaciones publicadas para la app instalada (PWA).
 *
 * El service worker se registra sólo en la app publicada (ver src/lib/pwa.ts).
 * Aquí escuchamos cuando queda una versión nueva "en espera" y exponemos una
 * suscripción para que la UI pida al usuario instalarla.
 */
const SW_URL = "/sw.js";

type Listener = (disponible: boolean) => void;

let registro: ServiceWorkerRegistration | null = null;
let disponible = false;
const listeners = new Set<Listener>();

function emitir() {
  listeners.forEach((l) => l(disponible));
}

export function onUpdateDisponible(l: Listener): () => void {
  listeners.add(l);
  l(disponible);
  return () => listeners.delete(l);
}

export function hayUpdateDisponible() {
  return disponible;
}

function marcar(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) {
    disponible = true;
    emitir();
  }
}

/** Vincula el registro del SW y comienza a observar actualizaciones. */
export function observarActualizaciones(reg: ServiceWorkerRegistration) {
  registro = reg;
  marcar(reg);
  reg.addEventListener("updatefound", () => {
    const nuevo = reg.installing;
    if (!nuevo) return;
    nuevo.addEventListener("statechange", () => {
      if (nuevo.state === "installed") marcar(reg);
    });
  });
}

/** Consulta al servidor si hay una versión nueva publicada. */
export async function buscarActualizacion() {
  try {
    const reg =
      registro ??
      (typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration(SW_URL)
        : null);
    if (!reg) return;
    registro = reg;
    await reg.update();
    marcar(reg);
  } catch {
    /* sin conexión o SW no disponible */
  }
}

/** Activa la versión en espera y recarga la app. */
export async function instalarActualizacion() {
  const reg = registro ?? (await navigator.serviceWorker.getRegistration(SW_URL));
  const esperando = reg?.waiting;
  if (!esperando) {
    window.location.reload();
    return;
  }
  let recargado = false;
  const recargar = () => {
    if (recargado) return;
    recargado = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", recargar, { once: true });
  esperando.postMessage({ type: "SKIP_WAITING" });
  // Respaldo por si el SW no responde al mensaje
  window.setTimeout(recargar, 2500);
}
