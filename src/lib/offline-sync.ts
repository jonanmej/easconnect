/**
 * Cola de escrituras pendientes cuando no hay conexión (reportes diarios).
 * Se guarda en localStorage y se reintenta automáticamente al recuperar red.
 * Las fotos siguen su propia cola en `offline-queue.ts`.
 */
const KEY = "easc-pending-writes-v1";
export const OFFLINE_EVENT = "easc-offline-change";

export type PendingWrite = {
  id: string;
  kind: "reporte_diario";
  /** Payload tal cual se enviaría al servidor. */
  payload: Record<string, unknown>;
  /** Etiqueta legible para el usuario. */
  label: string;
  created_at: number;
  intentos: number;
  ultimo_error?: string | null;
};

function read(): PendingWrite[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as PendingWrite[];
  } catch {
    return [];
  }
}

function write(items: PendingWrite[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* almacenamiento lleno o modo incógnito */
  }
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT));
}

export function listPendingWrites(): PendingWrite[] {
  return read();
}

export function pendingWritesCount(): number {
  return read().length;
}

export function enqueueWrite(item: Pick<PendingWrite, "kind" | "payload" | "label">) {
  const items = read();
  items.push({ ...item, id: crypto.randomUUID(), created_at: Date.now(), intentos: 0 });
  write(items);
}

export function removePendingWrite(id: string) {
  write(read().filter((i) => i.id !== id));
}

/** Reintenta una sola escritura pendiente. Devuelve true si se sincronizó. */
export async function retryPendingWrite(id: string): Promise<boolean> {
  if (!isOnline()) return false;
  const item = read().find((i) => i.id === id);
  if (!item || item.kind !== "reporte_diario") return false;
  try {
    const { upsertReporteDiario } = await import("./reportes-diarios.functions");
    await upsertReporteDiario({ data: item.payload as any });
    removePendingWrite(id);
    return true;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    write(
      read().map((i) =>
        i.id === id ? { ...i, intentos: i.intentos + 1, ultimo_error: msg } : i,
      ),
    );
    return false;
  }
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

let flushing = false;

/** Reintenta todas las escrituras pendientes. Devuelve cuántas se sincronizaron. */
export async function flushPendingWrites(): Promise<number> {
  if (typeof window === "undefined" || flushing || !isOnline()) return 0;
  const items = read();
  if (!items.length) return 0;
  flushing = true;
  let ok = 0;
  try {
    const { upsertReporteDiario } = await import("./reportes-diarios.functions");
    for (const item of items) {
      if (item.kind !== "reporte_diario") continue;
      try {
        await upsertReporteDiario({ data: item.payload as any });
        removePendingWrite(item.id);
        ok++;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        // Error de red: se conserva para el siguiente intento.
        const rest = read().map((i) =>
          i.id === item.id ? { ...i, intentos: i.intentos + 1, ultimo_error: msg } : i,
        );
        write(rest);
        if (!isOnline()) break;
      }
    }
  } finally {
    flushing = false;
  }
  return ok;
}

export function onOfflineChange(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(OFFLINE_EVENT, handler);
  window.addEventListener("online", handler);
  window.addEventListener("offline", handler);
  return () => {
    window.removeEventListener(OFFLINE_EVENT, handler);
    window.removeEventListener("online", handler);
    window.removeEventListener("offline", handler);
  };
}
