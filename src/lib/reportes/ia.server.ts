import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, streamText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { createLovableAiGatewayRunIdFetch } from "@/lib/ai/run-id.server";
import { buildAttempts, sleep } from "./helpers";
import { CLAUDE_REPORT_MODEL, REPORT_AI_BLOCK_KEY, REPORT_AI_CONFIG_KEY, ReportAiError,
  draftWithProvider, parseReportText, selectReportProvider, type DraftedReport, type ReportInput,
  type ReportProvider } from "./ia-contract";

type AdminClient = SupabaseClient<Database>;

function safeReason(status: number) {
  if (status === 401) return "configuration";
  if (status === 402) return "credits";
  if (status === 403) return "denied";
  if (status === 404) return "unavailable";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "upstream";
  return "request";
}

async function checkedFetch(admin: AdminClient, input: RequestInfo | URL, init?: RequestInit) {
  let response: Response;
  try { response = await fetch(input, init); }
  catch { throw new ReportAiError("network", 0, false, "No se pudo conectar con el servicio de redacción."); }
  if (!response.ok) {
    const status = response.status;
    // Only the gateway's safe message is returned, never raw upstream bodies/headers.
    const body = await response.clone().json().catch(() => null);
    const safeMessage = typeof body?.message === "string" ? body.message :
      typeof body?.error?.message === "string" ? body.error.message : "El servicio de IA no está disponible.";
    const terminal = status !== 429 && status < 500;
    const reason = safeReason(status);
    console.warn("[report-ai] request_failed", { status, reason });
    if ([401, 402, 403, 404].includes(status)) {
      const { error } = await admin.from("system_config").upsert({ key: REPORT_AI_BLOCK_KEY,
        value: { status, reason, message: safeMessage, date: new Date().toISOString() } });
      if (error) throw new ReportAiError("block_persistence", status, true, "No se pudo registrar la pausa del servicio de IA.");
    }
    throw new ReportAiError(reason, status, terminal, safeMessage);
  }
  return response;
}

export async function configuredReportProvider(admin: AdminClient): Promise<ReportProvider> {
  const { data, error } = await admin.from("system_config").select("value").eq("key", REPORT_AI_CONFIG_KEY).maybeSingle();
  if (error) throw new Error("No se pudo leer la configuración de IA de reportes.");
  const v = data?.value;
  return selectReportProvider(v && typeof v === "object" && !Array.isArray(v) ? v.provider : null);
}

export async function generateReportText(input: ReportInput, options: {
  apiKey: string; admin: AdminClient; provider?: ReportProvider; allowFallback?: boolean;
}): Promise<DraftedReport> {
  const { data: block, error } = await options.admin.from("system_config").select("value")
    .eq("key", REPORT_AI_BLOCK_KEY).maybeSingle();
  if (error) throw new Error("No se pudo comprobar el estado del servicio de IA.");
  if (block) {
    const v = block.value;
    throw new ReportAiError("paused", 403, true,
      v && typeof v === "object" && !Array.isArray(v) && typeof v.message === "string"
        ? v.message : "IA de reportes pausada. El dueño debe restablecer el acceso y reanudarla.");
  }
  const provider = options.provider ?? await configuredReportProvider(options.admin);
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  // Each wrapper is request-local; reuse only gateway-issued run IDs.
  const transport: typeof fetch = (url, init) => {
    const h = new Headers(init?.headers);
    const id = runIdFetch.getRunId();
    if (id) h.set("X-Lovable-AIG-Run-ID", id);
    return checkedFetch(options.admin, url, { ...init, headers: h });
  };
  const anthropic = createAnthropic({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey: options.apiKey,
    headers: { "X-Lovable-AIG-SDK": "vercel-ai-sdk" }, fetch: transport });
  const callClaude = async (repair: boolean): Promise<DraftedReport> => {
    const pdfs = input.pdfParts.map((p) => ({ type: "file" as const,
      data: p.file.file_data, mediaType: "application/pdf", filename: p.file.filename }));
    const result = streamText({ model: anthropic(CLAUDE_REPORT_MODEL), maxRetries: 0,
      maxOutputTokens: 8192, system: input.system,
      messages: [{ role: "user", content: [{ type: "text", text: input.prompt +
        (repair ? "\nCorrige el formato: entrega solo el JSON completo solicitado con titulo, resumen, hallazgos y recomendaciones. No cambies cifras." : "") }, ...pdfs] }],
      providerOptions: { anthropic: { thinking: { type: "adaptive" }, effort: "low" } } });
    let text = "";
    for await (const part of result.fullStream) {
      if (part.type === "error") throw part.error;
      if (part.type === "text-delta") text += part.text;
    }
    const finish = await result.finishReason;
    const raw = await result.rawFinishReason;
    if (raw === "refusal" || finish === "content-filter")
      throw new ReportAiError("refusal", 0, true, "El proveedor rechazó esta solicitud de redacción.");
    if (finish !== "stop") throw new ReportAiError("incomplete", 0, true, "La redacción de Claude no se completó. No se guardó ningún resultado parcial.");
    return { texto: parseReportText(text), procedencia: { proveedor: "anthropic", modelo: CLAUDE_REPORT_MODEL, fecha: new Date().toISOString() } };
  };
  const callLovable = async (): Promise<DraftedReport> => {
    const gateway = createLovableAiGatewayProvider(options.apiKey);
    let last: unknown;
    for (const attempt of buildAttempts(input.legacyProvider)) {
      if (attempt.wait) await sleep(attempt.wait);
      try {
        let text: string;
        if (input.pdfParts.length) {
          const response = await transport("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", "Lovable-API-Key": options.apiKey,
              "X-Lovable-AIG-SDK": "fetch" },
            body: JSON.stringify({ model: attempt.model, messages: [{ role: "system", content: input.system },
              { role: "user", content: [{ type: "text", text: input.prompt }, ...input.pdfParts] }] }) });
          const json = await response.json();
          if (json?.choices?.[0]?.finish_reason === "content_filter")
            throw new ReportAiError("refusal", 0, true, "El proveedor rechazó esta solicitud de redacción.");
          text = json?.choices?.[0]?.message?.content ?? "";
        } else {
          // Preserve the existing Lovable models/output limits and its SDK path.
          const result = await generateText({ model: gateway(attempt.model), system: input.system, prompt: input.prompt, maxRetries: 0 });
          if (result.finishReason === "content-filter") throw new ReportAiError("refusal", 0, true, "El proveedor rechazó esta solicitud de redacción.");
          text = result.text;
        }
        return { texto: parseReportText(text), procedencia: { proveedor: "lovable", modelo: attempt.model, fecha: new Date().toISOString() } };
      } catch (err) {
        if (err instanceof ReportAiError && err.terminal) throw err;
        // SDK errors are classified without logging prompts, raw errors or credentials.
        const status = err && typeof err === "object" && "statusCode" in err && typeof err.statusCode === "number" ? err.statusCode : 0;
        if (status && status !== 429 && status < 500) {
          throw new ReportAiError(safeReason(status), status, true, "El servicio de IA rechazó la solicitud. Revisa su configuración o disponibilidad.");
        }
        last = err;
      }
    }
    throw last instanceof ReportAiError ? last : new ReportAiError("upstream", 503, false, "Servicio de IA saturado. Reintenta en unos minutos.");
  };
  if (provider === "anthropic" && options.allowFallback === false) return callClaude(false);
  return draftWithProvider({ provider, callClaude, callLovable,
    logFallback: (reason) => console.warn("[report-ai] fallback_to_lovable", { reason }) });
}