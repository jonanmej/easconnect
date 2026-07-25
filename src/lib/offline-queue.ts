/**
 * Cola simple en localStorage para evidencias capturadas sin conexión.
 * No usa Service Worker (incompatible con el preview Lovable). Se procesa
 * mientras la pestaña está abierta — al volver online la app intenta subirlas.
 */
import { supabase } from "@/integrations/supabase/client";

const KEY = "easc-evidencia-queue-v1";
const BUCKET = "trabajos-evidencia";

export type EvidenciaPendiente = {
  id: string;
  trabajo_id: string;
  reporte_diario_id?: string | null;
  categoria?: "antes" | "durante" | "despues" | "anomalia" | "mediciones";
  descripcion: string | null;
  data_url: string; // image/jpeg base64
  created_at: number;
};

function read(): EvidenciaPendiente[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(items: EvidenciaPendiente[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("easc-queue-change"));
}

export function enqueue(item: Omit<EvidenciaPendiente, "id" | "created_at">) {
  const items = read();
  items.push({ ...item, id: crypto.randomUUID(), created_at: Date.now() });
  write(items);
}

export function pending(): EvidenciaPendiente[] {
  return read();
}

export function pendingCount(): number {
  return read().length;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

export async function flushQueue(
  onProgress?: (remaining: number) => void,
): Promise<{ subidas: number; errores: number }> {
  const items = read();
  let subidas = 0;
  let errores = 0;
  for (const item of items) {
    try {
      const blob = await dataUrlToBlob(item.data_url);
      const path = `trabajos/${item.trabajo_id}/${Date.now()}-${item.id.slice(0, 8)}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (up.error) throw up.error;
      const ins = await supabase
        .from("trabajo_evidencias")
        .insert({
          trabajo_id: item.trabajo_id,
          reporte_diario_id: item.reporte_diario_id ?? null,
          storage_path: path,
          descripcion: item.descripcion,
          categoria: item.categoria ?? "durante",
        });
      if (ins.error) throw ins.error;
      const rest = read().filter((x) => x.id !== item.id);
      write(rest);
      subidas++;
      onProgress?.(rest.length);
    } catch (e) {
      console.warn("Evidencia offline: error al subir", e);
      errores++;
    }
  }
  return { subidas, errores };
}

export function onQueueChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener("easc-queue-change", h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener("easc-queue-change", h);
    window.removeEventListener("storage", h);
  };
}