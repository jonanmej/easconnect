/**
 * Almacenamiento tolerante a fallos: usa localStorage cuando está disponible
 * y cae a memoria en modo incógnito o cuando el navegador lo bloquea.
 */
const memoria = new Map<string, string>();
let disponible: boolean | null = null;

function localOk(): boolean {
  if (disponible !== null) return disponible;
  if (typeof window === "undefined") return (disponible = false);
  try {
    const k = "__ea_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    disponible = true;
  } catch {
    disponible = false;
  }
  return disponible;
}

export const safeStorage = {
  get persistente() {
    return localOk();
  },
  getItem(key: string): string | null {
    if (localOk()) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        /* cae a memoria */
      }
    }
    return memoria.has(key) ? (memoria.get(key) as string) : null;
  },
  setItem(key: string, value: string) {
    memoria.set(key, value);
    if (localOk()) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* cuota o bloqueo: queda solo en memoria */
      }
    }
  },
  removeItem(key: string) {
    memoria.delete(key);
    if (localOk()) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignorar */
      }
    }
  },
};
