import { describe, it, expect, vi } from "vitest";
import { draftWithProvider, selectReportProvider, parseReportText, ReportAiError, type DraftedReport } from "@/lib/reportes/ia-contract";
import { buildSnapshotRecord, SNAPSHOT_MAX_BYTES } from "@/lib/reportes/ia-snapshot-record";
import { verificarCifras, cifrasPermitidas } from "@/lib/reporte-ia";

const texto = { titulo: "Reporte", resumen: "Avance 85%", hallazgos: ["h"], recomendaciones: ["r"] };
const draft = (proveedor: "lovable" | "anthropic"): DraftedReport =>
  ({ texto, procedencia: { proveedor, modelo: proveedor === "anthropic" ? "anthropic/claude-sonnet-5" : "google/gemini-2.5-flash", fecha: new Date().toISOString() } });
const run = (provider: "lovable" | "anthropic", callClaude: (r: boolean) => Promise<DraftedReport>) => {
  const callLovable = vi.fn(async () => draft("lovable"));
  const logFallback = vi.fn();
  return { callLovable, logFallback, result: draftWithProvider({ provider, callClaude, callLovable, logFallback }) };
};

describe("selección de proveedor", () => {
  it("usa Lovable salvo que se active Claude", () => {
    expect(selectReportProvider(null)).toBe("lovable");
    expect(selectReportProvider("otro")).toBe("lovable");
    expect(selectReportProvider("anthropic")).toBe("anthropic");
  });
  it("con Lovable activo nunca llama a Claude", async () => {
    const claude = vi.fn(async () => draft("anthropic"));
    const { result } = run("lovable", claude);
    expect((await result).procedencia.proveedor).toBe("lovable");
    expect(claude).not.toHaveBeenCalled();
  });
});

describe("respaldo", () => {
  it.each([["red", new ReportAiError("network")], ["límite", new ReportAiError("rate_limit", 429)], ["servidor", new ReportAiError("upstream", 503)]])(
    "error recuperable de %s usa Lovable", async (_n, err) => {
      const { result, logFallback } = run("anthropic", async () => { throw err; });
      expect((await result).procedencia.proveedor).toBe("lovable");
      expect(logFallback).toHaveBeenCalledOnce();
    });
  it.each([401, 402, 403, 404])("error terminal %i no usa respaldo", async (status) => {
    const { result, callLovable } = run("anthropic", async () => { throw new ReportAiError("denied", status, true); });
    await expect(result).rejects.toBeInstanceOf(ReportAiError);
    expect(callLovable).not.toHaveBeenCalled();
  });
  it("rechazo del proveedor no usa respaldo", async () => {
    const { result, callLovable } = run("anthropic", async () => { throw new ReportAiError("refusal", 0, true); });
    await expect(result).rejects.toThrow();
    expect(callLovable).not.toHaveBeenCalled();
  });
});

describe("JSON de la respuesta", () => {
  it("valida campos y rechaza JSON mal formado", () => {
    expect(parseReportText("```json\n" + JSON.stringify(texto) + "\n```")).toEqual(texto);
    expect(() => parseReportText("{titulo: roto")).toThrow(ReportAiError);
    expect(() => parseReportText(JSON.stringify({ titulo: "x" }))).toThrow(ReportAiError);
  });
  it("reintenta una vez y luego usa el respaldo", async () => {
    const claude = vi.fn(async (_r: boolean): Promise<DraftedReport> => ({ texto: parseReportText("no es json"), procedencia: draft("anthropic").procedencia }));
    const { result } = run("anthropic", claude);
    expect((await result).procedencia.proveedor).toBe("lovable");
    expect(claude.mock.calls).toEqual([[false], [true]]);
  });
  it("si el reintento es válido, conserva Claude", async () => {
    const claude = vi.fn(async (repair: boolean): Promise<DraftedReport> => { if (!repair) parseReportText("mal"); return draft("anthropic"); });
    const { result, callLovable } = run("anthropic", claude);
    expect((await result).procedencia.proveedor).toBe("anthropic");
    expect(callLovable).not.toHaveBeenCalled();
  });
});

describe("verificarCifras con respuesta simulada de Claude", () => {
  it("marca cifras inventadas y acepta las de los datos", () => {
    const simulada = parseReportText(JSON.stringify({ titulo: "Limpieza", resumen: "Se intervinieron 1.200 paneles con avance de 85%.",
      hallazgos: ["Potencia recuperada de 37,5 kW"], recomendaciones: ["Revisar 3 zonas"] }));
    const permitidas = cifrasPermitidas({ paneles: 1200, avance: "85%" });
    expect(verificarCifras(simulada, permitidas)).toEqual(["37,5"]);
  });
});

describe("copias para comparar", () => {
  const base = { system: "s", prompt: "p", legacyProvider: "auto" as const, permittedFigures: ["1"], canonicalNames: [], protectedNames: [] };
  it("no guarda el PDF completo, solo referencias", () => {
    const rec = buildSnapshotRecord({ input: { ...base, pdfParts: [{ type: "file", file: { filename: "a.pdf", file_data: "data:application/pdf;base64,AAAA" } }] },
      pdfRefs: [{ storage_path: "t/a.pdf", filename: "a.pdf" }], markdownHeader: "", indicators: [] });
    expect(JSON.stringify(rec)).not.toContain("base64");
    expect(rec).toMatchObject({ pdfRefs: [{ storage_path: "t/a.pdf" }] });
  });
  it("deshabilita la comparación si supera el límite", () => {
    const rec = buildSnapshotRecord({ input: { ...base, prompt: "x".repeat(SNAPSHOT_MAX_BYTES + 1), pdfParts: [] }, pdfRefs: [], markdownHeader: "", indicators: [] });
    expect(rec).toMatchObject({ disabled: true });
  });
});
