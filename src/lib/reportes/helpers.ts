import { z } from "zod";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const SV_OFFSET = "-06:00";
export const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseLegacySingleDayPeriod(periodo: unknown): { desde: string; hasta: string } | null {
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

export function toProfileName(profile: any): string | null {
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
export async function extraerTextoPdf(buf: Uint8Array, maxChars = 60000): Promise<string | null> {
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

export type Proveedor = "gemini" | "openai" | "auto";

export const PROVIDER_MODELS: Record<"gemini" | "openai", { primary: string; fallback: string }> = {
  gemini: { primary: "google/gemini-2.5-flash", fallback: "google/gemini-2.5-flash-lite" },
  openai: { primary: "openai/gpt-5-mini", fallback: "openai/gpt-5-nano" },
};

export function buildAttempts(proveedor: Proveedor): Array<{ model: string; wait: number }> {
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

export type ReporteKpi = { label: string; value: string };

export function limpiarValorPorcentajeMetaDiaria(value: string): string {
  return String(value ?? "")
    .replace(/\s*\(?\s*(?:respecto|sobre|del|de)\s+(?:al|a la|del|de la)?\s*(?:parque|planta|parque total|total de la planta|capacidad instalada|paneles de la planta)[^)]*\)?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Audiencia del reporte: el reporte del cliente habla de "avance del servicio"
 * en su planta; el interno mantiene la referencia a la meta diaria de la OT.
 */
export type Audiencia = "cliente" | "interno";

export function etiquetaAvance(audiencia: Audiencia, folio?: string | null): string {
  if (audiencia === "cliente") {
    return folio ? `Avance del servicio OT ${folio}` : "Avance del servicio en su planta";
  }
  return folio ? `Avance real del servicio OT ${folio}` : "Avance real del servicio del trabajo";
}

export function aclaracionAvance(audiencia: Audiencia): string {
  return audiencia === "cliente"
    ? "del servicio comprometido para su planta en el período"
    : "de avance real sobre la planta (zonas marcadas y paneles intervenidos); no es el cumplimiento de la meta diaria";
}

export function normalizarKpisMetaDiaria(kpisInput: ReporteKpi[], audiencia: Audiencia = "interno"): ReporteKpi[] {
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
      : /avance real/i.test(base) && /no corresponde|no es|no representa/i.test(base);
    const value = yaAclarado ? base : `${base} ${aclaracion}`.trim();
    return { label, value };
  });
}

export type AvanceOT = {
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
export async function avanceRealPorTrabajo(
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

export function kpisAvanceReal(
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

export function combinarKpisConMetaDiaria(
  kpisInput: ReporteKpi[],
  kpisMeta: ReporteKpi[],
  audiencia: Audiencia = "interno",
): ReporteKpi[] {
  const normalizados = normalizarKpisMetaDiaria(kpisInput, audiencia);
  if (!kpisMeta.length) return normalizados;
  const sinKpisAvance = normalizados.filter((k) => !/cumplimiento de meta diaria|avance|progreso/i.test(k.label));
  return [...kpisMeta, ...sinKpisAvance].slice(0, Math.max(5, kpisMeta.length));
}
