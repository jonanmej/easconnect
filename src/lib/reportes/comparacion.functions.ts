import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRol } from "@/lib/auth-roles";
import { ensureDraft, ReportProviderSchema, REPORT_AI_CONFIG_KEY, REPORT_AI_BLOCK_KEY, CLAUDE_REPORT_MODEL } from "./ia-contract";

export const getReportAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireRol(context.supabase, context.userId, ["admin"]);
    const { configuredReportProvider } = await import("./ia.server");
    const provider = await configuredReportProvider(context.supabase);
    const { data: block, error } = await context.supabase.from("system_config").select("key").eq("key", REPORT_AI_BLOCK_KEY).maybeSingle();
    if (error) throw new Error("No se pudo leer el estado de IA.");
    return { provider, paused: Boolean(block), claudeModel: CLAUDE_REPORT_MODEL };
  });

export const setReportAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: ReportProviderSchema, resume: z.boolean().default(false) }).parse(d))
  .handler(async ({ context, data }) => {
    await requireRol(context.supabase, context.userId, ["admin"]);
    if (String(context.claims.email ?? "").toLowerCase() !== "proyectos@easervice.app")
      throw new Error("Solo el dueño puede activar Claude o reanudar la IA de reportes.");
    const { error } = await context.supabase.from("system_config").upsert({ key: REPORT_AI_CONFIG_KEY,
      value: { provider: data.provider }, updated_by: context.userId });
    if (error) throw new Error("No se pudo guardar el proveedor de reportes.");
    if (data.resume) {
      const { error: del } = await context.supabase.from("system_config").delete().eq("key", REPORT_AI_BLOCK_KEY);
      if (del) throw new Error("No se pudo reanudar la IA de reportes.");
    }
    return { ok: true };
  });

export const compararRedaccion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireRol(context.supabase, context.userId, ["admin"]);
    const { data: rep, error } = await context.supabase.from("reportes").select("estado, version, updated_at, contenido_markdown")
      .eq("id", data.id).single();
    if (error || !rep) throw new Error("Reporte no encontrado.");
    ensureDraft(rep.estado);
    const { SnapshotSchema, snapshotKey, normalizeDraft, signChoice } = await import("./ia-snapshot.server");
    const { data: saved, error: readError } = await context.supabase.from("system_config").select("value")
      .eq("key", snapshotKey(data.id)).maybeSingle();
    if (readError) throw new Error("No se pudieron leer los datos de la comparación.");
    const parsed = SnapshotSchema.safeParse(saved?.value);
    if (!parsed.success) throw new Error("Este borrador no conserva sus datos originales de IA. Genera un nuevo reporte para comparar con las mismas fuentes.");
    const apiKey = process.env.LOVABLE_API_KEY;
    const signingSecret = process.env.REPORT_AI_COMPARISON_SIGNING_SECRET;
    if (!apiKey || !signingSecret) throw new Error("La comparación de reportes no está configurada.");
    const { generateReportText } = await import("./ia.server");
    // Sequential calls share a single immutable input and cannot save report content.
    const results = [];
    for (const provider of ["anthropic", "lovable"] as const) {
      const result = normalizeDraft(await generateReportText(parsed.data.input, {
        apiKey, admin: context.supabase, provider, allowFallback: false,
      }), parsed.data.input);
      const token = await signChoice({ actor: context.userId, reportId: data.id, version: rep.version,
        updatedAt: rep.updated_at, expires: Date.now() + 30 * 60 * 1000, result }, signingSecret);
      const { verificarCifras } = await import("@/lib/reporte-ia");
      results.push({ ...result, token, cifras: verificarCifras(result.texto, new Set(parsed.data.input.permittedFigures)) });
    }
    return results;
  });

export const adoptarRedaccion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), token: z.string().max(200000) }).parse(d))
  .handler(async ({ context, data }) => {
    await requireRol(context.supabase, context.userId, ["admin"]);
    const secret = process.env.REPORT_AI_COMPARISON_SIGNING_SECRET;
    if (!secret) throw new Error("La comparación no está configurada.");
    const { verifyChoice, SnapshotSchema, snapshotKey, draftPatch } = await import("./ia-snapshot.server");
    const choice = await verifyChoice(data.token, secret, context.userId, data.id);
    const { data: rep, error } = await context.supabase.from("reportes").select("estado, version, updated_at")
      .eq("id", data.id).single();
    if (error || !rep) throw new Error("Reporte no encontrado.");
    ensureDraft(rep.estado);
    if (rep.version !== choice.version || rep.updated_at !== choice.updatedAt)
      throw new Error("El borrador cambió desde la comparación. Genera una nueva comparación.");
    const { data: saved } = await context.supabase.from("system_config").select("value").eq("key", snapshotKey(data.id)).single();
    const snapshot = SnapshotSchema.safeParse(saved?.value);
    if (!snapshot.success) throw new Error("Los datos originales de comparación ya no están disponibles.");
    const patch = draftPatch(choice.result, snapshot.data);
    const { data: updated, error: updateError } = await context.supabase.from("reportes").update(patch)
      .eq("id", data.id).eq("estado", "borrador").eq("version", choice.version).eq("updated_at", choice.updatedAt).select("id").maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error("El borrador cambió. No se guardó esta elección.");
    return { ok: true, revisionPendiente: patch.revision_ia_pendiente };
  });