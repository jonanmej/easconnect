import { pdf } from "@react-pdf/renderer";
import { createElement } from "react";
import { ReporteDoc, type ReporteData } from "./ReporteDoc";
import { RecursosDoc, type RecursosData } from "./RecursosDoc";

/** Lee el tema activo desde `<html class="dark">` (ver ThemeProvider). */
function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function uuidV4() {
  // Compatible con todos los navegadores; randomUUID() requiere contexto seguro.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function sha256Hex(blob: Blob) {
  try {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function measureAspect(dataUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const img = new window.Image();
      img.onload = () => {
        const a = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null;
        resolve(a);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}

export async function buildEvidencias(items: { trabajo: string; descripcion?: string | null; url: string }[]) {
  const out: { trabajo: string; descripcion?: string | null; dataUrl: string; aspect?: number | null }[] = [];
  await Promise.all(items.map(async (it) => {
    const d = await urlToDataUrl(it.url);
    if (!d) return;
    const aspect = await measureAspect(d);
    out.push({ trabajo: it.trabajo, descripcion: it.descripcion ?? null, dataUrl: d, aspect });
  }));
  return out;
}

/** Añade metadatos de orientación (aspect) a imágenes que ya vienen como dataURL. */
export async function withAspect(items: { trabajo: string; descripcion?: string | null; dataUrl: string }[]) {
  return Promise.all(items.map(async (it) => ({
    ...it,
    aspect: await measureAspect(it.dataUrl),
  })));
}

/**
 * Genera y descarga el PDF con trazabilidad:
 * - Identificador único de documento (UUID)
 * - Código de documento + versión + clasificación
 * - Metadatos embebidos (autor, asunto, palabras clave, fechas)
 * - Hash SHA-256 visible en pie y cierre para garantizar integridad
 */
export async function generarYDescargarPdf(data: ReporteData, filename: string) {
  const documento_id = data.documento_id ?? uuidV4();
  const documento_codigo =
    data.documento_codigo ?? `EA-${data.modo === "ejecutivo" ? "REP-EJE" : "REP-INT"}`;
  const documento_version = data.documento_version ?? "1.0";
  const documento_clasificacion = data.documento_clasificacion ?? "Uso interno";
  const retencion = "Retención documental: 5 años";

  // Render inicial para calcular hash sobre el contenido base
  const base: ReporteData = {
    ...data,
    documento_id,
    documento_codigo,
    documento_version,
    documento_clasificacion,
    documento_hash: undefined,
  };
  const initialBlob = await pdf(createElement(ReporteDoc, { data: base }) as any).toBlob();
  const hash = await sha256Hex(initialBlob);

  // Render final con hash embebido para trazabilidad
  const finalData: ReporteData = { ...base, documento_hash: hash };
  const blob = await pdf(createElement(ReporteDoc, { data: finalData }) as any).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { documento_id, hash };
}

/**
 * Genera y descarga el PDF de Checklist de Recursos por OT,
 * con la misma trazabilidad ISO que los reportes ejecutivos.
 */
export async function generarYDescargarRecursosPdf(data: RecursosData, filename: string) {
  const documento_id = data.documento_id ?? uuidV4();
  const documento_codigo = data.documento_codigo ?? `EA-REC-${data.folio ?? ""}`.replace(/\s+/g, "");
  const documento_version = data.documento_version ?? "1.0";
  const documento_clasificacion = data.documento_clasificacion ?? "Uso interno";

  const base: RecursosData = {
    ...data,
    documento_id,
    documento_codigo,
    documento_version,
    documento_clasificacion,
    documento_hash: undefined,
  };
  const initialBlob = await pdf(createElement(RecursosDoc, { data: base }) as any).toBlob();
  const hash = await sha256Hex(initialBlob);
  const finalData: RecursosData = { ...base, documento_hash: hash };
  const blob = await pdf(createElement(RecursosDoc, { data: finalData }) as any).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { documento_id, hash };
}