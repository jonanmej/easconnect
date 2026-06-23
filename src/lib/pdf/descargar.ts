import { pdf } from "@react-pdf/renderer";
import { createElement } from "react";
import { ReporteDoc, type ReporteData } from "./ReporteDoc";

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

export async function buildEvidencias(items: { trabajo: string; descripcion?: string | null; url: string }[]) {
  const out: { trabajo: string; descripcion?: string | null; dataUrl: string }[] = [];
  await Promise.all(items.map(async (it) => {
    const d = await urlToDataUrl(it.url);
    if (d) out.push({ trabajo: it.trabajo, descripcion: it.descripcion ?? null, dataUrl: d });
  }));
  return out;
}

export async function generarYDescargarPdf(data: ReporteData, filename: string) {
  const blob = await pdf(createElement(ReporteDoc, { data })).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}