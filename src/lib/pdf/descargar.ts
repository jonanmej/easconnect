import { createElement } from "react";
import { ensurePdfBrowserPolyfills } from "./browser-polyfills";
import type { ReporteData } from "./ReporteDoc";
import type { RecursosData } from "./RecursosDoc";
import type { PdfExternoData } from "./PdfExternoDoc";
import type { CumplimientoData } from "./CumplimientoDoc";
import type { OrdenCompraData } from "./OrdenCompraDoc";
import type { ProgramacionData } from "./ProgramacionDoc";

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

/**
 * Perfiles de compresión de imágenes para el PDF. El texto, tablas, KPIs y
 * firmas del reporte son vectoriales, así que solo se reduce la resolución de
 * las fotografías: el contenido del reporte se mantiene idéntico.
 *
 * - `normal`: archivo para archivo/impresión.
 * - `correo`: pensado para adjuntar en Outlook (límite típico de 20 MB).
 */
export type CalidadPdf = "normal" | "correo";

const PERFILES: Record<CalidadPdf, { maxPx: number; quality: number }> = {
  normal: { maxPx: 1600, quality: 0.82 },
  correo: { maxPx: 1000, quality: 0.62 },
};

/** Reescala una dataURL a JPEG con el perfil indicado (silenciosamente no-op si falla). */
async function comprimirDataUrl(dataUrl: string, calidad: CalidadPdf): Promise<string> {
  const { maxPx, quality } = PERFILES[calidad];
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return dataUrl;
    const escala = Math.min(1, maxPx / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * escala));
    const ch = Math.max(1, Math.round(h * escala));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    // Fondo blanco para PNG con transparencia (evita fondos negros en JPEG).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    const out = canvas.toDataURL("image/jpeg", quality);
    return out && out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

export async function buildEvidencias(
  items: { trabajo: string; descripcion?: string | null; url: string; categoria?: string | null }[],
  calidad: CalidadPdf = "normal",
) {
  const out: {
    trabajo: string;
    descripcion?: string | null;
    dataUrl: string;
    aspect?: number | null;
    categoria?: string | null;
  }[] = [];
  await Promise.all(items.map(async (it) => {
    const raw = await urlToDataUrl(it.url);
    if (!raw) return;
    const d = await comprimirDataUrl(raw, calidad);
    const aspect = await measureAspect(d);
    out.push({
      trabajo: it.trabajo,
      descripcion: it.descripcion ?? null,
      dataUrl: d,
      aspect,
      categoria: it.categoria ?? null,
    });
  }));
  return out;
}

/** Añade metadatos de orientación (aspect) a imágenes que ya vienen como dataURL. */
export async function withAspect(
  items: { trabajo: string; descripcion?: string | null; dataUrl: string; aspect?: number | null }[],
  calidad: CalidadPdf = "normal",
) {
  return Promise.all(items.map(async (it) => {
    const dataUrl = await comprimirDataUrl(it.dataUrl, calidad);
    return { ...it, dataUrl, aspect: await measureAspect(dataUrl) };
  }));
}

/**
 * Genera y descarga el PDF con trazabilidad:
 * - Identificador único de documento (UUID)
 * - Código de documento + versión + clasificación
 * - Metadatos embebidos (autor, asunto, palabras clave, fechas)
 * - Hash SHA-256 visible en pie y cierre para garantizar integridad
 */
export async function generarYDescargarPdf(data: ReporteData, filename: string) {
  ensurePdfBrowserPolyfills();
  const [{ pdf }, { ReporteDoc }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./ReporteDoc"),
  ]);
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
    theme: data.theme ?? currentTheme(),
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
  return { documento_id, hash, bytes: blob.size };
}

/**
 * Genera y descarga el PDF de Checklist de Recursos por OT,
 * con la misma trazabilidad ISO que los reportes ejecutivos.
 */
export async function generarYDescargarRecursosPdf(data: RecursosData, filename: string) {
  ensurePdfBrowserPolyfills();
  const [{ pdf }, { RecursosDoc }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./RecursosDoc"),
  ]);
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
    theme: data.theme ?? currentTheme(),
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

/** PDF del Reporte de Estado Previo a Trabajos (techos / áreas FV y sectores circundantes). */
export async function generarYDescargarInspeccionPreviaPdf(
  data: import("./InspeccionPreviaDoc").InspeccionPreviaData,
  filename: string,
) {
  ensurePdfBrowserPolyfills();
  const [{ pdf }, { InspeccionPreviaDoc }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./InspeccionPreviaDoc"),
  ]);
  type D = import("./InspeccionPreviaDoc").InspeccionPreviaData;
  const documento_id = data.documento_id ?? uuidV4();
  const base: D = {
    ...data,
    documento_id,
    documento_codigo: data.documento_codigo ?? "EA-INS-PRE",
    documento_version: data.documento_version ?? "1.0",
    documento_clasificacion: data.documento_clasificacion ?? "Uso interno",
    documento_hash: undefined,
    theme: data.theme ?? currentTheme(),
  };
  const initialBlob = await pdf(createElement(InspeccionPreviaDoc, { data: base }) as any).toBlob();
  const hash = await sha256Hex(initialBlob);
  const finalData: D = { ...base, documento_hash: hash };
  const blob = await pdf(createElement(InspeccionPreviaDoc, { data: finalData }) as any).toBlob();

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
 * Reformatea un PDF externo con el encabezado/pie institucional EA
 * conservando el texto original. NO reinterpreta el contenido.
 */
export async function generarYDescargarPdfExterno(data: PdfExternoData, filename: string) {
  ensurePdfBrowserPolyfills();
  const [{ pdf }, { PdfExternoDoc }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./PdfExternoDoc"),
  ]);
  const documento_id = data.documento_id ?? uuidV4();
  const base: PdfExternoData = {
    ...data,
    documento_id,
    documento_codigo: data.documento_codigo ?? "EA-REP-EXT",
    documento_version: data.documento_version ?? "1.0",
    documento_clasificacion: data.documento_clasificacion ?? "Uso interno",
    documento_hash: undefined,
  };
  const initialBlob = await pdf(createElement(PdfExternoDoc, { data: base }) as any).toBlob();
  const hash = await sha256Hex(initialBlob);
  const finalData: PdfExternoData = { ...base, documento_hash: hash };
  const blob = await pdf(createElement(PdfExternoDoc, { data: finalData }) as any).toBlob();
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
 * Genera y descarga el PDF de Cumplimiento de servicios contratados por cliente.
 */
export async function generarYDescargarCumplimientoPdf(data: CumplimientoData, filename: string) {
  ensurePdfBrowserPolyfills();
  const [{ pdf }, { CumplimientoDoc }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./CumplimientoDoc"),
  ]);
  const documento_id = data.documento_id ?? uuidV4();
  const base: CumplimientoData = {
    ...data,
    documento_id,
    documento_codigo: data.documento_codigo ?? `EA-CUM-${data.anio}`,
    documento_version: data.documento_version ?? "1.0",
    documento_clasificacion: data.documento_clasificacion ?? "Confidencial · Cliente",
    documento_hash: undefined,
  };
  const initialBlob = await pdf(createElement(CumplimientoDoc, { data: base }) as any).toBlob();
  const hash = await sha256Hex(initialBlob);
  const finalData: CumplimientoData = { ...base, documento_hash: hash };
  const blob = await pdf(createElement(CumplimientoDoc, { data: finalData }) as any).toBlob();
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

/** Genera y descarga el PDF de Orden de Compra por bajo stock. */
export async function generarYDescargarOrdenCompraPdf(data: OrdenCompraData, filename: string) {
  ensurePdfBrowserPolyfills();
  const [{ pdf }, { OrdenCompraDoc }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./OrdenCompraDoc"),
  ]);
  const blob = await pdf(createElement(OrdenCompraDoc, { data }) as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Genera y descarga el PDF de la programación (semana / mes / año). */
export async function generarYDescargarProgramacionPdf(data: ProgramacionData, filename: string) {
  ensurePdfBrowserPolyfills();
  const [{ pdf }, { ProgramacionDoc }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./ProgramacionDoc"),
  ]);
  const documento_id = data.documento_id ?? uuidV4();
  const finalData: ProgramacionData = {
    ...data,
    documento_id,
    documento_codigo: data.documento_codigo ?? "EA-PRG",
    documento_version: data.documento_version ?? "1.0",
    documento_clasificacion: data.documento_clasificacion ?? "Uso interno",
  };
  const blob = await pdf(createElement(ProgramacionDoc, { data: finalData }) as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { documento_id };
}
/**
 * Genera y descarga el PDF del control de marcación de jornada laboral.
 */
export async function generarYDescargarJornadasPdf(
  data: import("./JornadasDoc").JornadasData,
  filename: string,
) {
  ensurePdfBrowserPolyfills();
  const [{ pdf }, { JornadasDoc }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./JornadasDoc"),
  ]);
  type D = import("./JornadasDoc").JornadasData;
  const documento_id = data.documento_id ?? uuidV4();
  const base: D = {
    ...data,
    documento_id,
    documento_codigo: data.documento_codigo ?? "EA-JOR-01",
    documento_version: data.documento_version ?? "1.0",
    documento_clasificacion: data.documento_clasificacion ?? "Uso interno · RRHH",
    documento_hash: undefined,
  };
  const initialBlob = await pdf(createElement(JornadasDoc, { data: base }) as any).toBlob();
  const hash = await sha256Hex(initialBlob);
  const finalData: D = { ...base, documento_hash: hash };
  const blob = await pdf(createElement(JornadasDoc, { data: finalData }) as any).toBlob();
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
