import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "solaros:ui:";

/**
 * Estado de UI que sobrevive a refrescos de la página.
 * SSR-safe: arranca con el valor por defecto y rehidrata desde
 * localStorage tras el montaje (evita mismatch de hidratación).
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignorar almacenamiento no disponible */
    }
    hydrated.current = true;
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* ignorar cuota/privado */
    }
  }, [key, value]);

  const reset = useCallback(() => setValue(initial), [initial]);
  return [value, setValue, reset] as const;
}
