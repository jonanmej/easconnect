import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { getUiPrefs, setUiPrefs } from "@/lib/ui-prefs.functions";

type Ctx = {
  cargado: boolean;
  /** Preferencias remotas del perfil (vista y filtros por clave). */
  valores: Record<string, unknown>;
  /** Guarda una clave en el perfil (con debounce para no saturar la red). */
  guardar: (key: string, value: unknown) => void;
};

const UiPrefsCtx = createContext<Ctx | null>(null);

export function UiPrefsProvider({ children }: { children: ReactNode }) {
  const fGet = useServerFn(getUiPrefs);
  const fSet = useServerFn(setUiPrefs);
  const [valores, setValores] = useState<Record<string, unknown>>({});
  const [cargado, setCargado] = useState(false);
  const pendientes = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancel = false;
    fGet()
      .then((r) => {
        if (!cancel) setValores((r ?? {}) as Record<string, unknown>);
      })
      .catch(() => {
        /* sin preferencias remotas: se usa el almacenamiento local */
      })
      .finally(() => {
        if (!cancel) setCargado(true);
      });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = useCallback(() => {
    const prefs = pendientes.current;
    pendientes.current = {};
    if (!Object.keys(prefs).length) return;
    fSet({ data: { prefs } }).catch(() => {
      /* offline o sin permisos: la vista sigue guardada localmente */
    });
  }, [fSet]);

  const guardar = useCallback(
    (key: string, value: unknown) => {
      setValores((prev) => ({ ...prev, [key]: value }));
      pendientes.current[key] = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <UiPrefsCtx.Provider value={{ cargado, valores, guardar }}>{children}</UiPrefsCtx.Provider>
  );
}

/** Devuelve el contexto si existe (las rutas públicas no lo tienen). */
export function useUiPrefsOptional() {
  return useContext(UiPrefsCtx);
}
