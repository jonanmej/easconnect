import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { construirIndicadores } from "@/lib/reporte-ia";
import { parseLegacySingleDayPeriod, toProfileName, ReporteKpi, Audiencia, normalizarKpisMetaDiaria, avanceRealPorTrabajo, kpisAvanceReal } from "./helpers";

export const getReporteParaPDF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      variante: z.enum(["ejecutivo", "interno"]).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase;
    const { data: rep, error } = await supabase
      .from("reportes")
      .select("*, clientes(nombre, contacto, color_acento), plantas(nombre)")
      .eq("id", data.id).single();
    if (error) throw new Error(error.message);

    // Parse KPIs/hallazgos del markdown
    const md = (rep).contenido_markdown ?? "";
    const section = (name: string) => {
      const re = new RegExp(`## ${name}\\n([\\s\\S]*?)(\\n## |$)`);
      return re.exec(md)?.[1]?.trim() ?? "";
    };
    const parseBullets = (s: string) => s.split("\n").map((l) => l.replace(/^[-*]\s+/, "").trim()).filter(Boolean);
    const kpisRaw = parseBullets(section("KPIs"));
    const kpisParsed = kpisRaw.map((l) => {
      const m = /\*\*(.+?):\*\*\s*(.+)/.exec(l) ?? /^([^:]+):\s*(.+)/.exec(l);
      return m ? { label: m[1], value: m[2] } : { label: l, value: "" };
    });
    // Normalización determinista: en el reporte del cliente los porcentajes se
    // leen como avance del servicio en su planta; en el interno, como
    // cumplimiento de la meta diaria de la OT.
    const audiencia: Audiencia = data.variante === "interno" ? "interno" : "cliente";
    let kpis = normalizarKpisMetaDiaria(kpisParsed, audiencia);
    let hallazgos = parseBullets(section("Hallazgos"));
    let recomendaciones = parseBullets(section("Recomendaciones"));
    let resumen = section("Resumen ejecutivo");
    const folioReporte = (() => {
      const markdown = String((rep).contenido_markdown ?? "");
      const m = markdown.match(/\*\*OT:\*\*\s*([^·\n]+)/i) || markdown.match(/\bOT\s*[:#-]?\s*([A-Z0-9-]{6,})/i);
      return m?.[1]?.trim() ?? null;
    })();

    // Trabajos del periodo
    const inferredRange = !(rep).desde || !(rep).hasta
      ? parseLegacySingleDayPeriod((rep).periodo)
      : null;
    const desde = (rep).desde ?? inferredRange?.desde ?? null;
    const hasta = (rep).hasta ?? inferredRange?.hasta ?? null;
    const desdeMs = desde ? new Date(desde).getTime() : null;
    const hastaMs = hasta ? new Date(hasta).getTime() : null;
    let plantasIds: string[] = [];
    if ((rep).planta_id) plantasIds = [(rep).planta_id];
    else {
      const { data: ps } = await supabase.from("plantas").select("id").eq("cliente_id", (rep).cliente_id);
      plantasIds = (ps ?? []).map((p) => p.id);
    }
    let qb = supabase.from("trabajos")
      .select("id, folio, servicio, fecha_programada, duracion_dias, estado, notas, tecnico_id")
      .in("planta_id", plantasIds)
      .order("fecha_programada");
    if (folioReporte) qb = qb.eq("folio", folioReporte);
    const { data: trabajosRaw } = await qb;
    // Días calendario de la ventana (la columna `fecha` de los diarios es date).
    const ventanaDesdeDia = desde ? new Date(desde).toISOString().slice(0, 10) : null;
    const ventanaHastaDia = hasta ? new Date(hasta).toISOString().slice(0, 10) : null;
    // OTs con actividad reportada dentro de la ventana, aunque su rango
    // programado ya haya vencido (servicios que se extienden por atrasos).
    const idsConActividad = new Set<string>();
    if ((trabajosRaw ?? []).length && (ventanaDesdeDia || ventanaHastaDia)) {
      const idsRaw = (trabajosRaw ?? []).map((t: any) => t.id);
      let actQb = supabase.from("trabajo_reportes_diarios").select("trabajo_id").in("trabajo_id", idsRaw);
      if (ventanaDesdeDia) actQb = actQb.gte("fecha", ventanaDesdeDia);
      if (ventanaHastaDia) actQb = actQb.lte("fecha", ventanaHastaDia);
      const { data: act } = await actQb;
      for (const r of (act ?? []) as any[]) idsConActividad.add(r.trabajo_id);
    }
    const trabajos = (trabajosRaw ?? []).filter((t: any) => {
      if (desdeMs === null || hastaMs === null) return true;
      if (idsConActividad.has(t.id)) return true;
      const inicio = new Date(t.fecha_programada).getTime();
      const duracion = Math.max(1, Number(t.duracion_dias ?? 1));
      const fin = inicio + duracion * 86400000 - 1;
      return inicio <= hastaMs && fin >= desdeMs;
    });


    const trabajoIds = trabajos.map((t) => t.id);
    let diarios: any[] = [];
    if (trabajoIds.length) {
      let diariosQb = supabase
        .from("trabajo_reportes_diarios")
        .select("id, trabajo_id, fecha, fase, hora_inicio, hora_fin, tecnico_id, paneles_limpiados, horas_trabajadas, avance_pct, watts_panel, tds_ppm, angulo_inclinacion, presion_agua_psi, agua_galones, trabajo_realizado, hallazgos, observaciones, bloqueos")
        .in("trabajo_id", trabajoIds)
        .order("fecha", { ascending: true });
      if (desde) diariosQb = diariosQb.gte("fecha", new Date(desde).toISOString().slice(0, 10));
      if (hasta) diariosQb = diariosQb.lte("fecha", new Date(hasta).toISOString().slice(0, 10));
      const { data: dd } = await diariosQb;
      diarios = dd ?? [];
    }
    const avancesReales = await avanceRealPorTrabajo(supabase, trabajos.map((t) => t.id));
    // A2: los indicadores salen de los datos, no del texto de la IA.
    const guardados = Array.isArray((rep).indicadores) ? ((rep).indicadores as ReporteKpi[]) : null;
    if (guardados && guardados.length) {
      const internos = /^(Horas trabajadas|Agua utilizada)$/i;
      kpis = normalizarKpisMetaDiaria(
        audiencia === "cliente" ? guardados.filter((k) => !internos.test(k.label)) : guardados,
        audiencia,
      );
    } else {
      const { consolidarDiarios: cd } = await import("@/lib/consolidar-diarios");
      kpis = construirIndicadores(
        cd(diarios as any[], new Map()) as any[],
        kpisAvanceReal(avancesReales, new Map(trabajos.map((t) => [t.id, t.folio])), audiencia),
        audiencia,
      );
    }
    const diarioIds = diarios.map((d: any) => d.id).filter(Boolean);

    // Snapshots del layout satelital con las zonas marcadas por día.
    const mapasDiarios: {
      fecha: string;
      folio: string | null;
      planta: string | null;
      dataUrl: string | null;
      basemap: any | null;
      zonas: { nombre: string; poligono: { lat: number; lng: number }[]; estado: string | null }[];
      completadas: number;
      en_proceso: number;
      total: number;
    }[] = [];
    if (diarioIds.length) {
      try {
        const { data: marcas } = await supabase
          .from("reporte_diario_zonas")
          .select("reporte_diario_id, zona_id, estado")
          .in("reporte_diario_id", diarioIds);
        if (marcas && marcas.length) {
          const plantaIdsZonas = plantasIds;
          const { data: zonasAll } = await supabase
            .from("planta_zonas")
            .select("id, planta_id, nombre, poligono, plantas(nombre)")
            .in("planta_id", plantaIdsZonas)
            .eq("activo", true);
          const zonaPorId = new Map((zonasAll ?? []).map((z: any) => [z.id, z]));
          const folioPorTrabajo = new Map(trabajos.map((t: any) => [t.id, t.folio]));
          const marcasPorDiario = new Map<string, any[]>();
          for (const m of marcas as any[]) {
            const arr = marcasPorDiario.get(m.reporte_diario_id) ?? [];
            arr.push(m);
            marcasPorDiario.set(m.reporte_diario_id, arr);
          }
          const { snapshotZonas, basemapZonas } = await import("@/lib/mapa-estatico.server");
          const diariosOrdenados = [...diarios].sort((a: any, b: any) =>
            String(a.fecha).localeCompare(String(b.fecha)),
          );
          for (const d of diariosOrdenados.slice(0, 12)) {
            const ms = marcasPorDiario.get(d.id) ?? [];
            if (!ms.length) continue;
            const plantaZonas = (zonasAll ?? []).filter(
              (z: any) => z.planta_id === (zonaPorId.get(ms[0].zona_id))?.planta_id,
            );
            const estadoPorZona = new Map(ms.map((m: any) => [m.zona_id, m.estado]));
            const zonasEstado = plantaZonas.map((z: any) => ({
              poligono: Array.isArray(z.poligono) ? z.poligono : [],
              estado: (estadoPorZona.get(z.id)) ?? null,
            }));
            const dataUrl = await snapshotZonas(zonasEstado);
            // Si Google Static Maps no está habilitada, componemos la vista
            // satelital con teselas para que el cliente sí vea el terreno.
            const basemap = dataUrl ? null : await basemapZonas(zonasEstado);
            // Si la imagen satelital no está disponible (clave sin permisos de
            // Static Maps), igual publicamos el layout vectorial con los
            // polígonos dibujados para que la sección nunca quede vacía.
            mapasDiarios.push({
              fecha: String(d.fecha ?? ""),
              folio: folioPorTrabajo.get(d.trabajo_id) ?? null,
              planta: (plantaZonas[0])?.plantas?.nombre ?? null,
              dataUrl,
              basemap,
              zonas: plantaZonas.map((z: any) => ({
                nombre: String(z.nombre ?? ""),
                poligono: Array.isArray(z.poligono) ? z.poligono : [],
                estado: (estadoPorZona.get(z.id)) ?? null,
              })),
              completadas: ms.filter((m: any) => m.estado === "completada").length,
              en_proceso: ms.filter((m: any) => m.estado === "en_proceso").length,
              total: plantaZonas.length,
            });
          }
        }
      } catch (e) {
        console.error("No se pudieron generar los mapas de avance", e);
      }
    }
    let evidencias: { trabajo: string; descripcion: string | null; url: string }[] = [];
    // Imágenes extraídas de los PDFs subidos (fotos/gráficas embebidas).
    // Se agregan al final como "evidencia" para que aparezcan en la sección
    // de Evidencias Fotográficas del reporte ejecutivo.
    const evidenciasPdf: { trabajo: string; descripcion: string | null; dataUrl: string }[] = [];
    if (trabajoIds.length) {
      let evidenciasQb = supabase
        .from("trabajo_evidencias")
        .select("trabajo_id, reporte_diario_id, storage_path, descripcion, categoria")
        .in("trabajo_id", trabajoIds)
        .order("categoria", { ascending: true })
        .limit(500);
      if (desde || hasta) {
        evidenciasQb = diarioIds.length
          ? evidenciasQb.in("reporte_diario_id", diarioIds)
          : evidenciasQb.eq("reporte_diario_id", "00000000-0000-0000-0000-000000000000");
      }
      const { data: evs } = await evidenciasQb;
      if (evs?.length) {
        const folioPorId = new Map(trabajos.map((t) => [t.id, t.folio]));
        const { data: signed } = await supabase.storage
          .from("trabajos-evidencia")
          .createSignedUrls(evs.map((e) => e.storage_path), 3600);
        const urlByPath = new Map((signed ?? []).map((s) => [s.path!, s.signedUrl]));
        const orden: Record<string, number> = { antes: 0, durante: 1, despues: 2, "después": 2, anomalia: 3, anomalía: 3, mediciones: 4 };
        const evsOrdenadas = [...evs].sort((a: any, b: any) => {
          const ca = String(a.categoria ?? "").toLowerCase();
          const cb = String(b.categoria ?? "").toLowerCase();
          return (orden[ca] ?? 9) - (orden[cb] ?? 9);
        });
        evidencias = evsOrdenadas.map((e: any) => ({
          trabajo: folioPorId.get(e.trabajo_id) ?? "—",
          descripcion: e.descripcion ?? (e.categoria ? String(e.categoria).toUpperCase() : null),
          url: urlByPath.get(e.storage_path) ?? "",
          categoria: (e.categoria ?? null) as string | null,
        })).filter((e) => e.url);
      }

      // Extraer imágenes JPEG embebidas en los PDFs subidos por los técnicos
      // (fotos operativas, tablas rasterizadas, gráficas). Se agregan como
      // "evidencia" adicional en el reporte sin citar el origen documental.
      const { data: pdfsRows } = await supabase
        .from("trabajo_reportes_pdf")
        .select("trabajo_id, fecha, storage_path")
        .in("trabajo_id", trabajoIds)
        .limit(20);
      if (pdfsRows?.length) {
        const folioPorId = new Map(trabajos.map((t) => [t.id, t.folio]));
        const desdeDia = desde ? new Date(desde).toISOString().slice(0, 10) : null;
        const hastaDia = hasta ? new Date(hasta).toISOString().slice(0, 10) : null;
        const pdfsFiltrados = (pdfsRows as any[]).filter((p: any) => {
          if (!desdeDia && !hastaDia) return true;
          if (!p.fecha) return false;
          const fecha = String(p.fecha).slice(0, 10);
          return (!desdeDia || fecha >= desdeDia) && (!hastaDia || fecha <= hastaDia);
        });
        const { data: signedPdfs } = await supabase.storage
          .from("trabajos-evidencia")
          .createSignedUrls(pdfsFiltrados.map((p: any) => p.storage_path), 600);
        const urlByPath = new Map((signedPdfs ?? []).map((s: any) => [s.path!, s.signedUrl]));
        const { extractJpegImagesFromPdf } = await import("@/lib/pdf-images.server");
        const MAX_TOTAL_IMGS = 12;
        for (const p of pdfsFiltrados) {
          if (evidenciasPdf.length >= MAX_TOTAL_IMGS) break;
          const url = urlByPath.get(p.storage_path);
          if (!url) continue;
          try {
            const resp = await fetch(url);
            if (!resp.ok) continue;
            const buf = new Uint8Array(await resp.arrayBuffer());
            const imgs = await extractJpegImagesFromPdf(buf, {
              maxImages: MAX_TOTAL_IMGS - evidenciasPdf.length,
            });
            const folio = folioPorId.get(p.trabajo_id) ?? "—";
            for (const dataUrl of imgs) {
              evidenciasPdf.push({ trabajo: folio, descripcion: "Registro fotográfico de campo", dataUrl });
              if (evidenciasPdf.length >= MAX_TOTAL_IMGS) break;
            }
          } catch { /* ignorar PDFs no procesables */ }
        }
      }
    }

    // Series para gráficas — enfoque en avance diario de los trabajos
    // (ejecutado vs. lo que debe finalizarse). Si el periodo solo tiene
    // PDFs (sin diarios), degradamos a la distribución operativa disponible.
    const trabajosArr = trabajos ?? [];
    const porEstado = new Map<string, number>();
    const porServicio = new Map<string, number>();
    for (const t of trabajosArr) {
      porEstado.set(t.estado, (porEstado.get(t.estado) ?? 0) + 1);
      porServicio.set(t.servicio, (porServicio.get(t.servicio) ?? 0) + 1);
    }
    const graficas: { titulo: string; descripcion?: string; fuente: string; series: { label: string; value: number }[]; unidad?: string }[] = [];

    // ---- Avance real del servicio por trabajo -------------------------------
    // Fuente: mismo cálculo que la tarjeta de avance de la OT (áreas marcadas
    // en el mapa → paneles intervenidos sobre el parque → estado de la OT).
    if (diarios.length) {
      const folioPorId = new Map(trabajos.map((t) => [t.id, t.folio]));
      // Universo: todo trabajo con al menos un reporte diario en el periodo.
      const trabajosConDiario = new Set(diarios.map((d) => d.trabajo_id));
      const avanceSeries = Array.from(trabajosConDiario)
        .map((tid) => ({
          label: folioPorId.get(tid) ?? "—",
          value: Math.max(0, Math.min(100, Math.round(avancesReales.get(tid)?.pct ?? 0))),
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
      if (avanceSeries.length) {
        graficas.push({
          titulo: "Avance del servicio por trabajo (%)",
          descripcion: audiencia === "cliente"
            ? "Avance del servicio realizado en su planta, calculado sobre las áreas y los paneles ya intervenidos."
            : "Avance real de cada OT calculado sobre las áreas marcadas en el mapa y los paneles intervenidos del parque de la planta (mismo valor que la tarjeta de avance de la OT).",
          fuente: "Áreas marcadas en el mapa · paneles intervenidos · estado de la OT",
          unidad: "%",
          series: avanceSeries,
        });
      }


      // Paneles limpiados acumulados por día — muestra ritmo de ejecución.
      const panelesPorDia = new Map<string, number>();
      for (const d of diarios) {
        if (!d.fecha) continue;
        const key = String(d.fecha);
        panelesPorDia.set(key, (panelesPorDia.get(key) ?? 0) + Number(d.paneles_limpiados ?? 0));
      }
      const panelesSeries = Array.from(panelesPorDia.entries())
        .filter(([, v]) => v > 0)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-14)
        .map(([k, v]) => ({ label: k, value: v }));
      if (panelesSeries.length) {
        graficas.push({
          titulo: "Ejecución diaria — paneles limpiados",
          descripcion: "Ritmo diario del equipo en campo durante el periodo.",
          fuente: "Reportes diarios · paneles limpiados",
          series: panelesSeries,
        });
      }

      // Horas trabajadas por día.
      const horasPorDia = new Map<string, number>();
      for (const d of diarios) {
        if (!d.fecha) continue;
        horasPorDia.set(String(d.fecha), (horasPorDia.get(String(d.fecha)) ?? 0) + Number(d.horas_trabajadas ?? 0));
      }
      const horasSeries = Array.from(horasPorDia.entries())
        .filter(([, v]) => v > 0)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-14)
        .map(([k, v]) => ({ label: k, value: Number(v.toFixed(1)) }));
      if (horasSeries.length) {
        graficas.push({
          titulo: "Horas de campo por día",
          descripcion: "Esfuerzo del equipo por jornada dentro del periodo.",
          fuente: "Reportes diarios · horas trabajadas",
          unidad: "h",
          series: horasSeries,
        });
      }
    } else {
      // No hay diarios: caso "solo PDFs". Mostramos la información operativa
      // que aparece en los PDFs (folio × servicio) para no dejar la sección
      // vacía y evidenciar únicamente lo que sí se registró.
      if (porServicio.size > 0) {
        graficas.push({
          titulo: "Trabajos ejecutados por tipo de servicio",
          descripcion: "Distribución operativa del periodo según los registros disponibles.",
          fuente: "Trabajos del periodo",
          series: Array.from(porServicio.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([k, v]) => ({ label: k, value: v })),
        });
      }
      if (porEstado.size > 0) {
        graficas.push({
          titulo: "Trabajos por estado de cierre",
          descripcion: `Distribución de las ${trabajosArr.length} órdenes de trabajo del periodo.`,
          fuente: "Trabajos del periodo",
          series: Array.from(porEstado.entries()).map(([k, v]) => ({ label: k, value: v })),
        });
      }
    }

    // ----- Variante "interno": reemplazamos el texto redactado por IA con
    // el contenido crudo que los técnicos enviaron (trabajo_reportes +
    // trabajo_reportes_diarios). El operador ve exactamente lo ingresado,
    // sin edición ejecutiva.
    if (data.variante === "interno" && trabajoIds.length) {
      const [tr, td] = await Promise.all([
        supabase
          .from("trabajo_reportes")
          .select("trabajo_id, condiciones_sitio, trabajo_realizado, hallazgos, recomendaciones, cliente_observaciones")
          .in("trabajo_id", trabajoIds),
        Promise.resolve({ data: diarios }),
      ]);
      const folioPorId = new Map(trabajos.map((t) => [t.id, t.folio]));
      const resumenBloques: string[] = [];
      const hallazgosBloques: string[] = [];
      const recBloques: string[] = [];
      for (const r of ((tr.data ?? []) as any[])) {
        const f = folioPorId.get(r.trabajo_id) ?? "—";
        if (r.condiciones_sitio) resumenBloques.push(`[${f}] Condiciones del sitio: ${r.condiciones_sitio}`);
        if (r.trabajo_realizado) resumenBloques.push(`[${f}] Trabajo realizado: ${r.trabajo_realizado}`);
        if (r.cliente_observaciones) resumenBloques.push(`[${f}] Observaciones del cliente: ${r.cliente_observaciones}`);
        if (r.hallazgos) hallazgosBloques.push(`[${f}] ${r.hallazgos}`);
        if (r.recomendaciones) recBloques.push(`[${f}] ${r.recomendaciones}`);
      }
      for (const d of ((td.data ?? []) as any[])) {
        const f = folioPorId.get(d.trabajo_id) ?? "—";
        const fecha = String(d.fecha ?? "");
        if (d.trabajo_realizado) resumenBloques.push(`[${f} · ${fecha}] ${d.trabajo_realizado}`);
        if (d.observaciones) resumenBloques.push(`[${f} · ${fecha}] Observaciones: ${d.observaciones}`);
        if (d.hallazgos) hallazgosBloques.push(`[${f} · ${fecha}] ${d.hallazgos}`);
        if (d.bloqueos) recBloques.push(`[${f} · ${fecha}] Bloqueo/riesgo: ${d.bloqueos}`);
      }
      if (resumenBloques.length) resumen = resumenBloques.join("\n\n");
      if (hallazgosBloques.length) hallazgos = hallazgosBloques;
      if (recBloques.length) recomendaciones = recBloques;
      if (!resumen) resumen = "Sin texto adicional cargado por los técnicos.";
    }

    // Nombres de técnicos por trabajo (principal + extras de trabajo_tecnicos)
    const tecnicosPorTrabajo = new Map<string, string[]>();
    const nombreTecnicoPorId = new Map<string, string>();
    {
      const principalIds = Array.from(new Set(trabajos.map((t: any) => t.tecnico_id).filter(Boolean)));
      const { data: extras } = trabajoIds.length
        ? await supabase.from("trabajo_tecnicos").select("trabajo_id, tecnico_id").in("trabajo_id", trabajoIds)
        : { data: [] as any[] };
      const extraIds = (extras ?? []).map((e: any) => e.tecnico_id);
      const diarioTecnicoIds = diarios.map((d: any) => d.tecnico_id).filter(Boolean);
      const allIds = Array.from(new Set([...principalIds, ...extraIds, ...diarioTecnicoIds])) as string[];
      const nombrePorId = nombreTecnicoPorId;
      if (allIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name, nombres, apellidos").in("id", allIds);
        for (const p of (profs ?? []) as any[]) {
          const nombre = toProfileName(p);
          if (nombre) nombrePorId.set(p.id, nombre);
        }
      }
      for (const t of trabajos as any[]) {
        const arr: string[] = [];
        if (t.tecnico_id && nombrePorId.get(t.tecnico_id)) arr.push(nombrePorId.get(t.tecnico_id)!);
        for (const e of (extras ?? []) as any[]) {
          if (e.trabajo_id === t.id) {
            const n = nombrePorId.get(e.tecnico_id);
            if (n && !arr.includes(n)) arr.push(n);
          }
        }
        for (const d of diarios) {
          if (d.trabajo_id === t.id) {
            const n = nombrePorId.get(d.tecnico_id);
            if (n && !arr.includes(n)) arr.push(n);
          }
        }
        tecnicosPorTrabajo.set(t.id, arr);
      }
    }

    // Consolidamos los reportes diarios por (OT, día) para que, cuando dos o
    // más técnicos reporten la misma planta el mismo día, el ejecutivo muestre
    // el aporte combinado del equipo en una sola línea.
    const folioPorTrabajoPdf = new Map(trabajos.map((t: any) => [t.id, t.folio]));
    const { consolidarDiarios: consolidarDiariosPdf } = await import("@/lib/consolidar-diarios");
    const diariosConsolidadosPdf = consolidarDiariosPdf(diarios as any[], nombreTecnicoPorId);

    return {
      titulo: (rep).titulo,
      cliente: (rep).clientes?.nombre ?? "—",
      contacto: (rep).clientes?.contacto ?? null,
      color_acento: (rep).clientes?.color_acento ?? null,
      planta: (rep).plantas?.nombre ?? "Todas las plantas",
      periodo: (rep).periodo,
      modelo: (rep).model_used,
      // A3: fecha de emisión real guardada por la base de datos (borrador = sin emitir).
      emitido_at: (rep).fecha_emision
        ? new Date((rep).fecha_emision).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", year: "numeric", month: "long", day: "numeric" })
        : "Borrador — sin emitir",
      documento_codigo: (rep).codigo_documento ?? "BORRADOR",
      documento_version: String((rep).version_label ?? `v${(rep).version ?? 1}.0`).replace(/^v/i, ""),
      folio_ot: folioReporte ?? (trabajos.length === 1 ? trabajos[0].folio : null),
      revision_ia_pendiente: !!(rep).revision_ia_pendiente,
      resumen,
      kpis,
      hallazgos,
      recomendaciones,
      trabajos: trabajos.map((t) => ({
        folio: t.folio,
        servicio: t.servicio,
        fecha: new Date(t.fecha_programada).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" }),
        estado: t.estado,
        tecnico: (tecnicosPorTrabajo.get((t).id) ?? []).join(", ") || null,
        notas: t.notas,
      })),
      resumen_por_planta: (() => {
        const map = new Map<string, { total: number; completados: number; servicios: Set<string> }>();
        for (const t of trabajos) {
          const key = (rep).plantas?.nombre ?? "Planta";
          const cur = map.get(key) ?? { total: 0, completados: 0, servicios: new Set<string>() };
          cur.total += 1;
          if ((t).estado === "completado") cur.completados += 1;
          cur.servicios.add((t).servicio ?? "—");
          map.set(key, cur);
        }
        return Array.from(map.entries()).map(([planta, v]) => ({
          planta,
          total: v.total,
          completados: v.completados,
          servicios: Array.from(v.servicios).join(", "),
        }));
      })(),
      resumen_por_servicio: (() => {
        const map = new Map<string, { total: number; completados: number }>();
        for (const t of trabajos) {
          const key = (t).servicio ?? "—";
          const cur = map.get(key) ?? { total: 0, completados: 0 };
          cur.total += 1;
          if ((t).estado === "completado") cur.completados += 1;
          map.set(key, cur);
        }
        return Array.from(map.entries()).map(([servicio, v]) => ({ servicio, total: v.total, completados: v.completados }));
      })(),
      evidencias,
      evidencias_pdf: evidenciasPdf,
      graficas,
      reportes_diarios: diariosConsolidadosPdf.map((d) => ({
        fecha: d.fecha,
        folio: d.trabajo_id ? folioPorTrabajoPdf.get(d.trabajo_id) ?? null : null,
        tecnicos: d.tecnicos.join(", ") || null,
        aportes: d.aportes,
        hora_inicio: d.hora_inicio,
        hora_fin: d.hora_fin,
        avance_pct: d.avance_pct,
        paneles_limpiados: d.paneles_limpiados,
        watts_panel: d.watts_panel,
        watts_totales: d.watts_totales,
        tds_ppm: d.tds_ppm,
        angulo_inclinacion: d.angulo_inclinacion,
        presion_agua_psi: d.presion_agua_psi,
        agua_galones: d.agua_galones,
        horas_trabajadas: d.horas_trabajadas,
      })),
      // Desglose individual por técnico (opcional en el PDF): los totales por
      // día siguen siendo los consolidados de arriba; esto solo los detalla.
      desglose_tecnico: diariosConsolidadosPdf.flatMap((d) =>
        d.por_tecnico.map((t) => ({
          fecha: d.fecha,
          folio: d.trabajo_id ? folioPorTrabajoPdf.get(d.trabajo_id) ?? null : null,
          tecnico: t.tecnico,
          hora_inicio: t.hora_inicio,
          hora_fin: t.hora_fin,
          paneles_limpiados: t.paneles_limpiados,
          agua_galones: t.agua_galones,
          horas_trabajadas: t.horas_trabajadas,
          avance_pct: t.avance_pct,
        })),
      ),
      mapas_diarios: mapasDiarios,
      responsable_id: (rep).generado_por ?? null,
      reporte_id: (rep).id,
    };
  });

/** Devuelve el nombre completo + cargo del usuario que generó el reporte (firma ejecutiva). */
