import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { humanizarTexto } from "@/lib/humanizar-texto";
import { formatCapacidadKwp } from "@/lib/potencia";
import { construirIndicadores, construirSystemPrompt, FORMATO_RESPUESTA_IA, parseJsonIA, ZTextoReporte, type TextoReporte, cifrasPermitidas, verificarCifras, indicadoresMarkdown } from "@/lib/reporte-ia";
import { sleep, SV_OFFSET, isDateOnly, toProfileName, extraerTextoPdf, Proveedor, buildAttempts, AvanceOT, avanceRealPorTrabajo, kpisAvanceReal } from "./helpers";

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
      // "final": reporte para el cliente (abarca todo el trabajo).
      // "diario": reporte de un día, solo uso interno de la empresa.
      tipo_reporte: z.enum(["diario", "final"]).optional().default("final"),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Access exactly as before Phase 7: no explicit role check here; saving the report is limited by database rules.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateReportText } = await import("./ia.server");
    const { saveReportSnapshot } = await import("./ia-snapshot.server");
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY no configurada");

    const supabase = context.supabase;
    // Normalizar la ventana: si el usuario ingresa solo YYYY-MM-DD, expandir
    // el "hasta" al final del día para incluir trabajos/PDFs registrados en
    // cualquier hora de esa fecha. Sin esto, "hasta=2026-07-03" se interpreta
    // como 2026-07-03T00:00:00Z y excluye todo lo ocurrido durante ese día.
    // Zona horaria operativa: América/El Salvador (UTC-6, sin DST).
    const desdeTs = isDateOnly(data.desde) ? `${data.desde}T00:00:00.000${SV_OFFSET}` : data.desde;
    const hastaTs = isDateOnly(data.hasta) ? `${data.hasta}T23:59:59.999${SV_OFFSET}` : data.hasta;
    const { data: cliente } = await supabase.from("clientes").select("nombre").eq("id", data.cliente_id).single();
    const plantaId = data.planta_id ?? null;
    const { data: planta } = plantaId
      ? await supabase.from("plantas").select("nombre, ubicacion, paneles, capacidad_kwp, eficiencia").eq("id", plantaId).single()
      : { data: null };

    const [{ data: plantasCliente }, { data: clientesTodos }] = await Promise.all([
      supabase.from("plantas").select("id, nombre").eq("cliente_id", data.cliente_id),
      supabase.from("clientes").select("nombre"),
    ]);
    const { crearProtectorNombresCanonicos } = await import("@/lib/normalizar-nombres");
    const protectorNombres = crearProtectorNombresCanonicos([
      cliente?.nombre ?? "",
      planta?.nombre ?? "",
      ...((plantasCliente ?? []).map((p: any) => p.nombre)),
      ...((clientesTodos ?? []).map((c: any) => c.nombre)),
    ]);

    let plantasIds: string[] = [];
    if (plantaId) plantasIds = [plantaId];
    else {
      plantasIds = (plantasCliente ?? []).map((p: any) => p.id);
    }

    // Traemos todos los trabajos de las plantas (filtrando por servicio si
    // aplica) y luego dejamos únicamente los que SOLAPAN con la ventana
    // [desde, hasta]. Esto asegura que un servicio programado para varios
    // días aparezca en el reporte aunque el usuario elija un día intermedio.
    const [trabajosRawRes, equiposRes] = await Promise.all([
      plantasIds.length
        ? (data.servicio
            ? supabase.from("trabajos")
                .select("id, folio, servicio, nombre_trabajo, estado, fecha_programada, duracion_dias")
                .in("planta_id", plantasIds)
                .eq("servicio", data.servicio)
            : supabase.from("trabajos")
                .select("id, folio, servicio, nombre_trabajo, estado, fecha_programada, duracion_dias")
                .in("planta_id", plantasIds))
        : Promise.resolve({ data: [] as any[] }),
      plantasIds.length
        ? supabase.from("equipos").select("codigo, nombre, estado, salud").in("planta_id", plantasIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const desdeMs = new Date(desdeTs).getTime();
    const hastaMs = new Date(hastaTs).getTime();
    const solapa = (t: any) => {
      const ini = new Date(t.fecha_programada).getTime();
      const dur = Math.max(1, Number(t.duracion_dias ?? 1));
      const fin = ini + dur * 86400000 - 1;
      return ini <= hastaMs && fin >= desdeMs;
    };
    // Ventana en días calendario para reportes diarios (columna `fecha` = date).
    const ventanaDesdeDia = isDateOnly(data.desde) ? data.desde : new Date(desdeTs).toISOString().slice(0, 10);
    const ventanaHastaDia = isDateOnly(data.hasta) ? data.hasta : new Date(hastaTs).toISOString().slice(0, 10);
    // Un servicio puede extenderse más allá de su duración planificada (atrasos,
    // jornadas adicionales). Si el técnico cargó un reporte diario dentro de la
    // ventana, la OT es relevante aunque su rango programado no la solape.
    const idsConActividad = new Set<string>();
    {
      const idsRaw = (trabajosRawRes.data ?? []).map((t: any) => t.id);
      if (idsRaw.length) {
        const [{ data: dAct }, { data: pdfAct }] = await Promise.all([
          supabase.from("trabajo_reportes_diarios").select("trabajo_id")
            .in("trabajo_id", idsRaw).gte("fecha", ventanaDesdeDia).lte("fecha", ventanaHastaDia),
          supabase.from("trabajo_reportes_pdf").select("trabajo_id")
            .in("trabajo_id", idsRaw).gte("fecha", ventanaDesdeDia).lte("fecha", ventanaHastaDia),
        ]);
        for (const r of [...(dAct ?? []), ...(pdfAct ?? [])] as any[]) idsConActividad.add(r.trabajo_id);
      }
    }
    const trabajosFull = (trabajosRawRes.data ?? []).filter((t: any) => solapa(t) || idsConActividad.has(t.id));
    const trabajos = trabajosFull.map(({ id: _id, duracion_dias: _d, ...rest }: any) => rest);


    // ---------------------------------------------------------------------
    // Estado EFECTIVO por trabajo.
    //
    // Regla de negocio: si el servicio es de limpieza y todavía existen
    // paneles por limpiar en la planta (acumulado < parque instalado),
    // el trabajo NO puede marcarse como "completado" en el reporte
    // ejecutivo aunque el estado en base de datos sea "completado".
    // En ese caso lo reflejamos como "en_progreso" para no engañar al
    // cliente sobre el avance real.
    // ---------------------------------------------------------------------
    const trabajoIdsAll = trabajosFull.map((t: any) => t.id);
    const parqueByTrabajo = new Map<string, number>();
    const acumByTrabajo = new Map<string, number>();
    if (trabajoIdsAll.length) {
      const [parqueRes, acumRes] = await Promise.all([
        supabase.from("trabajos").select("id, plantas(paneles)").in("id", trabajoIdsAll),
        supabase.from("trabajo_reportes_diarios").select("trabajo_id, paneles_limpiados").in("trabajo_id", trabajoIdsAll),
      ]);
      for (const r of (parqueRes.data ?? []) as any[]) {
        parqueByTrabajo.set(r.id, Number(r.plantas?.paneles ?? 0));
      }
      for (const r of (acumRes.data ?? []) as any[]) {
        acumByTrabajo.set(r.trabajo_id, (acumByTrabajo.get(r.trabajo_id) ?? 0) + Number(r.paneles_limpiados ?? 0));
      }
    }
    const esLimpieza = (s: string) => /limpieza/i.test(s ?? "");
    const estadoEfectivo = (t: any): string => {
      if (t.estado !== "completado") return t.estado;
      if (!esLimpieza(t.servicio)) return t.estado;
      const parque = parqueByTrabajo.get(t.id) ?? 0;
      const acum = acumByTrabajo.get(t.id) ?? 0;
      if (parque > 0 && acum < parque) return "en_progreso";
      return t.estado;
    };
    const trabajosFullEf = trabajosFull.map((t: any) => ({ ...t, estado: estadoEfectivo(t) }));
    // Reemplazamos la lista sin id que se usa aguas abajo con el estado ajustado.
    for (let i = 0; i < trabajos.length; i++) {
      trabajos[i].estado = trabajosFullEf[i].estado;
    }
    const trabajosRes = { data: trabajos } as { data: any[] };
    const equipos = equiposRes.data ?? [];
    const equipoIds = equipos.length
      ? (await supabase.from("equipos").select("id").in("planta_id", plantasIds)).data?.map((e: any) => e.id) ?? []
      : [];
    const { data: mantenimientos } = equipoIds.length
      ? await supabase.from("mantenimientos").select("tipo, fecha, horas, estado").in("equipo_id", equipoIds).gte("fecha", desdeTs).lte("fecha", hastaTs)
      : { data: [] as any[] };

    const saludVals = equipos.map((e: any) => e.salud).filter((s: any) => typeof s === "number");
    const saludProm = saludVals.length ? Math.round(saludVals.reduce((a: number, b: number) => a + b, 0) / saludVals.length) : null;

    // OTs relevantes: las que solapan la ventana. Antes se re-consultaban con
    // el mismo filtro por fecha_programada y perdíamos los trabajos multi-día.
    const tIdsArr = trabajosFull.map((t: any) => t.id);
    const folioPorId = new Map(trabajosFull.map((t: any) => [t.id, t.folio]));
    const { data: reportesBase } = tIdsArr.length
      ? await supabase.from("trabajo_reportes")
          .select("trabajo_id, condiciones_sitio, trabajo_realizado, hallazgos, recomendaciones, materiales_usados, cliente_observaciones")
          .in("trabajo_id", tIdsArr)
      : { data: [] as any[] };

    // Reportes diarios cargados por técnicos día a día. Filtramos por la
    // ventana [desde, hasta] para que un reporte de un día específico solo
    // contenga los diarios de ese día.
    const diariosDesde = isDateOnly(data.desde) ? data.desde : new Date(desdeTs).toISOString().slice(0, 10);
    const diariosHasta = isDateOnly(data.hasta) ? data.hasta : new Date(hastaTs).toISOString().slice(0, 10);
    const { data: reportesDiarios } = tIdsArr.length
      ? await supabase.from("trabajo_reportes_diarios")
          .select("trabajo_id, tecnico_id, fecha, fase, hora_inicio, hora_fin, paneles_limpiados, agua_galones, horas_trabajadas, clima, trabajo_realizado, hallazgos, observaciones, avance_pct, watts_panel, tds_ppm, angulo_inclinacion, presion_agua_psi")
          .in("trabajo_id", tIdsArr)
          .gte("fecha", diariosDesde)
          .lte("fecha", diariosHasta)
          .order("fecha", { ascending: true })
      : { data: [] as any[] };

    // Cuando dos o más técnicos cargan reporte para la misma OT y el mismo
    // día, consolidamos sus aportes en una sola fila (suma de cantidades,
    // máximo avance, promedio de mediciones) para que el ejecutivo refleje
    // el trabajo completo del equipo y no el de un solo técnico.
    const nombreTecnicoDiario = new Map<string, string>();
    {
      const tecIds = Array.from(
        new Set((reportesDiarios ?? []).map((r: any) => r.tecnico_id).filter(Boolean)),
      ) as string[];
      if (tecIds.length) {
        const { data: profsDiario } = await supabase
          .from("profiles").select("id, display_name, nombres, apellidos").in("id", tecIds);
        for (const p of (profsDiario ?? []) as any[]) {
          const nombre = toProfileName(p);
          if (nombre) nombreTecnicoDiario.set(p.id, nombre);
        }
      }
    }
    const { consolidarDiarios } = await import("@/lib/consolidar-diarios");
    const diariosConsolidados = consolidarDiarios(
      (reportesDiarios ?? []) as any[],
      nombreTecnicoDiario,
    );

    // PDFs subidos (caso st.solar u otros).
    const { data: reportesPdf } = tIdsArr.length
      ? await supabase.from("trabajo_reportes_pdf")
          .select("trabajo_id, fecha, nombre_original, notas, storage_path")
          .in("trabajo_id", tIdsArr)
          .order("fecha", { ascending: true })
      : { data: [] as any[] };
    // Avance real por OT (mismo cálculo que la tarjeta de avance de la OT).
    const avancesRealesCtx: Map<string, AvanceOT> = await avanceRealPorTrabajo(supabase, tIdsArr);
    // A2: los indicadores los arma el sistema; la IA solo los lee.
    const indicadoresSistema = construirIndicadores(
      diariosConsolidados as any[],
      kpisAvanceReal(avancesRealesCtx, folioPorId as Map<string, string>),
      "interno",
    );

    const datasetCtxRaw = {

      cliente: cliente?.nombre,
      planta: planta?.nombre ?? "Todas las plantas",
      periodo: data.periodo,
      servicio: data.servicio ?? "Todos los servicios",
      ventana: { desde: data.desde, hasta: data.hasta },
      planta_meta: planta
        ? {
            nombre: (planta).nombre,
            ubicacion: (planta).ubicacion,
            paneles: (planta).paneles,
            capacidad_instalada: (planta).capacidad_kwp != null ? formatCapacidadKwp((planta).capacidad_kwp) : null,
            eficiencia: (planta).eficiencia,
          }
        : null,
      indicadores_calculados: indicadoresSistema,
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
      nota_consolidacion:
        "Cada fila de reportes_diarios ya consolida a TODOS los técnicos que reportaron esa OT en ese día: las cantidades (paneles, agua, horas) están sumadas y las mediciones son el promedio del equipo. Nunca atribuyas el día a un solo técnico si 'tecnicos' trae más de un nombre. Los porcentajes de avance NO están en los días: el único avance válido es 'avance_por_ot'.",
      avance_por_ot: Array.from(avancesRealesCtx.entries()).map(([tid, a]) => ({
        folio: folioPorId.get(tid) ?? null,
        porcentaje: a.pct,
        paneles_intervenidos: a.paneles,
        paneles_totales_planta: a.parque,
        base_de_calculo: a.fuente === "zonas" ? "áreas de la planta marcadas como terminadas" : a.fuente === "paneles" ? "paneles intervenidos sobre el parque de la planta" : "avance reportado por el equipo",
      })),
      reportes_diarios: diariosConsolidados.slice(0, 60).map((r) => ({
        folio: r.trabajo_id ? folioPorId.get(r.trabajo_id) ?? null : null,
        fecha: r.fecha,
        tecnicos: r.tecnicos,
        aportes_tecnicos: r.aportes,
        hora_inicio: r.hora_inicio,
        hora_fin: r.hora_fin,

        paneles_limpiados: r.paneles_limpiados,
        agua_galones: r.agua_galones,
        horas_trabajadas: r.horas_trabajadas,
        clima: r.clima,
        trabajo_realizado: r.trabajo_realizado,
        hallazgos: r.hallazgos,
        observaciones: r.observaciones,
        watts_panel: r.watts_panel,
        watts_totales: r.watts_totales,
        tds_ppm: r.tds_ppm,
        angulo_inclinacion: r.angulo_inclinacion,
        presion_agua_psi: r.presion_agua_psi,
      })),
    };
    const datasetCtx = protectorNombres.protegerValor(datasetCtxRaw);


    // Descargar y adjuntar PDFs subidos por técnicos al periodo, para que el
    // modelo lea su contenido y consolide el ejecutivo con datos reales.
    const MAX_PDFS = 8;
    const MAX_PDF_BYTES = 75 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
    const pdfParts: Array<{ type: "file"; file: { filename: string; file_data: string } }> = [];
    const pdfRefs: Array<{ storage_path: string; filename: string }> = [];
    const pdfsUsados: string[] = [];
    const pdfsOmitidos: string[] = [];
    const pdfTextos: string[] = [];
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
        if (buf.byteLength === 0) { pdfsOmitidos.push(p.nombre_original ?? p.storage_path); continue; }
        totalBytes += buf.byteLength;
        // Extraer texto plano del PDF (siempre disponible para el modelo,
        // aun si el proveedor no soporta adjuntos binarios).
        const texto = await extraerTextoPdf(buf);
        if (texto) pdfTextos.push(texto);
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.byteLength; i += CHUNK) {
          bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)));
        }
        const b64 = btoa(bin);
        if (b64.length > 0) {
          const filename = p.nombre_original ?? `${p.fecha ?? "reporte"}.pdf`;
          pdfParts.push({
            type: "file",
            file: {
              filename,
              file_data: `data:application/pdf;base64,${b64}`,
            },
          });
          pdfRefs.push({ storage_path: p.storage_path, filename });
        }
        pdfsUsados.push(p.nombre_original ?? p.storage_path);
      } catch {
        pdfsOmitidos.push(p.nombre_original ?? p.storage_path);
      }
    }
    // No exponer nombres/fechas de PDFs al modelo: el reporte no debe citarlos.
    const contenidoPdfsBloque = pdfTextos.length
      ? `\n\nContenido operativo extraído de los reportes de campo (integrar como propio del análisis, sin citar origen):\n"""\n${pdfTextos.map((t, i) => `--- Registro ${i + 1} ---\n${protectorNombres.protegerTexto(t)}`).join("\n\n")}\n"""`
      : "";
    const usarAdjuntosPdf = pdfParts.length > 0 && pdfTextos.length === 0;


    // El reporte final va al cliente (sin detalles operativos internos);
    // el diario es de uso interno y sí los incluye.
    const audienciaReporte = data.tipo_reporte === "diario" ? "interno" : "cliente";
    const system = construirSystemPrompt(audienciaReporte);
    const servicioLine = data.servicio
      ? `\n\nIMPORTANTE: El reporte debe centrarse EXCLUSIVAMENTE en el servicio "${data.servicio}". El dataset ya viene filtrado por ese servicio; no menciones otros tipos de servicio.`
      : "";
    const prompt = `Redacta el texto del reporte ejecutivo para el cliente "${datasetCtx.cliente}" sobre el periodo ${datasetCtx.periodo} (${data.desde} a ${data.hasta}).${servicioLine}

Datos:
${JSON.stringify(datasetCtx, null, 2)}
${contenidoPdfsBloque}
${FORMATO_RESPUESTA_IA}`;

    const aiInput = {
      system, prompt, pdfParts: usarAdjuntosPdf ? pdfParts : [],
      legacyProvider: data.proveedor ?? "auto",
      permittedFigures: Array.from(cifrasPermitidas(datasetCtxRaw, indicadoresSistema, pdfTextos, data.desde, data.hasta)),
      canonicalNames: protectorNombres.protegidos.map((n) => n.valor),
      protectedNames: protectorNombres.protegidos,
    };
    const drafted = await generateReportText(aiInput, { apiKey, admin: supabaseAdmin });
    let aiResult = drafted.texto;
    const modelUsed = drafted.procedencia.modelo;

    if ((reportesPdf ?? []).length > 0 && pdfTextos.length === 0 && pdfParts.length === 0) {
      // Los PDFs existían pero no pudimos leerlos ni adjuntarlos.
      // Avisar en consola para diagnóstico; no romper el reporte ya generado.
      console.warn("[generarReporte] PDFs encontrados pero no procesables:", pdfsOmitidos);
    }

    // Restaurar placeholders de nombres oficiales sin aplicar correcciones por similitud.
    const fix = (s: string) => protectorNombres.restaurarTexto(s);
    aiResult = {
      titulo: humanizarTexto(fix(aiResult.titulo)),
      resumen: humanizarTexto(fix(aiResult.resumen)),
      hallazgos: aiResult.hallazgos.map((h) => humanizarTexto(fix(h))),
      recomendaciones: aiResult.recomendaciones.map((r) => humanizarTexto(fix(r))),
    };
    // Verificación de cifras: todo número del texto debe existir en los datos.
    const cifrasSinRespaldo = verificarCifras(
      aiResult,
      cifrasPermitidas(datasetCtxRaw, indicadoresSistema, pdfTextos, data.desde, data.hasta),
    );

    const markdown = [
      `# ${aiResult.titulo}`,
      ``,
      `**Cliente:** ${datasetCtxRaw.cliente} · **Planta:** ${datasetCtxRaw.planta} · **Periodo:** ${datasetCtxRaw.periodo}`,
      ``,
      `## Resumen ejecutivo`,
      aiResult.resumen,
      ``,
      `## KPIs`,
      ...indicadoresMarkdown(indicadoresSistema),
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
      desde: desdeTs,
      hasta: hastaTs,
      indicadores: indicadoresSistema,
      tipo_reporte: data.tipo_reporte,
      revision_ia_pendiente: cifrasSinRespaldo.length > 0,
      revision_ia_detalle: { cifras_sin_respaldo: cifrasSinRespaldo, procedencia_ia: drafted.procedencia },
    }).select().single();
    if (error) throw new Error(error.message);
    await saveReportSnapshot(supabaseAdmin, row.id, {
      input: aiInput, pdfRefs: usarAdjuntosPdf ? pdfRefs : [], indicators: indicadoresSistema,
      markdownHeader: `**Cliente:** ${datasetCtxRaw.cliente} · **Planta:** ${datasetCtxRaw.planta} · **Periodo:** ${datasetCtxRaw.periodo}`,
    }, context.userId);
    return row;
  });

/** Devuelve el dataset completo necesario para armar el PDF (trabajos + evidencias firmadas). */
