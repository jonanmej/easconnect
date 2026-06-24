import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-2.5-flash";
const MODEL_FALLBACK = "google/gemini-2.5-flash-lite";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      enviado_a: z.string().email().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: any = { estado: "enviado", enviado_at: new Date().toISOString() };
    if (data.enviado_a) patch.enviado_a = data.enviado_a;
    const { error } = await context.supabase
      .from("reportes")
      .update(patch)
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

    // Reportes base llenados por técnicos en cada OT
    const trabajoIds = (trabajosRes.data ?? []).map((t: any) => t.folio ? t : null).filter(Boolean);
    const { data: tIds } = plantasIds.length
      ? await supabase.from("trabajos").select("id, folio").in("planta_id", plantasIds).gte("fecha_programada", data.desde).lte("fecha_programada", data.hasta)
      : { data: [] as any[] };
    const tIdsArr = (tIds ?? []).map((t: any) => t.id);
    const folioPorId = new Map((tIds ?? []).map((t: any) => [t.id, t.folio]));
    const { data: reportesBase } = tIdsArr.length
      ? await supabase.from("trabajo_reportes")
          .select("trabajo_id, condiciones_sitio, trabajo_realizado, hallazgos, recomendaciones, materiales_usados, cliente_observaciones")
          .in("trabajo_id", tIdsArr)
      : { data: [] as any[] };

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
        reportes_tecnicos: (reportesBase ?? []).length,
      },
      muestras_trabajos: trabajos.slice(0, 20),
      muestras_mantenimientos: (mantenimientos ?? []).slice(0, 20),
      reportes_tecnicos: (reportesBase ?? []).slice(0, 20).map((r: any) => ({
        folio: folioPorId.get(r.trabajo_id) ?? null,
        condiciones_sitio: r.condiciones_sitio,
        trabajo_realizado: r.trabajo_realizado,
        hallazgos: r.hallazgos,
        recomendaciones: r.recomendaciones,
        materiales_usados: r.materiales_usados,
        observaciones_cliente: r.cliente_observaciones,
      })),
    };

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);

    let aiResult!: { titulo: string; resumen: string; kpis: { label: string; value: string }[]; hallazgos: string[]; recomendaciones: string[] };
    const ZReporte = z.object({
      titulo: z.string(),
      resumen: z.string(),
      kpis: z.array(z.object({ label: z.string(), value: z.string() })),
      hallazgos: z.array(z.string()),
      recomendaciones: z.array(z.string()),
    });
    const system = "Eres un analista senior de mantenimiento solar y térmico. Generas reportes ejecutivos claros en español, basados estrictamente en los datos provistos. No inventes números. Tono profesional, conciso, accionable.";
    const prompt = `Genera un reporte ejecutivo para el cliente "${datasetCtx.cliente}" sobre el periodo ${datasetCtx.periodo} (${data.desde} a ${data.hasta}).

Datos:
${JSON.stringify(datasetCtx, null, 2)}

Responde EXCLUSIVAMENTE con un objeto JSON válido (sin markdown, sin \`\`\`, sin texto adicional) con esta forma exacta:
{
  "titulo": "string (título atractivo)",
  "resumen": "string (resumen ejecutivo de 2-3 párrafos)",
  "kpis": [{"label": "string", "value": "string"}],  // 3 a 5 elementos
  "hallazgos": ["string"],                           // 2 a 4 elementos
  "recomendaciones": ["string"]                      // 2 a 4 elementos
}`;

    const parseJson = (raw: string): unknown => {
      let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const start = s.search(/[\{\[]/);
      const end = s.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("Respuesta sin JSON");
      s = s.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(s);
    };

    const attempts: Array<{ model: string; wait: number }> = [
      { model: MODEL, wait: 0 },
      { model: MODEL, wait: 1500 },
      { model: MODEL_FALLBACK, wait: 2500 },
      { model: MODEL_FALLBACK, wait: 5000 },
    ];
    let lastErr: any = null;
    let ok = false;
    for (const a of attempts) {
      if (a.wait) await sleep(a.wait);
      try {
        const result = await generateText({ model: gateway(a.model), system, prompt });
        aiResult = ZReporte.parse(parseJson(result.text));
        ok = true;
        break;
      } catch (e: any) {
        lastErr = e;
        const msg = e?.message || String(e);
        if (/402|credit/i.test(msg)) throw new Error("Créditos de IA agotados. Recarga créditos en Ajustes para continuar.");
        // Reintentar también en errores de schema/parse o saturación
      }
    }
    if (!ok) {
      const msg = lastErr?.message || String(lastErr);
      throw new Error(`Servicio de IA saturado. Reintenta en unos minutos. (${msg})`);
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

/** Devuelve el dataset completo necesario para armar el PDF (trabajos + evidencias firmadas). */
export const getReporteParaPDF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const supabase = context.supabase;
    const { data: rep, error } = await supabase
      .from("reportes")
      .select("*, clientes(nombre, contacto), plantas(nombre)")
      .eq("id", data.id).single();
    if (error) throw new Error(error.message);

    // Parse KPIs/hallazgos del markdown
    const md = (rep as any).contenido_markdown ?? "";
    const section = (name: string) => {
      const re = new RegExp(`## ${name}\\n([\\s\\S]*?)(\\n## |$)`);
      return re.exec(md)?.[1]?.trim() ?? "";
    };
    const parseBullets = (s: string) => s.split("\n").map((l) => l.replace(/^[-*]\s+/, "").trim()).filter(Boolean);
    const kpisRaw = parseBullets(section("KPIs"));
    const kpis = kpisRaw.map((l) => {
      const m = /\*\*(.+?):\*\*\s*(.+)/.exec(l) ?? /^([^:]+):\s*(.+)/.exec(l);
      return m ? { label: m[1], value: m[2] } : { label: l, value: "" };
    });
    const hallazgos = parseBullets(section("Hallazgos"));
    const recomendaciones = parseBullets(section("Recomendaciones"));
    const resumen = section("Resumen ejecutivo");

    // Trabajos del periodo
    const desde = (rep as any).desde ?? null;
    const hasta = (rep as any).hasta ?? null;
    let plantasIds: string[] = [];
    if ((rep as any).planta_id) plantasIds = [(rep as any).planta_id];
    else {
      const { data: ps } = await supabase.from("plantas").select("id").eq("cliente_id", (rep as any).cliente_id);
      plantasIds = (ps ?? []).map((p) => p.id);
    }
    let qb = supabase.from("trabajos")
      .select("id, folio, servicio, fecha_programada, estado, notas")
      .in("planta_id", plantasIds)
      .order("fecha_programada");
    if (desde) qb = qb.gte("fecha_programada", desde);
    if (hasta) qb = qb.lte("fecha_programada", hasta);
    const { data: trabajos } = await qb;

    const trabajoIds = (trabajos ?? []).map((t) => t.id);
    let evidencias: { trabajo: string; descripcion: string | null; url: string }[] = [];
    if (trabajoIds.length) {
      const { data: evs } = await supabase
        .from("trabajo_evidencias")
        .select("trabajo_id, storage_path, descripcion")
        .in("trabajo_id", trabajoIds)
        .limit(40);
      if (evs?.length) {
        const folioPorId = new Map((trabajos ?? []).map((t) => [t.id, t.folio]));
        const { data: signed } = await supabase.storage
          .from("trabajos-evidencia")
          .createSignedUrls(evs.map((e) => e.storage_path), 3600);
        const urlByPath = new Map((signed ?? []).map((s) => [s.path!, s.signedUrl]));
        evidencias = evs.map((e) => ({
          trabajo: folioPorId.get(e.trabajo_id) ?? "—",
          descripcion: e.descripcion ?? null,
          url: urlByPath.get(e.storage_path) ?? "",
        })).filter((e) => e.url);
      }
    }

    // Series para gráficas (origen visible en el PDF)
    const trabajosArr = trabajos ?? [];
    const porEstado = new Map<string, number>();
    const porServicio = new Map<string, number>();
    for (const t of trabajosArr) {
      porEstado.set(t.estado, (porEstado.get(t.estado) ?? 0) + 1);
      porServicio.set(t.servicio, (porServicio.get(t.servicio) ?? 0) + 1);
    }
    const { data: equiposPlanta } = plantasIds.length
      ? await supabase.from("equipos").select("nombre, salud").in("planta_id", plantasIds).order("salud", { ascending: true }).limit(8)
      : { data: [] as any[] };
    const graficas: { titulo: string; descripcion?: string; fuente: string; series: { label: string; value: number }[]; unidad?: string }[] = [];
    if (porEstado.size > 0) {
      graficas.push({
        titulo: "Trabajos por estado",
        descripcion: `Distribución de las ${trabajosArr.length} órdenes de trabajo del periodo.`,
        fuente: `Tabla trabajos · planta_id ∈ (${plantasIds.length}) · fecha_programada entre ${desde ?? "—"} y ${hasta ?? "—"}`,
        series: Array.from(porEstado.entries()).map(([k, v]) => ({ label: k, value: v })),
      });
    }
    if (porServicio.size > 0) {
      graficas.push({
        titulo: "Trabajos por tipo de servicio",
        fuente: "Tabla trabajos · campo servicio",
        series: Array.from(porServicio.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([k, v]) => ({ label: k, value: v })),
      });
    }
    if ((equiposPlanta ?? []).some((e: any) => typeof e.salud === "number")) {
      graficas.push({
        titulo: "Salud de equipos (menor a mayor)",
        descripcion: "Top 8 equipos con menor salud reportada — foco de atención preventiva.",
        fuente: "Tabla equipos · campo salud (0–100)",
        unidad: "%",
        series: (equiposPlanta ?? [])
          .filter((e: any) => typeof e.salud === "number")
          .map((e: any) => ({ label: e.nombre, value: e.salud })),
      });
    }

    return {
      titulo: (rep as any).titulo,
      cliente: (rep as any).clientes?.nombre ?? "—",
      contacto: (rep as any).clientes?.contacto ?? null,
      planta: (rep as any).plantas?.nombre ?? "Todas las plantas",
      periodo: (rep as any).periodo,
      modelo: (rep as any).model_used,
      emitido_at: new Date((rep as any).created_at).toLocaleDateString("es-SV", { year: "numeric", month: "long", day: "numeric" }),
      resumen,
      kpis,
      hallazgos,
      recomendaciones,
      trabajos: (trabajos ?? []).map((t) => ({
        folio: t.folio,
        servicio: t.servicio,
        fecha: new Date(t.fecha_programada).toLocaleDateString("es-SV"),
        estado: t.estado,
        tecnico: null,
        notas: t.notas,
      })),
      evidencias,
      graficas,
      responsable_id: (rep as any).generado_por ?? null,
      reporte_id: (rep as any).id,
    };
  });

/** Devuelve el nombre completo + cargo del usuario que generó el reporte (firma ejecutiva). */
export const getResponsableReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reporte_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rep } = await context.supabase
      .from("reportes").select("generado_por").eq("id", data.reporte_id).single();
    const uid = (rep as any)?.generado_por ?? context.userId;
    const { data: p } = await context.supabase
      .from("profiles").select("display_name, nombres, apellidos, cargo")
      .eq("id", uid).maybeSingle();
    const nombre = p?.nombres && p?.apellidos
      ? `${p.nombres} ${p.apellidos}`.trim()
      : p?.display_name ?? "Equipo EA Service and Consulting";
    return { nombre, cargo: p?.cargo ?? "Responsable Operativo" };
  });