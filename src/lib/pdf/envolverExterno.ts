import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { BRAND_LOGO_URLS } from "@/components/BrandLogo";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function fetchPng(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export type ExternoMeta = {
  cliente?: string | null;
  planta?: string | null;
  folio?: string | null;
  servicio?: string | null;
  fecha: string;
  nombre_original: string;
  documento_codigo?: string;
  documento_version?: string;
  documento_clasificacion?: string;
};

/**
 * Envuelve un PDF externo con un encabezado y pie institucional EA en cada
 * página, sin re-renderizar el contenido original. Devuelve un Blob.
 */
export async function envolverPdfExternoConEncabezadoEA(
  pdfBase64: string,
  meta: ExternoMeta,
): Promise<Blob> {
  const bytes = b64ToBytes(pdfBase64);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://easconnect.lovable.app";

  const [eaBytes, pvBytes, chBytes] = await Promise.all([
    fetchPng(origin + BRAND_LOGO_URLS["ea-main"].light),
    fetchPng(origin + BRAND_LOGO_URLS.pvstop.light),
    fetchPng(origin + BRAND_LOGO_URLS.chemitek.light),
  ]);
  const eaImg = eaBytes ? await pdf.embedPng(eaBytes).catch(() => null) : null;
  const pvImg = pvBytes ? await pdf.embedPng(pvBytes).catch(() => null) : null;
  const chImg = chBytes ? await pdf.embedPng(chBytes).catch(() => null) : null;

  const HEADER_H = 44;
  const FOOTER_H = 32;
  const primary = rgb(46 / 255, 74 / 255, 135 / 255);
  const primarySoft = rgb(91 / 255, 127 / 255, 191 / 255);
  const muted = rgb(100 / 255, 116 / 255, 139 / 255);
  const white = rgb(1, 1, 1);

  const codigo = `${meta.documento_codigo ?? "EA-REP-EXT"} · v${meta.documento_version ?? "1.0"}`;
  const clasif = meta.documento_clasificacion ?? "Uso interno";

  const pages = pdf.getPages();
  pages.forEach((page, idx) => {
    const { width, height } = page.getSize();

    // Banda de encabezado blanca opaca + línea inferior azul
    page.drawRectangle({ x: 0, y: height - HEADER_H, width, height: HEADER_H, color: white });
    page.drawRectangle({ x: 0, y: height - HEADER_H, width, height: 1.2, color: primary });

    // Logo EA a la izquierda
    if (eaImg) {
      const targetH = 26;
      const ratio = eaImg.width / eaImg.height;
      const targetW = targetH * ratio;
      page.drawImage(eaImg, {
        x: 18,
        y: height - HEADER_H + (HEADER_H - targetH) / 2,
        width: targetW,
        height: targetH,
      });
    }
    // Titular
    page.drawText("EA SERVICE AND CONSULTING", {
      x: 90, y: height - 16, size: 7.5, font: fontBold, color: primary,
    });
    page.drawText("Reporte externo · Formato institucional", {
      x: 90, y: height - 26, size: 6.5, font, color: muted,
    });
    page.drawText(`Archivo: ${truncate(meta.nombre_original, 60)}`, {
      x: 90, y: height - 36, size: 6.5, font, color: muted,
    });

    // Metadatos derechos
    const rightX = width - 18;
    drawRight(page, meta.cliente ?? "—", rightX, height - 16, 7.5, fontBold, primary);
    drawRight(page, `${meta.planta ?? "—"}${meta.folio ? " · " + meta.folio : ""}`, rightX, height - 25, 6.5, font, muted);
    drawRight(page, `${meta.fecha} · ${codigo}`, rightX, height - 33, 6.5, font, muted);
    drawRight(page, clasif, rightX, height - 41, 6.5, font, muted);

    // Pie
    page.drawRectangle({ x: 0, y: 0, width, height: FOOTER_H, color: white });
    page.drawRectangle({ x: 0, y: FOOTER_H, width, height: 1, color: primarySoft });

    let logoX = 18;
    if (pvImg) {
      const h = 14; const r = pvImg.width / pvImg.height; const w = h * r;
      page.drawImage(pvImg, { x: logoX, y: (FOOTER_H - h) / 2, width: w, height: h });
      logoX += w + 10;
    }
    if (chImg) {
      const h = 11; const r = chImg.width / chImg.height; const w = h * r;
      page.drawImage(chImg, { x: logoX, y: (FOOTER_H - h) / 2 + 1, width: w, height: h });
    }
    page.drawText(
      "Contenido original preservado · Reformateado con encabezado institucional EA Service & Consulting",
      { x: 160, y: FOOTER_H / 2 - 2, size: 6.5, font, color: muted },
    );
    drawRight(page, `Página ${idx + 1} / ${pages.length}`, width - 18, FOOTER_H / 2 - 2, 7, fontBold, primary);
  });

  const out = await pdf.save();
  const copy = new Uint8Array(out);
  return new Blob([copy.buffer as ArrayBuffer], { type: "application/pdf" });
}

function drawRight(page: any, text: string, xRight: number, y: number, size: number, font: any, color: any) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: xRight - w, y, size, font, color });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export async function descargarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}