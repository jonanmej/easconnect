import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { humanizarTexto } from "@/lib/humanizar-texto";
import { normalizarNombresCanonicos } from "@/lib/normalizar-nombres";
import { verificarCifras, indicadoresMarkdown, type TextoReporte, type Indicador, ZTextoReporte } from "@/lib/reporte-ia";
import { ReportInputSchema, ProvenanceSchema, type ReportInput, type DraftedReport } from "./ia-contract";

export const SnapshotSchema = z.object({ input: ReportInputSchema, markdownHeader: z.string(),
  indicators: z.array(z.object({ label: z.string(), value: z.string() })) });
export type ReportSnapshot = z.infer<typeof SnapshotSchema>;
export function snapshotKey(id: string) { return `report_ai_input:${id}`; }
export async function saveReportSnapshot(admin: SupabaseClient<Database>, id: string, snapshot: ReportSnapshot, actor: string) {
  const { error } = await admin.from("system_config").upsert({ key: snapshotKey(id), value: snapshot as unknown as Json, updated_by: actor });
  if (error) throw new Error("El reporte se guardó, pero no fue posible registrar sus datos para comparación.");
}

export function normalizeDraft(result: DraftedReport, input: ReportInput): DraftedReport {
  const fix = (value: string) => {
    let restored = value;
    for (const item of input.protectedNames) restored = restored.split(item.token).join(item.valor);
    return humanizarTexto(normalizarNombresCanonicos(restored, input.canonicalNames));
  };
  const t = result.texto;
  return { ...result, texto: { titulo: fix(t.titulo), resumen: fix(t.resumen),
    hallazgos: t.hallazgos.map(fix), recomendaciones: t.recomendaciones.map(fix) } };
}
export function renderDraft(text: TextoReporte, header: string, indicators: Indicador[]) {
  return [`# ${text.titulo}`, "", header, "", "## Resumen ejecutivo", text.resumen, "", "## KPIs",
    ...indicadoresMarkdown(indicators), "", "## Hallazgos", ...text.hallazgos.map((h) => `- ${h}`),
    "", "## Recomendaciones", ...text.recomendaciones.map((r) => `- ${r}`)].join("\n");
}
export function draftPatch(result: DraftedReport, snapshot: ReportSnapshot) {
  const figures = verificarCifras(result.texto, new Set(snapshot.input.permittedFigures));
  return { titulo: result.texto.titulo, insight_resumen: result.texto.resumen.slice(0, 280),
    contenido_markdown: renderDraft(result.texto, snapshot.markdownHeader, snapshot.indicators),
    model_used: result.procedencia.modelo, revision_ia_pendiente: figures.length > 0,
    revision_ia_detalle: { cifras_sin_respaldo: figures, procedencia_ia: result.procedencia } };
}

const SignedChoiceSchema = z.object({ actor: z.string().uuid(), reportId: z.string().uuid(),
  version: z.number(), updatedAt: z.string(), expires: z.number(),
  result: z.object({ texto: ZTextoReporte, procedencia: ProvenanceSchema }) });
export type SignedChoice = z.infer<typeof SignedChoiceSchema>;
const encoder = new TextEncoder();
function toBase64(bytes: Uint8Array) { return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")); }
function fromBase64(value: string) { return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)); }
async function signingKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signChoice(choice: SignedChoice, secret: string) {
  const payload = toBase64(encoder.encode(JSON.stringify(choice)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64(new Uint8Array(signature))}`;
}
export async function verifyChoice(token: string, secret: string, actor: string, reportId: string, now = Date.now()) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) throw new Error();
    const [payload, signature] = parts;
    if (!payload || !signature || !await crypto.subtle.verify("HMAC", await signingKey(secret), fromBase64(signature), encoder.encode(payload))) throw new Error();
    const choice = SignedChoiceSchema.parse(JSON.parse(new TextDecoder().decode(fromBase64(payload))));
    if (choice.actor !== actor || choice.reportId !== reportId || choice.expires < now) throw new Error();
    return choice;
  } catch { throw new Error("La comparación venció o no corresponde a este reporte. Genera una nueva comparación."); }
}