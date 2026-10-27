/**
 * Regla: el reporte FINAL (para el cliente) debe incluir carátula, igual que
 * siempre lo hizo el reporte ejecutivo, sin importar qué IA redactó el texto.
 * El reporte DIARIO (uso interno) no la lleva.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { ReporteDoc } from "@/lib/pdf/ReporteDoc";
import type { ReporteData } from "@/lib/pdf/reporte/tipos";

const base: ReporteData = {
  titulo: "Reporte de prueba",
  cliente: "Cliente X",
  planta: "Planta Y",
  periodo: "Octubre 2026",
  emitido_at: "27 oct 2026",
  modelo: null,
  resumen: "Resumen de prueba.",
  hallazgos: ["Hallazgo 1"],
  recomendaciones: ["Recomendación 1"],
  kpis: [{ label: "Avance", value: "80%" }],
  trabajos: [],
  evidencias: [],
  modo: "ejecutivo",
};

async function paginas(modo: ReporteData["modo"]): Promise<number> {
  const blob = await pdf(createElement(ReporteDoc, { data: { ...base, modo } }) as any).toBlob();
  const texto = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  return (texto.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe("carátula del reporte PDF", () => {
  it("el modo ejecutivo (reporte final al cliente) incluye una página de carátula", async () => {
    const conCaratula = await paginas("ejecutivo");
    const sinCaratula = await paginas("interno");
    expect(conCaratula).toBe(sinCaratula + 1);
  }, 60000);
});
