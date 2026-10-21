import { z } from "zod";
import { ZTextoReporte, parseJsonIA, type TextoReporte } from "@/lib/reporte-ia";

export const CLAUDE_REPORT_MODEL = "anthropic/claude-sonnet-5";
export const REPORT_AI_CONFIG_KEY = "report_ai_provider";
export const REPORT_AI_BLOCK_KEY = "report_ai_terminal_block";
export const ReportProviderSchema = z.enum(["lovable", "anthropic"]);
export type ReportProvider = z.infer<typeof ReportProviderSchema>;
export const ProvenanceSchema = z.object({
  proveedor: ReportProviderSchema,
  modelo: z.string(),
  fecha: z.string().datetime(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;
export const PdfPartSchema = z.object({
  type: z.literal("file"),
  file: z.object({ filename: z.string(), file_data: z.string() }),
});
export const ReportInputSchema = z.object({
  system: z.string(),
  prompt: z.string(),
  pdfParts: z.array(PdfPartSchema).default([]),
  legacyProvider: z.enum(["auto", "gemini", "openai"]).default("auto"),
  permittedFigures: z.array(z.string()),
  canonicalNames: z.array(z.string()).default([]),
  protectedNames: z.array(z.object({ token: z.string(), valor: z.string() })).default([]),
});
export type ReportInput = z.infer<typeof ReportInputSchema>;
export type DraftedReport = { texto: TextoReporte; procedencia: Provenance };

export class ReportAiError extends Error {
  constructor(public readonly reason: string, public readonly status = 0, public readonly terminal = false,
    message = "No se pudo completar la redacción del reporte.") {
    super(message);
    this.name = "ReportAiError";
  }
}

export function parseReportText(text: string): TextoReporte {
  try { return ZTextoReporte.parse(parseJsonIA(text)); }
  catch { throw new ReportAiError("invalid_json", 0, false, "La redacción recibida no tiene el formato esperado."); }
}

export function selectReportProvider(configured: unknown): ReportProvider {
  return configured === "anthropic" ? "anthropic" : "lovable";
}

export function canFallback(error: unknown): boolean {
  return error instanceof ReportAiError && !error.terminal &&
    (error.reason === "invalid_json" || error.reason === "network" || error.status === 429 || error.status >= 500);
}

/** Transport-neutral orchestration; tests inject calls, never real APIs. */
export async function draftWithProvider(options: {
  provider: ReportProvider;
  callClaude: (repair: boolean) => Promise<DraftedReport>;
  callLovable: () => Promise<DraftedReport>;
  logFallback: (reason: string) => void;
}): Promise<DraftedReport> {
  if (options.provider === "lovable") return options.callLovable();
  try {
    try { return await options.callClaude(false); }
    catch (error) {
      if (error instanceof ReportAiError && error.reason === "invalid_json") return await options.callClaude(true);
      throw error;
    }
  } catch (error) {
    if (!canFallback(error)) throw error;
    options.logFallback(error instanceof ReportAiError ? error.reason : "unknown");
    return options.callLovable();
  }
}

export function ensureDraft(state: string) {
  if (state !== "borrador") throw new Error("Solo se puede comparar o elegir redacción en un borrador.");
}

export function reportProvenance(detail: unknown): Provenance | null {
  if (!detail || typeof detail !== "object" || !("procedencia_ia" in detail)) return null;
  const parsed = ProvenanceSchema.safeParse(detail.procedencia_ia);
  return parsed.success ? parsed.data : null;
}