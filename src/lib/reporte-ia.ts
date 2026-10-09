/**
 * Reglas compartidas por los dos generadores de reportes ejecutivos:
 * - el sistema arma los indicadores (cifras) a partir de los registros;
 * - la IA solo redacta texto (título, resumen, hallazgos, recomendaciones);
 * - antes de guardar, se verifica que toda cifra del texto exista en los datos.
 */
import { z } from "zod";
import { formatPotencia } from "@/lib/potencia";

export type Audiencia = "cliente" | "interno";
export type Indicador = { label: string; value: string };

/** Respuesta de la IA: solo texto. */
export const ZTextoReporte = z.object({
  titulo: z.string(),
  resumen: z.string(),
  hallazgos: z.array(z.string()),
  recomendaciones: z.array(z.string()),
});
export type TextoReporte = z.infer<typeof ZTextoReporte>;

export const FORMATO_RESPUESTA_IA = `Responde EXCLUSIVAMENTE con un objeto JSON válido (sin markdown, sin \`\`\`, sin texto adicional) con esta forma exacta:
{"titulo":"string","resumen":"string (2-3 párrafos)","hallazgos":["string (2 a 4)"],"recomendaciones":["string (2 a 4)"]}`;

export function construirSystemPrompt(audiencia: Audiencia): string {
  const base = [
    "Eres un analista senior de calidad y mantenimiento solar/térmico de EA SERVICE AND CONSULTING.",
    "Redactas en español el texto de un reporte ejecutivo formal y trazable: título, resumen, hallazgos y recomendaciones.",
    "CIFRAS: la tabla de indicadores la arma el sistema a partir de los registros y se muestra aparte. Tú NO escribes indicadores ni calculas nada: no sumes, no promedies, no estimes porcentajes ni conviertas unidades.",
    "Si necesitas citar un valor, cópialo exactamente como aparece en 'indicadores_calculados' o en los datos. Prefiere describir en palabras (por ejemplo, 'el avance del servicio se muestra en los indicadores'). Nunca escribas un número que no esté literalmente en los datos.",
    "Cuando exista contenido extraído de reportes de campo, intégralo como propio del análisis, sin citar archivos, nombres de archivo, fechas de subida ni frases como 'según el PDF'.",
    "Nunca menciones inteligencia artificial, modelos ni chatbots: hablas como el equipo de calidad de la empresa.",
    "Estructura cada hallazgo con: condición observada, evidencia y posible causa. Cada recomendación con: acción, responsable sugerido y criterio de cierre.",
    "Reproduce los nombres propios (cliente, planta, ubicación, personas) EXACTAMENTE como aparecen en los datos. Si hay placeholders @@NOMBRE_CANONICO_N@@, consérvalos tal cual.",
    "Redacción natural: nunca copies identificadores técnicos (snake_case, guiones bajos); usa frases en español.",
    "Unidades de potencia: usa W, kW, kWp y MWp tal como vienen formateadas en los datos.",
    "Nunca hables de 'meta diaria' ni de 'cumplimiento de la meta'.",
    "Tono profesional, conciso y accionable.",
  ];
  if (audiencia === "cliente") {
    base.push(
      "AUDIENCIA CLIENTE: el reporte se entrega al dueño de la planta. Enfócate en el avance del servicio, la condición de su planta, las mediciones de calidad y las recomendaciones de cuidado.",
      "PROHIBIDO TEMAS INTERNOS: no menciones técnicos ni dotación, horas trabajadas, jornadas, metas internas, consumo de agua del equipo, bloqueos de coordinación ni costos.",
    );
  }
  return base.join(" ");
}

export function parseJsonIA(raw: string): unknown {
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = s.search(/[{[]/);
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Respuesta sin JSON");
  s = s.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(s);
}

// ---------------------------------------------------------------------------
// Indicadores calculados por el sistema
// ---------------------------------------------------------------------------

type DiaConsolidado = {
  fecha: string;
  paneles_limpiados?: number | null;
  watts_totales?: number | null;
  watts_panel?: number | null;
  tds_ppm?: number | null;
  angulo_inclinacion?: number | null;
  presion_agua_psi?: number | null;
  horas_trabajadas?: number | null;
  agua_galones?: number | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmtNum = (n: number, d = 1) => n.toLocaleString("es-SV", { maximumFractionDigits: d });
const fmtFecha = (f: string) => {
  const d = new Date(`${String(f).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? f
    : d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
};

function lecturas(dias: DiaConsolidado[], campo: keyof DiaConsolidado, unidad: string): string | null {
  const items = dias
    .map((d) => ({ f: d.fecha, v: num(d[campo]) }))
    .filter((x): x is { f: string; v: number } => x.v !== null);
  if (!items.length) return null;
  const txt = items.slice(0, 6).map((x) => `${fmtNum(x.v)} ${unidad} (${fmtFecha(x.f)})`).join("; ");
  return items.length > 6 ? `${txt}; +${items.length - 6} lecturas más` : txt;
}

/**
 * Tabla de indicadores armada solo con datos de la base. `avance` son los
 * indicadores de avance real por OT (zonas → paneles → meta).
 */
export function construirIndicadores(
  dias: DiaConsolidado[],
  avance: Indicador[],
  audiencia: Audiencia,
): Indicador[] {
  const out: Indicador[] = [...avance];
  const ordenados = [...dias].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const suma = (k: keyof DiaConsolidado) => {
    const vs = ordenados.map((d) => num(d[k])).filter((v): v is number => v !== null);
    return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
  };
  const paneles = suma("paneles_limpiados");
  if (paneles !== null) out.push({ label: "Paneles intervenidos", value: fmtNum(paneles, 0) });
  const watts = suma("watts_totales");
  if (watts !== null) out.push({ label: "Potencia recuperada", value: formatPotencia(watts, { unidad: "W" }) });
  const tds = lecturas(ordenados, "tds_ppm", "ppm");
  if (tds) out.push({ label: "TDS del agua", value: tds });
  const presion = lecturas(ordenados, "presion_agua_psi", "PSI");
  if (presion) out.push({ label: "Presión de agua", value: presion });
  const angulo = lecturas(ordenados, "angulo_inclinacion", "°");
  if (angulo) out.push({ label: "Ángulo de inclinación", value: angulo });
  if (ordenados.length) out.push({ label: "Días de servicio reportados", value: String(new Set(ordenados.map((d) => d.fecha)).size) });
  if (audiencia === "interno") {
    const horas = suma("horas_trabajadas");
    if (horas !== null) out.push({ label: "Horas trabajadas", value: fmtNum(horas) });
    const agua = suma("agua_galones");
    if (agua !== null) out.push({ label: "Agua utilizada", value: `${fmtNum(agua)} gal` });
  }
  return out;
}

export function indicadoresMarkdown(ind: Indicador[]): string[] {
  return ind.map((k) => `- **${k.label}:** ${k.value}`);
}

// ---------------------------------------------------------------------------
// Verificación de cifras del texto IA
// ---------------------------------------------------------------------------

/** Normaliza "1,234.5" / "1.234,5" / "85%" a número. */
function aNumero(tok: string): number | null {
  let t = tok.replace(/[%\s]/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const RE_CIFRA = /\d+(?:[.,]\d+)*(?:\s?%)?/g;

function cifrasDe(texto: string): string[] {
  return (texto.match(RE_CIFRA) ?? []).map((s) => s.trim());
}

/** Reúne todas las cifras presentes en los datos (valores y textos). */
export function cifrasPermitidas(...fuentes: unknown[]): Set<string> {
  const set = new Set<string>();
  const add = (n: number) => {
    set.add(String(Math.round(n * 100) / 100));
    set.add(String(Math.round(n * 10) / 10));
    set.add(String(Math.round(n)));
  };
  const walk = (v: unknown) => {
    if (v === null || v === undefined) return;
    if (typeof v === "number") return add(v);
    if (typeof v === "string") {
      for (const c of cifrasDe(v)) {
        const n = aNumero(c);
        if (n !== null) add(n);
      }
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  fuentes.forEach(walk);
  return set;
}

/**
 * Devuelve las cifras del texto que NO existen en los datos. Se omiten los
 * enteros 0–10 usados para contar ("2 hallazgos", "tres zonas").
 */
export function verificarCifras(texto: TextoReporte, permitidas: Set<string>): string[] {
  const todo = [texto.titulo, texto.resumen, ...texto.hallazgos, ...texto.recomendaciones].join("\n");
  const fuera = new Set<string>();
  for (const c of cifrasDe(todo)) {
    const n = aNumero(c);
    if (n === null) continue;
    if (Number.isInteger(n) && n >= 0 && n <= 10 && !c.includes("%")) continue;
    const ok =
      permitidas.has(String(Math.round(n * 100) / 100)) ||
      permitidas.has(String(Math.round(n * 10) / 10)) ||
      (Number.isInteger(n) && permitidas.has(String(n)));
    if (!ok) fuera.add(c);
  }
  return Array.from(fuera);
}
