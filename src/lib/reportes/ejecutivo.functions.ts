import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { humanizarTexto } from "@/lib/humanizar-texto";
import { construirIndicadores, construirSystemPrompt, FORMATO_RESPUESTA_IA, parseJsonIA, ZTextoReporte, cifrasPermitidas, verificarCifras, indicadoresMarkdown } from "@/lib/reporte-ia";
import { sleep, extraerTextoPdf, buildAttempts, avanceRealPorTrabajo, kpisAvanceReal } from "./helpers";

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
        .select("fecha, tecnico_id, avance_pct, paneles_limpiados, agua_galones, horas_trabajadas, clima, trabajo_realizado, hallazgos, bloqueos, observaciones, watts_panel, tds_ppm, angulo_inclinacion, presion_agua_psi")
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

    // Dataset depurado para el reporte EJECUTIVO DE CLIENTE: se excluye toda la
    // información operativa interna (técnicos, horas, dotación, bloqueos,
    // consumo de agua) y se conserva solo lo relevante para el cliente:
    // avance, paneles, mediciones (PSI, TDS, ángulo, watts), hallazgos y
    // observaciones técnicas de la planta.
    const consolidados = (await import("@/lib/consolidar-diarios")).consolidarDiarios(
      diarios.map((d: any) => ({ ...d, trabajo_id: data.trabajo_id })),
      nombrePorId,
    );
    const depurarDia = (d: any) => {
      const {
        tecnico_id, tecnico, tecnicos, horas_trabajadas, agua_galones, bloqueos,
        trabajo_id, id, created_at, updated_at, fase,
        por_tecnico, aportes, hora_inicio, hora_fin,
        // avance_pct es la meta diaria interna del equipo: no se envía para que
        // el texto del cliente no confunda "meta del día" con avance del servicio.
        avance_pct,
        ...resto
      } = d ?? {};
      return resto;
    };
    // Avance real del servicio (zonas del mapa → paneles sobre el parque de la
    // planta), el mismo número que muestra la tarjeta de avance de la OT.
    const avancesMapa = await avanceRealPorTrabajo(supabase, [data.trabajo_id]);
    const avanceOT = avancesMapa.get(data.trabajo_id) ?? null;
    const indicadoresSistema = construirIndicadores(
      consolidados as any[],
      kpisAvanceReal(avancesMapa, new Map([[data.trabajo_id, String((trabajo as any).folio ?? "—")]]), "cliente"),
      "cliente",
    );
    const dataset = {
      indicadores_calculados: indicadoresSistema,
      cliente: cliente?.nombre,
      planta: planta?.nombre,
      trabajo: { folio: (trabajo as any).folio, servicio: (trabajo as any).servicio, notas: (trabajo as any).notas },
      total_dias_reportados: diarios.length,
      avance_servicio: avanceOT
        ? {
            porcentaje: avanceOT.pct,
            paneles_intervenidos: avanceOT.paneles,
            paneles_totales_planta: avanceOT.parque,
            base_de_calculo: avanceOT.fuente === "zonas"
              ? "zonas del layout de la planta completadas"
              : avanceOT.fuente === "paneles"
                ? "paneles intervenidos sobre el total de paneles de la planta"
                : "avance reportado en campo",
          }
        : null,
      nota_consolidacion:
        "Varios técnicos pueden reportar el mismo día. En 'reportes_diarios_consolidados' cada día ya combina a todo el equipo: cantidades sumadas y mediciones. Úsalo como fuente principal de cifras. El único porcentaje de avance válido es 'avance_servicio.porcentaje': no calcules ni inventes otros porcentajes de avance. Este reporte es para el cliente: no menciones personas, dotación, horarios, horas trabajadas ni consumo de agua, aunque creas inferirlos.",
      reportes_diarios_consolidados: consolidados.map(depurarDia),
      reportes_diarios: diarios.map(depurarDia),
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
    const pdfTextos: string[] = [];
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
        if (buf.byteLength === 0) { pdfsOmitidos.push(p.nombre_original ?? p.storage_path); continue; }
        totalBytes += buf.byteLength;
        const texto = await extraerTextoPdf(buf);
        if (texto) pdfTextos.push(texto);
        // Base64 encode
        let bin = "";
        for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i]);
        const b64 = btoa(bin);
        if (b64.length > 0) {
          pdfParts.push({
            type: "file",
            file: {
              filename: p.nombre_original ?? `${p.fecha ?? "reporte"}.pdf`,
              file_data: `data:application/pdf;base64,${b64}`,
            },
          });
        }
        pdfsUsados.push(p.nombre_original ?? p.storage_path);
      } catch {
        pdfsOmitidos.push(p.nombre_original ?? p.storage_path);
      }
    }
    // No exponer nombres/fechas de PDFs al modelo: el reporte no debe citarlos.
    const contenidoPdfsBloque = pdfTextos.length
      ? `\n\nContenido operativo extraído de los reportes de campo (integrar como propio del análisis, sin citar origen):\n"""\n${pdfTextos.map((t, i) => `--- Registro ${i + 1} ---\n${t}`).join("\n\n")}\n"""\n`
      : "";

    const ZRep = ZTextoReporte;
    const system = construirSystemPrompt("cliente");
    const prompt = `Redacta el texto del reporte ejecutivo final de este trabajo.\n\nDataset:\n${JSON.stringify(dataset, null, 2)}\n${contenidoPdfsBloque}\n${FORMATO_RESPUESTA_IA}`;

    if (pdfs.length > 0 && pdfTextos.length === 0 && pdfParts.length === 0) {
      console.warn("[generarEjecutivoDesdeDiarios] PDFs encontrados pero no procesables:", pdfsOmitidos);
    }

    const parseJson = parseJsonIA;

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

    // Corregir nombres propios en la respuesta del modelo (evita "Apopa" → "Appopa").
    {
      const { normalizarNombresCanonicos } = await import("@/lib/normalizar-nombres");
      const { data: plantasCliente } = await supabase
        .from("plantas").select("nombre").eq("cliente_id", cliente.id);
      const { data: clientesTodos } = await supabase.from("clientes").select("nombre");
      const canonicos = [
        cliente?.nombre ?? "",
        planta?.nombre ?? "",
        ...((plantasCliente ?? []).map((p: any) => p.nombre)),
        ...((clientesTodos ?? []).map((c: any) => c.nombre)),
      ];
      const fix = (s: string) => normalizarNombresCanonicos(s, canonicos);
      aiResult = {
        titulo: humanizarTexto(fix(aiResult.titulo)),
        resumen: humanizarTexto(fix(aiResult.resumen)),
        hallazgos: aiResult.hallazgos.map((h) => humanizarTexto(fix(h))),
        recomendaciones: aiResult.recomendaciones.map((r) => humanizarTexto(fix(r))),
      };
    }

    const periodo = (() => {
      const fechas = diarios.map((d: any) => d.fecha).filter(Boolean).sort();
      if (!fechas.length) return new Date().toISOString().slice(0, 10);
      return fechas[0] === fechas[fechas.length - 1] ? fechas[0] : `${fechas[0]} a ${fechas[fechas.length - 1]}`;
    })();

    const cifrasSinRespaldo = verificarCifras(
      aiResult,
      cifrasPermitidas(dataset, indicadoresSistema, pdfTextos, periodo, (trabajo as any).folio),
    );

    const markdown = [
      `# ${aiResult.titulo}`,
      ``,
      `**Cliente:** ${cliente?.nombre} · **Planta:** ${planta?.nombre} · **OT:** ${(trabajo as any).folio} · **Periodo:** ${periodo}`,
      ``,
      `## Resumen ejecutivo`, aiResult.resumen, ``,
      `## KPIs`, ...indicadoresMarkdown(indicadoresSistema), ``,
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
      indicadores: indicadoresSistema,
      revision_ia_pendiente: cifrasSinRespaldo.length > 0,
      revision_ia_detalle: cifrasSinRespaldo.length ? { cifras_sin_respaldo: cifrasSinRespaldo } : null,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });
