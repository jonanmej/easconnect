import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRol, STAFF } from "@/lib/auth-roles";
import { humanizarTexto } from "@/lib/humanizar-texto";
import { construirSystemPrompt, FORMATO_RESPUESTA_IA, cifrasPermitidas, verificarCifras } from "@/lib/reporte-ia";
import { SV_OFFSET, extraerTextoPdf } from "./helpers";

/**
 * Convierte un PDF adjunto a una OT en un reporte en BORRADOR con la
 * plantilla oficial EA. La IA solo reestructura el texto del PDF; las cifras
 * se verifican contra el propio PDF. Las fotos del PDF se incluyen solas al
 * descargar el reporte (mismo cliente, planta y fecha).
 */
export const convertirPdfAReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireRol(context.supabase, context.userId, STAFF, "Solo administradores o supervisores pueden convertir PDFs en reportes.");
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY no configurada");
    const sb = context.supabase;

    const { data: pdfRow, error } = await sb.from("trabajo_reportes_pdf")
      .select("id, fecha, nombre_original, storage_path, trabajo_id").eq("id", data.id).single();
    if (error || !pdfRow) throw new Error("PDF no encontrado");
    const { data: trab } = await sb.from("trabajos")
      .select("folio, servicio, nombre_trabajo, planta_id, plantas(nombre, cliente_id, clientes(nombre))")
      .eq("id", pdfRow.trabajo_id).single();
    const t: any = trab;
    if (!t?.plantas?.cliente_id) throw new Error("La OT no tiene cliente asociado");

    const { data: file, error: dErr } = await sb.storage.from("trabajos-evidencia").download(pdfRow.storage_path);
    if (dErr || !file) throw new Error("No se pudo leer el PDF");
    const texto = await extraerTextoPdf(new Uint8Array(await file.arrayBuffer()));
    if (!texto || texto.trim().length < 40) {
      throw new Error("El PDF no tiene texto legible (puede ser un escaneo). No se puede convertir.");
    }

    const fecha = String(pdfRow.fecha).slice(0, 10);
    const cliente = t.plantas.clientes?.nombre ?? "Cliente";
    const planta = t.plantas.nombre ?? "";
    const servicio = t.nombre_trabajo || t.servicio || "Servicio técnico";
    const system = construirSystemPrompt("cliente") +
      "\n\nEstás reestructurando un reporte técnico existente al formato institucional EA. Conserva fielmente toda la información técnica, mediciones y conclusiones del documento; no agregues datos que no estén en él.";
    const prompt = `Reestructura el siguiente reporte de campo como reporte EA para el cliente "${cliente}", planta "${planta}", OT ${t.folio ?? ""}, servicio "${servicio}", fecha ${fecha}.

Contenido del documento:
"""
${texto}
"""
${FORMATO_RESPUESTA_IA}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateReportText } = await import("./ia.server");
    const permitidas = cifrasPermitidas([texto], fecha, t.folio ?? "");
    const drafted = await generateReportText({
      system, prompt, pdfParts: [], legacyProvider: "auto",
      permittedFigures: Array.from(permitidas),
      canonicalNames: [cliente, planta].filter(Boolean), protectedNames: [],
    }, { apiKey, admin: supabaseAdmin });
    const ai = {
      titulo: humanizarTexto(drafted.texto.titulo),
      resumen: humanizarTexto(drafted.texto.resumen),
      hallazgos: drafted.texto.hallazgos.map(humanizarTexto),
      recomendaciones: drafted.texto.recomendaciones.map(humanizarTexto),
    };
    const sinRespaldo = verificarCifras(ai, permitidas);
    const markdown = [
      `# ${ai.titulo}`, ``,
      `**Cliente:** ${cliente} · **Planta:** ${planta} · **OT:** ${t.folio ?? "—"} · **Fecha:** ${fecha}`, ``,
      `## Resumen ejecutivo`, ai.resumen, ``,
      `## Hallazgos`, ...ai.hallazgos.map((h) => `- ${h}`), ``,
      `## Recomendaciones`, ...ai.recomendaciones.map((r) => `- ${r}`),
    ].join("\n");

    const { data: row, error: iErr } = await sb.from("reportes").insert({
      cliente_id: t.plantas.cliente_id,
      planta_id: t.planta_id,
      periodo: fecha,
      titulo: ai.titulo,
      contenido_markdown: markdown,
      insight_resumen: ai.resumen.slice(0, 280),
      estado: "borrador",
      generado_por: context.userId,
      model_used: drafted.procedencia.modelo,
      desde: `${fecha}T00:00:00.000${SV_OFFSET}`,
      hasta: `${fecha}T23:59:59.999${SV_OFFSET}`,
      indicadores: [],
      tipo_reporte: "final",
      revision_ia_pendiente: sinRespaldo.length > 0,
      revision_ia_detalle: {
        cifras_sin_respaldo: sinRespaldo,
        procedencia_ia: drafted.procedencia,
        origen_pdf: { id: pdfRow.id, nombre: pdfRow.nombre_original },
      },
    } as any).select("id").single();
    if (iErr) throw new Error(iErr.message);
    return { id: row.id, titulo: ai.titulo, revision: sinRespaldo.length > 0 };
  });
