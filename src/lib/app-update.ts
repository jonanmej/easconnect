/**
 * Ciclo de actualización de la app publicada (PWA) con descarga en segundo plano.
 *
 * Flujo:
 *  1) `buscarActualizacion()` consulta al servidor cuando hay buena conectividad.
 *  2) El service worker descarga el nuevo build en segundo plano ("descargando").
 *  3) Sólo cuando la descarga terminó (SW en espera) pasamos a "listo" y la UI
 *     ofrece el botón para reiniciar la app.
 *  4) En navegadores sin service worker (iOS antiguo / Safari en pestaña) usamos
 *     una comprobación por huella del build y mostramos instrucciones manuales.
 */
const SW_URL = "/sw.js";
const HUELLA_KEY = "easc-build-huella";

export type EstadoUpdate = "idle" | "buscando" | "descargando" | "listo" | "error";

export type UpdateSnapshot = {
  estado: EstadoUpdate;
  error: string | null;
  /** El navegador soporta service worker (descarga automática en segundo plano). */
  soporteSW: boolean;
  /** Puede activarse la nueva versión con un botón (SW listo o recarga manual). */
  puedeInstalar: boolean;
};

type Listener = (s: UpdateSnapshot) => void;

let registro: ServiceWorkerRegistration | null = null;
let estado: EstadoUpdate = "idle";
let error: string | null = null;
const listeners = new Set<Listener>();

function soporteSW() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

function snapshot(): UpdateSnapshot {
  return {
    estado,
    error,
    soporteSW: soporteSW(),
    puedeInstalar: estado === "listo",
  };
}

function emitir() {
  const s = snapshot();
  listeners.forEach((l) => l(s));
}

function setEstado(nuevo: EstadoUpdate, mensaje: string | null = null) {
  if (estado === nuevo && error === mensaje) return;
  estado = nuevo;
  error = mensaje;
  emitir();
}

export function onUpdateEstado(l: Listener): () => void {
  listeners.add(l);
  l(snapshot());
  return () => listeners.delete(l);
}

export function estadoUpdate(): UpdateSnapshot {
  return snapshot();
}

/** true cuando la conexión permite descargar un build completo sin molestar al usuario. */
export function conectividadBuena(): boolean {
  if (typeof navigator === "undefined") return false;
  if (navigator.onLine === false) return false;
  const con = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } })
    .connection;
  if (!con) return true;
  if (con.saveData) return false;
  const tipo = con.effectiveType;
  if (tipo === "slow-2g" || tipo === "2g") return false;
  return true;
}

/* ------------------------------ service worker ----------------------------- */

async function revisarRegistro(reg: ServiceWorkerRegistration) {
  const controlada = !!navigator.serviceWorker.controller;
  if (reg.waiting && controlada) {
    // Un SW en espera no siempre significa build nuevo: puede quedar de una
    // actualización ya aplicada. Confirmamos comparando el build servido con
    // el que está corriendo en esta pestaña.
    if (await esMismoBuild()) {
      descartarEspera(reg);
      setEstado("idle");
      return;
    }
    setEstado("listo");
    return;
  }
  if (reg.installing && controlada) {
    setEstado("descargando");
    return;
  }
  if (estado === "buscando") setEstado("idle");
}

/** Activa en silencio un SW en espera que corresponde al build ya cargado. */
function descartarEspera(reg: ServiceWorkerRegistration) {
  try {
    reg.waiting?.postMessage({ type: "SKIP_WAITING" });
  } catch {
    /* ignorado */
  }
}

/**
 * true cuando el build servido por el servidor es el mismo que está corriendo
 * en esta pestaña (por lo tanto no hay nada nuevo que instalar).
 */
async function esMismoBuild(): Promise<boolean> {
  const remota = await huellaRemota();
  if (!remota) return false;
  const local = huellaLocal();
  if (!local) return false;
  return remota === local;
}

/** Vincula el registro del SW y observa la descarga del nuevo build. */
export function observarActualizaciones(reg: ServiceWorkerRegistration) {
  registro = reg;
  void revisarRegistro(reg);
  reg.addEventListener("updatefound", () => {
    const nuevo = reg.installing;
    if (!nuevo) return;
    if (navigator.serviceWorker.controller) setEstado("descargando");
    nuevo.addEventListener("statechange", () => {
      if (nuevo.state === "installed") void revisarRegistro(reg);
      if (nuevo.state === "redundant" && estado === "descargando")
        setEstado("error", "La descarga de la actualización no se completó.");
    });
  });
}

/* ------------------------- respaldo sin service worker -------------------- */

/** Huella del build que está corriendo en esta pestaña. */
function huellaLocal(): string | null {
  if (typeof document === "undefined") return null;
  const urls = [
    ...document.querySelectorAll<HTMLScriptElement>("script[src]"),
    ...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'),
  ]
    .map((el) =>
      el instanceof HTMLScriptElement ? el.getAttribute("src") : el.getAttribute("href"),
    )
    .filter((u): u is string => !!u)
    .map((u) => {
      try {
        return new URL(u, window.location.origin).pathname;
      } catch {
        return u;
      }
    })
    .filter((p) => /^\/(assets|_build)\/.+\.(js|css)$/.test(p));
  if (!urls.length) return null;
  return urls.sort().join("|");
}

/** Huella del build actual a partir de los scripts del documento raíz. */
async function huellaRemota(): Promise<string | null> {
  try {
    const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    const activos = [...html.matchAll(/["'](\/(?:assets|_build)\/[^"']+\.(?:js|css))["']/g)].map(
      (m) => m[1],
    );
    if (!activos.length) return null;
    return activos.sort().join("|");
  } catch {
    return null;
  }
}

async function buscarSinSW() {
  const huella = await huellaRemota();
  if (!huella) {
    if (estado === "buscando") setEstado("idle");
    return;
  }
  const { safeStorage } = await import("@/lib/safe-storage");
  // La referencia principal es el build que corre en esta pestaña; la huella
  // guardada sólo sirve como respaldo cuando no podemos leer el documento.
  const local = huellaLocal() ?? safeStorage.getItem(HUELLA_KEY);
  safeStorage.setItem(HUELLA_KEY, huella);
  if (!local) {
    setEstado("idle");
    return;
  }
  if (local !== huella) setEstado("listo");
  else setEstado("idle");
}

/* --------------------------------- acciones -------------------------------- */

/** Consulta si hay una versión nueva publicada (sólo con buena conectividad). */
export async function buscarActualizacion(opciones?: { forzar?: boolean }) {
  if (typeof window === "undefined") return;
  if (estado === "listo" || estado === "descargando") return;
  if (!opciones?.forzar && !conectividadBuena()) return;

  setEstado("buscando");

  if (!soporteSW()) {
    await buscarSinSW();
    return;
  }

  try {
    const reg = registro ?? (await navigator.serviceWorker.getRegistration(SW_URL));
    if (!reg) {
      await buscarSinSW();
      return;
    }
    registro = reg;
    await reg.update();
    await revisarRegistro(reg);
  } catch {
    // Sin conexión o el servidor no respondió: no es un error visible para el usuario.
    setEstado("idle");
  }
}

/**
 * Activa la versión ya descargada y reinicia la app.
 * Devuelve un error legible si no se pudo completar.
 */
export async function instalarActualizacion(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!soporteSW()) {
      const { safeStorage } = await import("@/lib/safe-storage");
      const huella = await huellaRemota();
      if (huella) safeStorage.setItem(HUELLA_KEY, huella);
      await limpiarCaches();
      window.location.reload();
      return { ok: true };
    }

    const reg = registro ?? (await navigator.serviceWorker.getRegistration(SW_URL));
    const esperando = reg?.waiting;
    if (!esperando) {
      window.location.reload();
      return { ok: true };
    }

    const listo = new Promise<boolean>((resolve) => {
      const alCambiar = () => resolve(true);
      navigator.serviceWorker.addEventListener("controllerchange", alCambiar, { once: true });
      window.setTimeout(() => resolve(false), 6000);
    });

    esperando.postMessage({ type: "SKIP_WAITING" });
    await listo;
    window.location.reload();
    return { ok: true };
  } catch (e) {
    const mensaje =
      e instanceof Error ? e.message : "No se pudo aplicar la actualización. Intenta de nuevo.";
    setEstado("error", mensaje);
    return { ok: false, error: mensaje };
  }
}

async function limpiarCaches() {
  if (typeof caches === "undefined") return;
  try {
    const nombres = await caches.keys();
    await Promise.allSettled(
      nombres.filter((n) => /precache|runtime|workbox/i.test(n)).map((n) => caches.delete(n)),
    );
  } catch {
    /* ignorado */
  }
}

/** Descarta el aviso de error para que la UI vuelva al estado normal. */
export function limpiarError() {
  if (estado === "error") setEstado("idle");
}
