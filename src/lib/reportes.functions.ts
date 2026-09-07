import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { humanizarTexto } from "@/lib/humanizar-texto";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SV_OFFSET = "-06:00";
const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function parseLegacySingleDayPeriod(periodo: unknown): { desde: string; hasta: string } | null {
  const raw = String(periodo ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const day = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return { desde: `${day}T00:00:00.000${SV_OFFSET}`, hasta: `${day}T23:59:59.999${SV_OFFSET}` };
  }
  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const day = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return { desde: `${day}T00:00:00.000${SV_OFFSET}`, hasta: `${day}T23:59:59.999${SV_OFFSET}` };
  }
  return null;
}

function toProfileName(profile: any): string | null {
  const displayName = String(profile?.display_name ?? "").trim();
  const fullName = [profile?.nombres, profile?.apellidos]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return displayName || fullName || null;
}

/**
 * Extrae el texto de un PDF (buffer) usando unpdf (compatible con Workers).
 * Devuelve una cadena limpia y truncada a maxChars para no reventar el prompt.
 * Si falla, retorna null (el llamador decide qué hacer).
 */
async function extraerTextoPdf(buf: Uint8Array, maxChars = 60000): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const raw = Array.isArray(text) ? text.join("\n") : text;
    if (!raw) return null;
    const clean = raw
      .replace(/\u0000/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!clean) return null;
    return clean.length > maxChars ? clean.slice(0, maxChars) + "\n…[texto truncado]…" : clean;
  } catch {
    return null;
  }
}

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

type ReporteKpi = { label: string; value: string };

function limpiarValorPorcentajeMetaDiaria(value: string): string {
  return String(value ?? "")
    .replace(/\s*\(?\s*(?:respecto|sobre|del|de)\s+(?:al|a la|del|de la)?\s*(?:parque|planta|parque total|total de la planta|capacidad instalada|paneles de la planta)[^)]*\)?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Audiencia del reporte: el reporte del cliente habla de "avance del servicio"
 * en su planta; el interno mantiene la referencia a la meta diaria de la OT.
 */
type Audiencia = "cliente" | "interno";

function etiquetaAvance(audiencia: Audiencia, folio?: string | null): string {
  if (audiencia === "cliente") {
    return folio ? `Avance del servicio OT ${folio}` : "Avance del servicio en su planta";
  }
  return folio ? `Cumplimiento de meta diaria OT ${folio}` : "Cumplimiento de meta diaria del trabajo";
}

function aclaracionAvance(audiencia: Audiencia): string {
  return audiencia === "cliente"
    ? "del servicio comprometido para su planta en el período"
    : "respecto a la meta diaria planificada de la OT; no corresponde al avance total del parque";
}

function normalizarKpisMetaDiaria(kpisInput: ReporteKpi[], audiencia: Audiencia = "interno"): ReporteKpi[] {
  return kpisInput.map((k) => {
    const labelRaw = String(k.label ?? "").trim();
    const valueRaw = String(k.value ?? "").trim();
    const contienePorcentaje = /\d+(?:[,.]\d+)?\s*%/.test(valueRaw);
    const hablaDeAvance = /avance|cumplimiento|progreso|meta/i.test(`${labelRaw} ${valueRaw}`);
    if (!contienePorcentaje && !hablaDeAvance) return k;

    const folioMatch = /\(([^)]+)\)/.exec(labelRaw)?.[1] ?? null;
    const label = etiquetaAvance(audiencia, folioMatch);
    const base = limpiarValorPorcentajeMetaDiaria(valueRaw) || valueRaw;
    const aclaracion = aclaracionAvance(audiencia);
    const yaAclarado = audiencia === "cliente"
      ? /servicio/i.test(base)
      : /meta diaria/i.test(base) && /no corresponde|no es|no representa/i.test(base);
    const value = yaAclarado ? base : `${base} ${aclaracion}`.trim();
    return { label, value };
  });
}

type AvanceOT = {
  pct: number;
  fuente: "zonas" | "paneles" | "meta";
  paneles: number;
  parque: number | null;
};

/**
 * Avance real de cada OT calculado igual que la tarjeta de avance de la OT
 * (`getAvanceTrabajo`): zonas marcadas en el mapa → paneles limpiados sobre el
 * parque de la planta → meta diaria máxima reportada. Así el porcentaje del
 * reporte ejecutivo coincide siempre con el que ve el equipo en la OT.
 */
async function avanceRealPorTrabajo(
  supabase: any,
  trabajoIds: string[],
): Promise<Map<string, AvanceOT>> {
  const out = new Map<string, AvanceOT>();
  if (!trabajoIds.length) return out;
  const [{ data: trabs }, { data: diarios }, { data: marcas }] = await Promise.all([
    supabase.from("trabajos").select("id, estado, planta_id, plantas(paneles)").in("id", trabajoIds),
    supabase.from("trabajo_reportes_diarios")
      .select("trabajo_id, paneles_limpiados, avance_pct").in("trabajo_id", trabajoIds),
    supabase.from("reporte_diario_zonas")
      .select("trabajo_id, zona_id, estado").in("trabajo_id", trabajoIds),
  ]);
  const plantaIds = Array.from(
    new Set(((trabs ?? []) as any[]).map((t) => t.planta_id).filter(Boolean)),
  ) as string[];
  const zonasPorPlanta = new Map<string, number>();
  if (plantaIds.length) {
    const { data: zonas } = await supabase
      .from("planta_zonas").select("id, planta_id").eq("activo", true).in("planta_id", plantaIds);
    for (const z of ((zonas ?? []) as any[])) {
      zonasPorPlanta.set(z.planta_id, (zonasPorPlanta.get(z.planta_id) ?? 0) + 1);
    }
  }
  // Estado consolidado por (OT, zona): "completada" gana sobre "en_proceso".
  const zonaEstado = new Map<string, string>();
  for (const m of ((marcas ?? []) as any[])) {
    const k = `${m.trabajo_id}|${m.zona_id}`;
    if (zonaEstado.get(k) === "completada") continue;
    zonaEstado.set(k, m.estado === "completada" ? "completada" : "en_proceso");
  }
  const panelesPorTrabajo = new Map<string, number>();
  const metaPorTrabajo = new Map<string, number>();
  for (const d of ((diarios ?? []) as any[])) {
    const p = Number(d.paneles_limpiados);
    if (Number.isFinite(p)) {
      panelesPorTrabajo.set(d.trabajo_id, (panelesPorTrabajo.get(d.trabajo_id) ?? 0) + Math.max(0, p));
    }
    const a = Number(d.avance_pct);
    if (Number.isFinite(a)) {
      const pct = Math.max(0, Math.min(100, Math.round(a)));
      if (pct > (metaPorTrabajo.get(d.trabajo_id) ?? -1)) metaPorTrabajo.set(d.trabajo_id, pct);
    }
  }
  for (const t of ((trabs ?? []) as any[])) {
    const zonasTotal = t.planta_id ? zonasPorPlanta.get(t.planta_id) ?? 0 : 0;
    let completadas = 0;
    if (zonasTotal > 0) {
      for (const [k, v] of zonaEstado) {
        if (k.startsWith(`${t.id}|`) && v === "completada") completadas++;
      }
    }
    const paneles = panelesPorTrabajo.get(t.id) ?? 0;
    const parqueRaw = Number(t.plantas?.paneles);
    const parque = Number.isFinite(parqueRaw) && parqueRaw > 0 ? Math.floor(parqueRaw) : null;
    const pctZonas = zonasTotal > 0 ? Math.round((completadas / zonasTotal) * 100) : null;
    const pctPaneles = parque ? Math.min(100, Math.round((paneles / parque) * 100)) : null;
    let pct: number | null = null;
    let fuente: AvanceOT["fuente"] = "meta";
    if (t.estado === "completado") {
      // Una OT cerrada está 100% ejecutada, aunque falten zonas por marcar.
      pct = 100;
      fuente = pctZonas !== null && (pctPaneles === null || pctZonas >= pctPaneles) ? "zonas" : "paneles";
    } else if (pctZonas !== null || pctPaneles !== null) {
      // Se toma la evidencia más avanzada: zonas marcadas en el mapa o paneles
      // intervenidos sobre el parque, para no subestimar lo ya ejecutado.
      pct = Math.max(pctZonas ?? 0, pctPaneles ?? 0);
      fuente = (pctZonas ?? 0) >= (pctPaneles ?? 0) ? "zonas" : "paneles";
    } else {
      pct = metaPorTrabajo.get(t.id) ?? null;
      fuente = "meta";
    }
    if (pct === null) continue;
    out.set(t.id, { pct, fuente, paneles, parque });
  }
  return out;
}

function kpisAvanceReal(
  avances: Map<string, AvanceOT>,
  folioPorId: Map<string, string>,
  audiencia: Audiencia = "interno",
): ReporteKpi[] {
  return Array.from(avances.entries())
    .map(([trabajoId, a]) => ({
      pct: a.pct,
      label: etiquetaAvance(audiencia, folioPorId.get(trabajoId) ?? null),
      value: `${a.pct}% ${aclaracionAvance(audiencia)}`,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 2)
    .map(({ label, value }) => ({ label, value }));
}

function combinarKpisConMetaDiaria(
  kpisInput: ReporteKpi[],
  kpisMeta: ReporteKpi[],
  audiencia: Audiencia = "interno",
): ReporteKpi[] {
  const normalizados = normalizarKpisMetaDiaria(kpisInput, audiencia);
  if (!kpisMeta.length) return normalizados;
  const sinKpisAvance = normalizados.filter((k) => !/cumplimiento de meta diaria|avance|progreso/i.test(k.label));
  return [...kpisMeta, ...sinKpisAvance].slice(0, Math.max(5, kpisMeta.length));
}

export const listReportes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("reportes")
      .select("id, cliente_id, planta_id, periodo, titulo, insight_resumen, estado, model_used, created_at, desde, hasta, clientes(nombre), plantas(nombre)")
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
    const email = String((context.claims as any)?.email ?? "").toLowerCase();
    if (email !== "proyectos@easervice.app") {
      throw new Error("Forbidden: acción restringida al propietario");
    }
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
      ? await supabase.from("plantas").select("nombre, ubicacion, paneles, capacidad, eficiencia").eq("id", plantaId).single()
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
                .select("id, folio, servicio, estado, fecha_programada, duracion_dias")
                .in("planta_id", plantasIds)
                .eq("servicio", data.servicio)
            : supabase.from("trabajos")
                .select("id, folio, servicio, estado, fecha_programada, duracion_dias")
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

    const datasetCtxRaw = {

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
          bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as any);
        }
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
      ? `\n\nContenido operativo extraído de los reportes de campo (integrar como propio del análisis, sin citar origen):\n"""\n${pdfTextos.map((t, i) => `--- Registro ${i + 1} ---\n${protectorNombres.protegerTexto(t)}`).join("\n\n")}\n"""`
      : "";
    const usarAdjuntosPdf = pdfParts.length > 0 && pdfTextos.length === 0;

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
      "Redactas reportes ejecutivos en español, formales y trazables.",
      "Te basas ESTRICTAMENTE en los datos provistos: no inventes cifras, no estimes lo que no esté en el dataset.",
      "Cuando existan PDFs adjuntos, léelos íntegramente y prioriza sus mediciones, tablas y hallazgos por sobre el resumen JSON del dataset.",
      "Cita la naturaleza de la evidencia (registros operativos, mantenimientos, evidencias, reportes técnicos) en lugar de 'según la IA' o 'el modelo'.",
      "NUNCA menciones los archivos PDF adjuntos: no cites nombres de archivo, no digas 'según el PDF', 'en el documento adjunto', 'archivo del día X', ni referencias a fechas de subida, notas del PDF ni al origen documental. Integra la información como propia del análisis operativo.",
      "NUNCA menciones que el reporte fue generado por inteligencia artificial, modelo de lenguaje, IA, chatbot ni nada similar. Habla siempre como el equipo de calidad de la empresa.",
      "Estructura cada hallazgo con: condición observada, evidencia/origen del dato y posible causa. Cada recomendación con: acción, responsable sugerido y criterio de cierre (medible).",
      "Tono profesional, conciso, accionable.",
      "CRÍTICO: reproduce los nombres propios (cliente, planta, ubicación, personas) EXACTAMENTE como aparecen en el dataset. Nunca alteres su ortografía, acentos, dobles letras ni espacios.",
      "Si encuentras placeholders con formato @@NOMBRE_CANONICO_N@@, consérvalos exactamente; representan nombres oficiales que serán restaurados después.",
      "OBLIGATORIO: cuando el dataset incluya reportes diarios, debes incorporar en KPIs y/o hallazgos las mediciones operativas clave: TDS del agua utilizada (ppm), ángulo de inclinación de los paneles (°), presión de agua (PSI), watts totales recuperados (suma de watts_totales) y paneles limpiados. Para TDS, ángulo de inclinación y presión de agua NO calcules promedios: enumera cada lectura junto con la fecha en que se tomó (por ejemplo, 'TDS: 320 ppm el 12-mar-2026 y 285 ppm el 14-mar-2026'). Si alguno de estos campos tiene valor, DEBE aparecer en el reporte.",
      "PORCENTAJES DE AVANCE: el ÚNICO porcentaje de avance permitido es 'avance_por_ot[].porcentaje'. Cítalo como 'avance del servicio' de esa OT (por ejemplo, KPI: 'Avance del servicio OT T-123': '100%'). Los reportes diarios NO contienen porcentajes: no calcules, estimes ni inventes porcentajes por día, y nunca hables de 'meta diaria' ni de 'cumplimiento de la meta'.", "REDACCIÓN NATURAL: nunca copies literalmente identificadores técnicos del dataset (p. ej. 'paneles_limpiados', 'horas_trabajadas', 'avance_pct', 'watts_totales', 'tds_ppm', 'angulo_inclinacion', 'presion_agua_psi', 'en_progreso', 'hallazgos'). Redáctalos como frases naturales en español ('paneles limpiados', 'horas trabajadas', 'porcentaje de avance', 'watts totales', 'TDS (ppm)', 'ángulo de inclinación', 'presión de agua (PSI)', 'en progreso'). No uses guiones bajos, ni comillas envolviendo palabras sueltas, ni notación tipo snake_case en el texto final.",
    ].join(" ");
    const servicioLine = data.servicio
      ? `\n\nIMPORTANTE: El reporte debe centrarse EXCLUSIVAMENTE en el servicio "${data.servicio}". El dataset ya viene filtrado por ese servicio; no menciones otros tipos de servicio.`
      : "";
    const prompt = `Genera un reporte ejecutivo para el cliente "${datasetCtx.cliente}" sobre el periodo ${datasetCtx.periodo} (${data.desde} a ${data.hasta}).${servicioLine}

Datos:
${JSON.stringify(datasetCtx, null, 2)}
${contenidoPdfsBloque}
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
        if (usarAdjuntosPdf && (a.model.startsWith("google/") || a.model.startsWith("openai/"))) {
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

    if ((reportesPdf ?? []).length > 0 && pdfTextos.length === 0 && pdfParts.length === 0) {
      // Los PDFs existían pero no pudimos leerlos ni adjuntarlos.
      // Avisar en consola para diagnóstico; no romper el reporte ya generado.
      console.warn("[generarReporte] PDFs encontrados pero no procesables:", pdfsOmitidos);
    }

    // Restaurar placeholders de nombres oficiales sin aplicar correcciones por similitud.
    const fix = (s: string) => protectorNombres.restaurarTexto(s);
    const metaDiariaKpis = kpisAvanceReal(
      await avanceRealPorTrabajo(
        supabase,
        Array.from(new Set(((reportesDiarios ?? []) as any[]).map((d) => d.trabajo_id).filter(Boolean))) as string[],
      ),
      folioPorId as Map<string, string>,
    );
    const kpisHumanizados = aiResult.kpis.map((k) => ({
      label: humanizarTexto(fix(k.label)),
      value: humanizarTexto(fix(k.value)),
    }));
    aiResult = {
      ...aiResult,
      titulo: humanizarTexto(fix(aiResult.titulo)),
      resumen: humanizarTexto(fix(aiResult.resumen)),
      kpis: combinarKpisConMetaDiaria(kpisHumanizados, metaDiariaKpis),
      hallazgos: aiResult.hallazgos.map((h) => humanizarTexto(fix(h))),
      recomendaciones: aiResult.recomendaciones.map((r) => humanizarTexto(fix(r))),
    };

    const markdown = [
      `# ${aiResult.titulo}`,
      ``,
      `**Cliente:** ${datasetCtxRaw.cliente} · **Planta:** ${datasetCtxRaw.planta} · **Periodo:** ${datasetCtxRaw.periodo}`,
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
      desde: desdeTs,
      hasta: hastaTs,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Devuelve el dataset completo necesario para armar el PDF (trabajos + evidencias firmadas). */
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
    const md = (rep as any).contenido_markdown ?? "";
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
      const markdown = String((rep as any).contenido_markdown ?? "");
      const m = markdown.match(/\*\*OT:\*\*\s*([^·\n]+)/i) || markdown.match(/\bOT\s*[:#-]?\s*([A-Z0-9-]{6,})/i);
      return m?.[1]?.trim() ?? null;
    })();

    // Trabajos del periodo
    const inferredRange = !(rep as any).desde || !(rep as any).hasta
      ? parseLegacySingleDayPeriod((rep as any).periodo)
      : null;
    const desde = (rep as any).desde ?? inferredRange?.desde ?? null;
    const hasta = (rep as any).hasta ?? inferredRange?.hasta ?? null;
    const desdeMs = desde ? new Date(desde).getTime() : null;
    const hastaMs = hasta ? new Date(hasta).getTime() : null;
    let plantasIds: string[] = [];
    if ((rep as any).planta_id) plantasIds = [(rep as any).planta_id];
    else {
      const { data: ps } = await supabase.from("plantas").select("id").eq("cliente_id", (rep as any).cliente_id);
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
    kpis = combinarKpisConMetaDiaria(
      kpis,
      kpisAvanceReal(avancesReales, new Map(trabajos.map((t) => [t.id, t.folio])), audiencia),
      audiencia,
    );
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
              (z: any) => z.planta_id === (zonaPorId.get(ms[0].zona_id) as any)?.planta_id,
            );
            const estadoPorZona = new Map(ms.map((m: any) => [m.zona_id, m.estado]));
            const zonasEstado = plantaZonas.map((z: any) => ({
              poligono: Array.isArray(z.poligono) ? z.poligono : [],
              estado: (estadoPorZona.get(z.id) as any) ?? null,
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
              planta: (plantaZonas[0] as any)?.plantas?.nombre ?? null,
              dataUrl,
              basemap,
              zonas: plantaZonas.map((z: any) => ({
                nombre: String(z.nombre ?? ""),
                poligono: Array.isArray(z.poligono) ? z.poligono : [],
                estado: (estadoPorZona.get(z.id) as any) ?? null,
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
      titulo: (rep as any).titulo,
      cliente: (rep as any).clientes?.nombre ?? "—",
      contacto: (rep as any).clientes?.contacto ?? null,
      color_acento: (rep as any).clientes?.color_acento ?? null,
      planta: (rep as any).plantas?.nombre ?? "Todas las plantas",
      periodo: (rep as any).periodo,
      modelo: (rep as any).model_used,
      emitido_at: new Date((rep as any).created_at).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", year: "numeric", month: "long", day: "numeric" }),
      resumen,
      kpis,
      hallazgos,
      recomendaciones,
      trabajos: trabajos.map((t) => ({
        folio: t.folio,
        servicio: t.servicio,
        fecha: new Date(t.fecha_programada).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" }),
        estado: t.estado,
        tecnico: (tecnicosPorTrabajo.get((t as any).id) ?? []).join(", ") || null,
        notas: t.notas,
      })),
      resumen_por_planta: (() => {
        const map = new Map<string, { total: number; completados: number; servicios: Set<string> }>();
        for (const t of trabajos) {
          const key = (rep as any).plantas?.nombre ?? "Planta";
          const cur = map.get(key) ?? { total: 0, completados: 0, servicios: new Set<string>() };
          cur.total += 1;
          if ((t as any).estado === "completado") cur.completados += 1;
          cur.servicios.add((t as any).servicio ?? "—");
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
          const key = (t as any).servicio ?? "—";
          const cur = map.get(key) ?? { total: 0, completados: 0 };
          cur.total += 1;
          if ((t as any).estado === "completado") cur.completados += 1;
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
    const avanceOT = (await avanceRealPorTrabajo(supabase, [data.trabajo_id])).get(data.trabajo_id) ?? null;
    const dataset = {
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
      "CRÍTICO: reproduce los nombres propios (cliente, planta, ubicación, personas) EXACTAMENTE como aparecen en el dataset. Nunca alteres su ortografía, acentos, dobles letras ni espacios.",
      "AUDIENCIA CLIENTE: este reporte se entrega directamente al cliente dueño de la planta. Enfócate exclusivamente en información de interés para él: avance del servicio, paneles intervenidos, mediciones de calidad (presión de agua PSI, sólidos disueltos TDS, ángulo de inclinación, potencia de paneles en watts), hallazgos sobre la condición de su planta y recomendaciones de cuidado o mantenimiento.",
      "PROHIBIDO TEMAS INTERNOS: nunca menciones nombres de técnicos ni dotación, horas trabajadas u horas hombre, jornadas o cumplimiento de metas internas, consumo de agua del equipo, bloqueos o problemas de coordinación interna, ni costos. Todo eso es información operativa interna de la empresa y no debe aparecer en el reporte.",
      "PORCENTAJES DE AVANCE: el ÚNICO porcentaje de avance permitido es 'avance_servicio.porcentaje' del dataset. Cítalo tal cual como 'avance del servicio en su planta' (por ejemplo, KPI: 'Avance del servicio': '85%'). No calcules porcentajes propios, no uses porcentajes de los días individuales y nunca hables de metas diarias ni de cumplimiento de metas.", "REDACCIÓN NATURAL: nunca copies literalmente identificadores técnicos del dataset (p. ej. 'paneles_limpiados', 'avance_pct', 'watts_totales', 'tds_ppm', 'angulo_inclinacion', 'presion_agua_psi', 'en_progreso', 'hallazgos'). Redáctalos como frases naturales en español. No uses guiones bajos, ni comillas envolviendo palabras sueltas, ni notación tipo snake_case en el texto final.",
      "MEDICIONES: para TDS, ángulo de inclinación y presión de agua NO calcules promedios. Enumera cada lectura junto con la fecha en que se tomó (por ejemplo, 'TDS: 320 ppm el 12-mar-2026 y 285 ppm el 14-mar-2026'). Si el dataset incluye estas lecturas, deben aparecer sí o sí en los KPIs o en el resumen.",
    ].join(" ");
    const prompt = `Consolida el siguiente trabajo en un reporte ejecutivo final.\n\nDataset:\n${JSON.stringify(dataset, null, 2)}\n${contenidoPdfsBloque}\nResponde EXCLUSIVAMENTE con JSON válido:\n{"titulo":"string","resumen":"string","kpis":[{"label":"string","value":"string"}],"hallazgos":["string"],"recomendaciones":["string"]}`;

    if (pdfs.length > 0 && pdfTextos.length === 0 && pdfParts.length === 0) {
      console.warn("[generarEjecutivoDesdeDiarios] PDFs encontrados pero no procesables:", pdfsOmitidos);
    }

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
      const metaDiariaKpis = kpisAvanceReal(
        await avanceRealPorTrabajo(supabase, [data.trabajo_id]),
        new Map([[data.trabajo_id, String((trabajo as any).folio ?? "—")]]),
        "cliente",
      );
      const kpisHumanizados = aiResult.kpis.map((k) => ({
        label: humanizarTexto(fix(k.label)),
        value: humanizarTexto(fix(k.value)),
      }));
      aiResult = {
        ...aiResult,
        titulo: humanizarTexto(fix(aiResult.titulo)),
        resumen: humanizarTexto(fix(aiResult.resumen)),
        kpis: combinarKpisConMetaDiaria(kpisHumanizados, metaDiariaKpis, "cliente"),
        hallazgos: aiResult.hallazgos.map((h) => humanizarTexto(fix(h))),
        recomendaciones: aiResult.recomendaciones.map((r) => humanizarTexto(fix(r))),
      };
    }

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