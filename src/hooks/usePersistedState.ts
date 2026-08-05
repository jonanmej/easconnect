import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { safeStorage } from "@/lib/safe-storage";
import { useUiPrefsOptional } from "@/lib/ui-prefs-context";

const PREFIX = "solaros:ui:";
const CANAL = "solaros:ui:sync";

type Opts = {
  /**
   * Sincroniza el valor con la URL (query param) para poder compartir enlaces
   * con la misma vista. Por defecto se activa para valores simples; pasa un
   * string para fijar el nombre del parámetro o `false` para desactivarlo.
   */
  url?: boolean | string;
};

let canal: BroadcastChannel | null = null;
function getCanal(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!canal) {
    try {
      canal = new BroadcastChannel(CANAL);
    } catch {
      canal = null;
    }
  }
  return canal;
}

function leerStorage<T>(key: string): T | undefined {
  const raw = safeStorage.getItem(PREFIX + key);
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function parseParam<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

function esSimple(v: unknown) {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

/**
 * Estado de UI persistente. Sobrevive a refrescos y se sincroniza en tres
 * niveles: URL (enlaces compartibles), perfil del usuario (cualquier
 * navegador o dispositivo) y almacenamiento local con respaldo en memoria
 * (modo incógnito o almacenamiento bloqueado). Además se propaga entre
 * pestañas abiertas del mismo navegador.
 */
export function usePersistedState<T>(key: string, initial: T, opts?: Opts) {
  const prefs = useUiPrefsOptional();
  const param = useMemo(
    () => (typeof opts?.url === "string" ? opts.url : key.split(".").pop() || key),
    [opts?.url, key],
  );
  const urlHabilitado = opts?.url !== false;
  const urlForzado = opts?.url === true || typeof opts?.url === "string";

  const [value, setValue] = useState<T>(initial);
  const hidratado = useRef(false);
  const remotoAplicado = useRef(false);
  const valorRef = useRef<T>(initial);
  valorRef.current = value;

  // 1) Hidratación inicial: URL > almacenamiento local.
  useEffect(() => {
    let inicial: T | undefined;
    if (urlHabilitado) {
      try {
        const sp = new URLSearchParams(window.location.search);
        const raw = sp.get(param);
        if (raw != null) inicial = parseParam<T>(raw);
      } catch {
        /* ignorar */
      }
    }
    if (inicial === undefined) inicial = leerStorage<T>(key);
    if (inicial !== undefined) {
      setValue(inicial);
      remotoAplicado.current = true; // la URL/local manda sobre el perfil en esta carga
    }
    hidratado.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 2) Preferencias del perfil (otro navegador o dispositivo).
  useEffect(() => {
    if (!prefs?.cargado || remotoAplicado.current) return;
    remotoAplicado.current = true;
    const remoto = prefs.valores[key];
    if (remoto !== undefined && remoto !== null) setValue(remoto as T);
  }, [prefs?.cargado, prefs?.valores, key]);

  // 3) Escritura: local + perfil + URL.
  useEffect(() => {
    if (!hidratado.current) return;
    safeStorage.setItem(PREFIX + key, JSON.stringify(value));
    prefs?.guardar(key, value);
    if (urlHabilitado && (urlForzado || esSimple(value))) {
      try {
        const url = new URL(window.location.href);
        const serial = typeof value === "string" ? value : JSON.stringify(value);
        if (value === undefined || value === null || serial === "") url.searchParams.delete(param);
        else url.searchParams.set(param, serial);
        window.history.replaceState(window.history.state, "", url.toString());
      } catch {
        /* ignorar */
      }
    }
    getCanal()?.postMessage({ key, value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  // 4) Sincronización entre pestañas.
  useEffect(() => {
    const bc = getCanal();
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { key?: string; value?: unknown } | null;
      if (!d || d.key !== key) return;
      if (JSON.stringify(d.value) === JSON.stringify(valorRef.current)) return;
      hidratado.current = false;
      setValue(d.value as T);
      requestAnimationFrame(() => {
        hidratado.current = true;
      });
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PREFIX + key || e.newValue == null) return;
      try {
        const next = JSON.parse(e.newValue) as T;
        if (JSON.stringify(next) === JSON.stringify(valorRef.current)) return;
        hidratado.current = false;
        setValue(next);
        requestAnimationFrame(() => {
          hidratado.current = true;
        });
      } catch {
        /* ignorar */
      }
    };
    bc?.addEventListener("message", onMsg);
    window.addEventListener("storage", onStorage);
    return () => {
      bc?.removeEventListener("message", onMsg);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);

  const reset = useCallback(() => setValue(initial), [initial]);
  return [value, setValue, reset] as const;
}
