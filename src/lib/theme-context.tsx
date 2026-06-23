import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  /** Preferencia del usuario (puede ser "system"). */
  preference: ThemePreference;
  /** Tema efectivo aplicado al documento. */
  theme: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const THEME_STORAGE_KEY = "easc-theme";

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "dark" || saved === "light" || saved === "system") return saved;
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [theme, setTheme] = useState<ResolvedTheme>("light");
  const [userId, setUserId] = useState<string | null>(null);
  const [hydratedFromRemote, setHydratedFromRemote] = useState(false);

  // Hidratación inicial desde localStorage.
  useEffect(() => {
    const pref = readPreference();
    setPreferenceState(pref);
    setTheme(resolve(pref));
  }, []);

  // Sincronizar con perfil del usuario (cross-sesión / cross-dispositivo).
  useEffect(() => {
    let cancelled = false;

    async function loadFromProfile(uid: string) {
      const { data, error } = await supabase
        .from("profiles")
        .select("theme_preference")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled || error || !data?.theme_preference) {
        setHydratedFromRemote(true);
        return;
      }
      const remote = data.theme_preference as ThemePreference;
      if (remote === "light" || remote === "dark" || remote === "system") {
        setPreferenceState(remote);
        setTheme(resolve(remote));
      }
      setHydratedFromRemote(true);
    }

    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (uid) loadFromProfile(uid);
      else setHydratedFromRemote(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (event === "SIGNED_IN" && uid) {
        setHydratedFromRemote(false);
        loadFromProfile(uid);
      }
      if (event === "SIGNED_OUT") setHydratedFromRemote(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Reaccionar a cambios de prefers-color-scheme cuando la preferencia es "system".
  useEffect(() => {
    if (preference !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(mql.matches ? "dark" : "light");
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  // Aplicar el tema resuelto al <html>.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  // Persistir preferencia.
  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {}
  }, [preference]);

  // Persistir en el perfil cuando hay sesión y la hidratación remota ya ocurrió.
  useEffect(() => {
    if (!userId || !hydratedFromRemote) return;
    supabase
      .from("profiles")
      .update({ theme_preference: preference })
      .eq("id", userId)
      .then(() => {});
  }, [preference, userId, hydratedFromRemote]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      theme,
      setPreference: (p) => {
        setPreferenceState(p);
        setTheme(resolve(p));
      },
      toggleTheme: () => {
        const next: ResolvedTheme = theme === "dark" ? "light" : "dark";
        setPreferenceState(next);
        setTheme(next);
      },
    }),
    [preference, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}