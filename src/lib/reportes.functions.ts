import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Proveedor = "gemini" | "openai" | "auto";

const PROVIDER_MODELS: Record<"gemini" | "openai", { primary: string; fallback: string }> = {
  gemini: { primary: "google/gemini-2.5-flash", fallback: "google/gemini-2.5-flash-lite" },
  openai: { primary: "openai/gpt-5-mini", fallback: "openai/gpt-5-nano" },
};

function buildAttempts(proveedor: Proveedor): Array<{ model: string; wait: number }> {
  if (proveedor === "openai") {
    const m = PROVIDER_MODELS.openai;
    return [
      { model: m.primary, wait: 0 },
      { model: m.primary, wait: 1500 },
      { model: m.fallback, wait: 2500 },
      { model: m.fallback, wait: 5000 },
    ];
  }
  if (proveedor === "gemini") {
    const m = PROVIDER_MODELS.gemini;
    return [
      { model: m.primary, wait: 0 },
      { model: m.primary, wait: 1500 },
      { model: m.fallback, wait: 2500 },
      { model: m.fallback, wait: 5000 },
    ];
  }
  // auto: probar Gemini y caer a OpenAI cross-provider
  const g = PROVIDER_MODELS.gemini;
  const o = PROVIDER_MODELS.openai;
  return [
    { model: g.primary, wait: 0 },
    { model: g.fallback, wait: 1500 },
    { model: o.primary, wait: 2500 },
    { model: o.fallback, wait: 4000 },
  ];
}

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

export const eliminarReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data: isSup } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" });
    if (!isAdmin && !isSup) throw new Error("Solo administradores o supervisores pueden eliminar reportes");
    const { error } = await context.supabase.from("reportes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetDatosOperacionales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores pueden reiniciar los datos");
    const { error } = await context.supabase.rpc("reset_operational_data");
    if (error) throw new Error(error.message);
    // Vaciar storage buckets
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (const bucket of ["trabajos-evidencia", "firmas-clientes"]) {
        const { data: files } = await supabaseAdmin.storage.from(bucket).list("", { limit: 1000 });
        if (files?.length) {
          await supabaseAdmin.storage.from(bucket).remove(files.map((f: any) => f.name));
        }
      }
    } catch { /* ignore storage cleanup errors */ }
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
      proveedor: z.enum(["gemini", "openai", "auto"]).optional().default("auto"),
      servicio: z.string().min(1).nullable().optional(),
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
        ? (data.servicio
            ? supabase.from("trabajos")
                .select("folio, servicio, estado, fecha_programada")
                .in("planta_id", plantasIds)
                .gte("fecha_programada", data.desde)
                .lte("fecha_programada", data.hasta)
                .eq("servicio", data.servicio)
            : supabase.from("trabajos")
                .select("folio, servicio, estado, fecha_programada")
                .in("planta_id", plantasIds)
                .gte("fecha_programada", data.desde)
                .lte("fecha_programada", data.hasta))
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
    let tIdsQb: any = null;
    if (plantasIds.length) {
      tIdsQb = supabase.from("trabajos").select("id, folio").in("planta_id", plantasIds).gte("fecha_programada", data.desde).lte("fecha_programada", data.hasta);
      if (data.servicio) tIdsQb = tIdsQb.eq("servicio", data.servicio);
    }
    const { data: tIds } = tIdsQb ? await tIdsQb : { data: [] as any[] };
    const tIdsArr = (tIds ?? []).map((t: any) => t.id);
    const folioPorId = new Map((tIds ?? []).map((t: any) => [t.id, t.folio]));
    const { data: reportesBase } = tIdsArr.length
      ? await supabase.from("trabajo_reportes")
          .select("trabajo_id, condiciones_sitio, trabajo_realizado, hallazgos, recomendaciones, materiales_usados, cliente_observaciones")
          .in("trabajo_id", tIdsArr)
      : { data: [] as any[] };

    // Reportes diarios cargados por técnicos día a día (fuente principal desde el refactor).
    const { data: reportesDiarios } = tIdsArr.length
      ? await supabase.from("trabajo_reportes_diarios")
          .select("trabajo_id, fecha, paneles_limpiados, agua_galones, horas_trabajadas, clima, trabajo_realizado, hallazgos, observaciones, avance_pct")
          .in("trabajo_id", tIdsArr)
          .order("fecha", { ascending: true })
      : { data: [] as any[] };

    // PDFs subidos (caso st.solar u otros).
    const { data: reportesPdf } = tIdsArr.length
      ? await supabase.from("trabajo_reportes_pdf")
          .select("trabajo_id, fecha, nombre_original, notas, storage_path")
          .in("trabajo_id", tIdsArr)
          .order("fecha", { ascending: true })
      : { data: [] as any[] };

    const datasetCtx = {
      cliente: cliente?.nombre,
      planta: planta?.nombre ?? "Todas las plantas",
      periodo: data.periodo,
      servicio: data.servicio ?? "Todos los servicios",
      ventana: { desde: data.desde, hasta: data.hasta },
      planta_meta: planta ?? null,
      kpis: {
        trabajos_total: trabajos.length,
        trabajos_completados: trabajos.filter((t: any) => t.estado === "completado").length,
        equipos: equipos.length,
        salud_promedio: saludProm,
        mantenimientos: (mantenimientos ?? []).length,
        reportes_tecnicos: (reportesBase ?? []).length,
        reportes_diarios: (reportesDiarios ?? []).length,
        paneles_limpiados_periodo: (reportesDiarios ?? []).reduce((s: number, r: any) => s + Number(r.paneles_limpiados ?? 0), 0),
        agua_galones_periodo: Math.round((reportesDiarios ?? []).reduce((s: number, r: any) => s + Number(r.agua_galones ?? 0), 0)),
        horas_trabajadas_periodo: Number((reportesDiarios ?? []).reduce((s: number, r: any) => s + Number(r.horas_trabajadas ?? 0), 0).toFixed(1)),
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
      reportes_diarios: (reportesDiarios ?? []).slice(0, 60).map((r: any) => ({
        folio: folioPorId.get(r.trabajo_id) ?? null,
        fecha: r.fecha,
        avance_pct: r.avance_pct,
        paneles_limpiados: r.paneles_limpiados,
        agua_galones: r.agua_galones,
        horas_trabajadas: r.horas_trabajadas,
        clima: r.clima,
        trabajo_realizado: r.trabajo_realizado,
        hallazgos: r.hallazgos,
        observaciones: r.observaciones,
      })),
    };

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);

    // Descargar y adjuntar PDFs subidos por técnicos al periodo, para que el
    // modelo lea su contenido y consolide el ejecutivo con datos reales.
    const MAX_PDFS = 8;
    const MAX_PDF_BYTES = 75 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
    const pdfParts: Array<{ type: "file"; file: { filename: string; file_data: string } }> = [];
    const pdfsUsados: string[] = [];
    const pdfsOmitidos: string[] = [];
    let totalBytes = 0;
    for (const p of (reportesPdf ?? []).slice(0, MAX_PDFS) as any[]) {
      try {
        const { data: signed } = await supabase.storage
          .from("trabajos-evidencia")
          .createSignedUrl(p.storage_path, 300);
        if (!signed?.signedUrl) { pdfsOmitidos.push(p.nombre_original ?? p.storage_path); continue; }
        const resp = await fetch(signed.signedUrl);
        if (!resp.ok) { pdfsOmitidos.push(p.nombre_original ?? p.storage_path); continue; }
        const buf = new Uint8Array(await resp.arrayBuffer());
        if (buf.byteLength > MAX_PDF_BYTES || totalBytes + buf.byteLength > MAX_TOTAL_BYTES) {
          pdfsOmitidos.push(p.nombre_original ?? p.storage_path);
          continue;
        }
        totalBytes += buf.byteLength;
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.byteLength; i += CHUNK) {
          bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as any);
        }
        const b64 = btoa(bin);
        pdfParts.push({
          type: "file",
          file: {
            filename: p.nombre_original ?? `${p.fecha ?? "reporte"}.pdf`,
            file_data: `data:application/pdf;base64,${b64}`,
          },
        });
        pdfsUsados.push(p.nombre_original ?? p.storage_path);
      } catch {
        pdfsOmitidos.push(p.nombre_original ?? p.storage_path);
      }
    }
    // No exponer nombres/fechas de PDFs al modelo: el reporte no debe citarlos.

    let aiResult!: { titulo: string; resumen: string; kpis: { label: string; value: string }[]; hallazgos: string[]; recomendaciones: string[] };
    const ZReporte = z.object({
      titulo: z.string(),
      resumen: z.string(),
      kpis: z.array(z.object({ label: z.string(), value: z.string() })),
      hallazgos: z.array(z.string()),
      recomendaciones: z.array(z.string()),
    });
    const system = [
      "Eres un analista senior de calidad y mantenimiento solar/térmico de EA SERVICE AND CONSULTING.",
      "Redactas reportes ejecutivos en español, formales y trazables, alineados con ISO 9001:2015 (cláusulas 7.5, 8.5, 9.1 y 10).",
      "Te basas ESTRICTAMENTE en los datos provistos: no inventes cifras, no estimes lo que no esté en el dataset.",
      "Cuando existan PDFs adjuntos, léelos íntegramente y prioriza sus mediciones, tablas y hallazgos por sobre el resumen JSON del dataset.",
      "Cita la naturaleza de la evidencia (registros operativos, mantenimientos, evidencias, reportes técnicos) en lugar de 'según la IA' o 'el modelo'.",
      "NUNCA menciones los archivos PDF adjuntos: no cites nombres de archivo, no digas 'según el PDF', 'en el documento adjunto', 'archivo del día X', ni referencias a fechas de subida, notas del PDF ni al origen documental. Integra la información como propia del análisis operativo.",
      "NUNCA menciones que el reporte fue generado por inteligencia artificial, modelo de lenguaje, IA, chatbot ni nada similar. Habla siempre como el equipo de calidad de la empresa.",
      "Estructura cada hallazgo con: condición observada, evidencia/origen del dato y posible causa. Cada recomendación con: acción, responsable sugerido y criterio de cierre (medible).",
      "Tono profesional, conciso, accionable.",
    ].join(" ");
    const servicioLine = data.servicio
      ? `\n\nIMPORTANTE: El reporte debe centrarse EXCLUSIVAMENTE en el servicio "${data.servicio}". El dataset ya viene filtrado por ese servicio; no menciones otros tipos de servicio.`
      : "";
    const prompt = `Genera un reporte ejecutivo para el cliente "${datasetCtx.cliente}" sobre el periodo ${datasetCtx.periodo} (${data.desde} a ${data.hasta}).${servicioLine}

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

    const proveedor: Proveedor = (data as any).proveedor ?? "auto";
    const attempts = buildAttempts(proveedor);
    let lastErr: any = null;
    let ok = false;
    let modelUsed = attempts[0].model;

    const callWithPdfs = async (model: string): Promise<string> => {
      const body = {
        model,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...pdfParts,
            ],
          },
        ],
      };
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => "")}`);
      const j: any = await r.json();
      return j?.choices?.[0]?.message?.content ?? "";
    };

    for (const a of attempts) {
      if (a.wait) await sleep(a.wait);
      try {
        let text: string;
        if (pdfParts.length > 0 && (a.model.startsWith("google/") || a.model.startsWith("openai/"))) {
          text = await callWithPdfs(a.model);
        } else {
          const result = await generateText({ model: gateway(a.model), system, prompt });
          text = result.text;
        }
        aiResult = ZReporte.parse(parseJson(text));
        modelUsed = a.model;
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
      model_used: modelUsed,
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

/**
 * Genera el reporte ejecutivo final de un trabajo a partir de los reportes
 * diarios cargados por los técnicos + PDFs subidos (caso st.solar).
 * Solo admin/supervisor.
 */
export const generarEjecutivoDesdeDiarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ trabajo_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY no configurada");

    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data: isSup } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" });
    if (!isAdmin && !isSup) throw new Error("Solo administradores o supervisores pueden generar el reporte ejecutivo.");

    const supabase = context.supabase;
    const { data: trabajo, error: tErr } = await supabase
      .from("trabajos")
      .select("id, folio, servicio, fecha_programada, fecha_completado, notas, planta_id, plantas(id, nombre, cliente_id, clientes(id, nombre))")
      .eq("id", data.trabajo_id)
      .single();
    if (tErr) throw new Error(tErr.message);
    const planta = (trabajo as any).plantas;
    const cliente = planta?.clientes;
    if (!cliente?.id) throw new Error("Trabajo sin cliente asociado.");

    const [diariosRes, pdfsRes] = await Promise.all([
      supabase.from("trabajo_reportes_diarios")
        .select("fecha, tecnico_id, avance_pct, paneles_limpiados, agua_galones, horas_trabajadas, clima, trabajo_realizado, hallazgos, bloqueos, observaciones")
        .eq("trabajo_id", data.trabajo_id)
        .order("fecha", { ascending: true }),
      supabase.from("trabajo_reportes_pdf")
        .select("fecha, nombre_original, notas, storage_path")
        .eq("trabajo_id", data.trabajo_id)
        .order("fecha", { ascending: true }),
    ]);
    const diarios = diariosRes.data ?? [];
    const pdfs = pdfsRes.data ?? [];
    if (!diarios.length && !pdfs.length) {
      throw new Error("No hay reportes diarios ni PDFs cargados para este trabajo todavía.");
    }

    const ids = Array.from(new Set(diarios.map((d: any) => d.tecnico_id)));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as any[] };
    const nombrePorId = new Map((profs ?? []).map((p: any) => [p.id, p.display_name ?? "Técnico"]));

    const dataset = {
      cliente: cliente?.nombre,
      planta: planta?.nombre,
      trabajo: { folio: (trabajo as any).folio, servicio: (trabajo as any).servicio, notas: (trabajo as any).notas },
      total_dias_reportados: diarios.length,
      pdfs_cargados: pdfs.length,
      reportes_diarios: diarios.map((d: any) => ({
        ...d,
        tecnico: nombrePorId.get(d.tecnico_id) ?? "Técnico",
      })),
      pdfs: pdfs.map((p: any) => ({ fecha: p.fecha, archivo: p.nombre_original, notas: p.notas })),
    };

    // Descargar y adjuntar los PDFs (hasta 6 y 20MB totales) para que el modelo
    // lea directamente su contenido y produzca un ejecutivo basado en ellos.
    const MAX_PDFS = 6;
    const MAX_PDF_BYTES = 75 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
    const pdfParts: Array<{ type: "file"; file: { filename: string; file_data: string } }> = [];
    let totalBytes = 0;
    const pdfsUsados: string[] = [];
    const pdfsOmitidos: string[] = [];
    for (const p of pdfs.slice(0, MAX_PDFS) as any[]) {
      try {
        const { data: signed } = await supabase.storage
          .from("trabajos-evidencia")
          .createSignedUrl(p.storage_path, 300);
        if (!signed?.signedUrl) { pdfsOmitidos.push(p.nombre_original ?? p.storage_path); continue; }
        const resp = await fetch(signed.signedUrl);
        if (!resp.ok) { pdfsOmitidos.push(p.nombre_original ?? p.storage_path); continue; }
        const buf = new Uint8Array(await resp.arrayBuffer());
        if (buf.byteLength > MAX_PDF_BYTES || totalBytes + buf.byteLength > MAX_TOTAL_BYTES) {
          pdfsOmitidos.push(p.nombre_original ?? p.storage_path);
          continue;
        }
        totalBytes += buf.byteLength;
        // Base64 encode
        let bin = "";
        for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i]);
        const b64 = btoa(bin);
        pdfParts.push({
          type: "file",
          file: {
            filename: p.nombre_original ?? `${p.fecha ?? "reporte"}.pdf`,
            file_data: `data:application/pdf;base64,${b64}`,
          },
        });
        pdfsUsados.push(p.nombre_original ?? p.storage_path);
      } catch {
        pdfsOmitidos.push(p.nombre_original ?? p.storage_path);
      }
    }
    (dataset as any).pdfs_procesados = pdfsUsados;
    if (pdfsOmitidos.length) (dataset as any).pdfs_omitidos = pdfsOmitidos;

    const ZRep = z.object({
      titulo: z.string(),
      resumen: z.string(),
      kpis: z.array(z.object({ label: z.string(), value: z.string() })),
      hallazgos: z.array(z.string()),
      recomendaciones: z.array(z.string()),
    });
    const system = [
      "Eres un analista senior de calidad y mantenimiento solar/térmico de EA SERVICE AND CONSULTING.",
      "Consolidas reportes diarios del equipo técnico en un reporte ejecutivo único, formal y trazable.",
      "Solo usas datos del dataset y del contenido de los PDFs adjuntos; nunca inventas cifras.",
      "Cuando existan PDFs adjuntos, léelos íntegramente y prioriza sus datos (mediciones, tablas, hallazgos) por sobre suposiciones.",
      "NUNCA menciones los archivos PDF adjuntos: nada de nombres de archivo, fechas de subida, notas del PDF ni frases como 'según el PDF' o 'en el documento adjunto'. Integra la información como propia del análisis.",
      "Nunca menciones IA, modelos ni inteligencia artificial.",
      "Escribes en español, tono profesional, conciso y accionable.",
    ].join(" ");
    const prompt = `Consolida el siguiente trabajo en un reporte ejecutivo final.\n\nDataset:\n${JSON.stringify(dataset, null, 2)}\n\nResponde EXCLUSIVAMENTE con JSON válido:\n{"titulo":"string","resumen":"string","kpis":[{"label":"string","value":"string"}],"hallazgos":["string"],"recomendaciones":["string"]}`;

    const parseJson = (raw: string): unknown => {
      let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const start = s.search(/[\{\[]/);
      const end = s.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("Respuesta sin JSON");
      s = s.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(s);
    };

    // Si hay PDFs adjuntos, llamamos al gateway directamente (chat completions
    // multimodal). Si no, mantenemos el camino con AI SDK (generateText).
    const callWithPdfs = async (model: string): Promise<string> => {
      const body = {
        model,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...pdfParts,
            ],
          },
        ],
      };
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`${r.status} ${t}`);
      }
      const j: any = await r.json();
      return j?.choices?.[0]?.message?.content ?? "";
    };

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);

    const attempts = buildAttempts("auto");
    let aiResult!: z.infer<typeof ZRep>;
    let modelUsed = attempts[0].model;
    let lastErr: any = null;
    let ok = false;
    for (const a of attempts) {
      if (a.wait) await sleep(a.wait);
      try {
        let text: string;
        if (pdfParts.length > 0 && (a.model.startsWith("google/") || a.model.startsWith("openai/"))) {
          text = await callWithPdfs(a.model);
        } else {
          const r = await generateText({ model: gateway(a.model), system, prompt });
          text = r.text;
        }
        aiResult = ZRep.parse(parseJson(text));
        modelUsed = a.model;
        ok = true;
        break;
      } catch (e: any) {
        lastErr = e;
        if (/402|credit/i.test(e?.message || "")) throw new Error("Créditos de IA agotados. Recarga créditos para continuar.");
      }
    }
    if (!ok) throw new Error(`Servicio de IA saturado. Reintenta en unos minutos. (${lastErr?.message ?? ""})`);

    const periodo = (() => {
      const fechas = diarios.map((d: any) => d.fecha).filter(Boolean).sort();
      if (!fechas.length) return new Date().toISOString().slice(0, 10);
      return fechas[0] === fechas[fechas.length - 1] ? fechas[0] : `${fechas[0]} a ${fechas[fechas.length - 1]}`;
    })();

    const markdown = [
      `# ${aiResult.titulo}`,
      ``,
      `**Cliente:** ${cliente?.nombre} · **Planta:** ${planta?.nombre} · **OT:** ${(trabajo as any).folio} · **Periodo:** ${periodo}`,
      ``,
      `## Resumen ejecutivo`, aiResult.resumen, ``,
      `## KPIs`, ...aiResult.kpis.map((k) => `- **${k.label}:** ${k.value}`), ``,
      `## Hallazgos`, ...aiResult.hallazgos.map((h) => `- ${h}`), ``,
      `## Recomendaciones`, ...aiResult.recomendaciones.map((r) => `- ${r}`),
    ].join("\n");

    const { data: row, error } = await supabase.from("reportes").insert({
      cliente_id: cliente.id,
      planta_id: planta?.id ?? null,
      periodo,
      titulo: aiResult.titulo,
      contenido_markdown: markdown,
      insight_resumen: aiResult.resumen.slice(0, 280),
      estado: "borrador",
      generado_por: context.userId,
      model_used: modelUsed,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });