import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-3-flash-preview";

export const listReportes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("reportes")
      .select("id, cliente_id, planta_id, periodo, titulo, insight_resumen, estado, model_used, created_at, clientes(nombre), plantas(nombre)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...r,
      cliente_nombre: r.clientes?.nombre ?? "—",
      planta_nombre: r.plantas?.nombre ?? null,
    }));
  });

export const getReporte = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("reportes")
      .select("*, clientes(nombre), plantas(nombre)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const marcarReporteEnviado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("reportes")
      .update({ estado: "enviado" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generarReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cliente_id: z.string().uuid(),
      planta_id: z.string().uuid().nullable().optional(),
      periodo: z.string().min(1),
      desde: z.string().min(1),
      hasta: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY no configurada");

    const supabase = context.supabase;
    const { data: cliente } = await supabase.from("clientes").select("nombre").eq("id", data.cliente_id).single();
    const plantaId = data.planta_id ?? null;
    const { data: planta } = plantaId
      ? await supabase.from("plantas").select("nombre, ubicacion, paneles, capacidad, eficiencia").eq("id", plantaId).single()
      : { data: null };

    let plantasIds: string[] = [];
    if (plantaId) plantasIds = [plantaId];
    else {
      const { data: ps } = await supabase.from("plantas").select("id").eq("cliente_id", data.cliente_id);
      plantasIds = (ps ?? []).map((p) => p.id);
    }

    const [trabajosRes, equiposRes] = await Promise.all([
      plantasIds.length
        ? supabase.from("trabajos")
            .select("folio, servicio, estado, fecha_programada")
            .in("planta_id", plantasIds)
            .gte("fecha_programada", data.desde)
            .lte("fecha_programada", data.hasta)
        : Promise.resolve({ data: [] as any[] }),
      plantasIds.length
        ? supabase.from("equipos").select("codigo, nombre, estado, salud").in("planta_id", plantasIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const trabajos = trabajosRes.data ?? [];
    const equipos = equiposRes.data ?? [];
    const equipoIds = equipos.length
      ? (await supabase.from("equipos").select("id").in("planta_id", plantasIds)).data?.map((e: any) => e.id) ?? []
      : [];
    const { data: mantenimientos } = equipoIds.length
      ? await supabase.from("mantenimientos").select("tipo, fecha, horas, estado").in("equipo_id", equipoIds).gte("fecha", data.desde).lte("fecha", data.hasta)
      : { data: [] as any[] };

    const saludVals = equipos.map((e: any) => e.salud).filter((s: any) => typeof s === "number");
    const saludProm = saludVals.length ? Math.round(saludVals.reduce((a: number, b: number) => a + b, 0) / saludVals.length) : null;

    const datasetCtx = {
      cliente: cliente?.nombre,
      planta: planta?.nombre ?? "Todas las plantas",
      periodo: data.periodo,
      ventana: { desde: data.desde, hasta: data.hasta },
      planta_meta: planta ?? null,
      kpis: {
        trabajos_total: trabajos.length,
        trabajos_completados: trabajos.filter((t: any) => t.estado === "completado").length,
        equipos: equipos.length,
        salud_promedio: saludProm,
        mantenimientos: (mantenimientos ?? []).length,
      },
      muestras_trabajos: trabajos.slice(0, 20),
      muestras_mantenimientos: (mantenimientos ?? []).slice(0, 20),
    };

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);

    let aiResult: { titulo: string; resumen: string; kpis: { label: string; value: string }[]; hallazgos: string[]; recomendaciones: string[] };
    try {
      const result = await generateText({
        model: gateway(MODEL),
        experimental_output: Output.object({
          schema: z.object({
            titulo: z.string(),
            resumen: z.string(),
            kpis: z.array(z.object({ label: z.string(), value: z.string() })),
            hallazgos: z.array(z.string()),
            recomendaciones: z.array(z.string()),
          }),
        }),
        system: "Eres un analista senior de mantenimiento solar y térmico. Generas reportes ejecutivos claros en español, basados estrictamente en los datos provistos. No inventes números. Tono profesional, conciso, accionable.",
        prompt: `Genera un reporte ejecutivo para el cliente "${datasetCtx.cliente}" sobre el periodo ${datasetCtx.periodo} (${data.desde} a ${data.hasta}). Datos:\n\n${JSON.stringify(datasetCtx, null, 2)}\n\nResponde con: título atractivo, resumen ejecutivo (2-3 párrafos), 3-5 KPIs (label + value), 2-4 hallazgos clave y 2-4 recomendaciones priorizadas.`,
      });
      aiResult = (result as any).experimental_output;
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (/429|rate/i.test(msg)) throw new Error("Límite de uso de IA alcanzado. Reintenta en unos minutos.");
      if (/402|credit/i.test(msg)) throw new Error("Créditos de IA agotados. Recarga créditos en Ajustes para continuar.");
      throw new Error(`Fallo al generar con IA: ${msg}`);
    }

    const markdown = [
      `# ${aiResult.titulo}`,
      ``,
      `**Cliente:** ${datasetCtx.cliente} · **Planta:** ${datasetCtx.planta} · **Periodo:** ${datasetCtx.periodo}`,
      ``,
      `## Resumen ejecutivo`,
      aiResult.resumen,
      ``,
      `## KPIs`,
      ...aiResult.kpis.map((k) => `- **${k.label}:** ${k.value}`),
      ``,
      `## Hallazgos`,
      ...aiResult.hallazgos.map((h) => `- ${h}`),
      ``,
      `## Recomendaciones`,
      ...aiResult.recomendaciones.map((r) => `- ${r}`),
    ].join("\n");

    const { data: row, error } = await supabase.from("reportes").insert({
      cliente_id: data.cliente_id,
      planta_id: plantaId,
      periodo: data.periodo,
      titulo: aiResult.titulo,
      contenido_markdown: markdown,
      insight_resumen: aiResult.resumen.slice(0, 280),
      estado: "borrador",
      generado_por: context.userId,
      model_used: MODEL,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });