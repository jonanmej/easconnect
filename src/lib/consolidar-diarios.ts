/**
 * Consolidación de reportes diarios cuando dos o más técnicos cargan
 * un reporte para la misma OT y el mismo día. Las cantidades operativas
 * se suman (paneles, agua, horas), el avance toma el máximo reportado y
 * las mediciones instrumentales se promedian entre los técnicos.
 */

export type DiarioCrudo = {
  id?: string | null;
  trabajo_id?: string | null;
  tecnico_id?: string | null;
  fecha?: string | null;
  fase?: string | null;
  avance_pct?: number | string | null;
  paneles_limpiados?: number | string | null;
  agua_galones?: number | string | null;
  horas_trabajadas?: number | string | null;
  watts_panel?: number | string | null;
  tds_ppm?: number | string | null;
  angulo_inclinacion?: number | string | null;
  presion_agua_psi?: number | string | null;
  clima?: string | null;
  trabajo_realizado?: string | null;
  hallazgos?: string | null;
  bloqueos?: string | null;
  observaciones?: string | null;
};

export type DiarioConsolidado = {
  trabajo_id: string | null;
  fecha: string;
  tecnicos: string[];
  aportes: number;
  avance_pct: number | null;
  paneles_limpiados: number | null;
  agua_galones: number | null;
  horas_trabajadas: number | null;
  watts_panel: number | null;
  watts_totales: number | null;
  tds_ppm: number | null;
  angulo_inclinacion: number | null;
  presion_agua_psi: number | null;
  clima: string | null;
  trabajo_realizado: string | null;
  hallazgos: string | null;
  bloqueos: string | null;
  observaciones: string | null;
  /** Desglose individual por técnico del mismo día (no altera el total). */
  por_tecnico: {
    tecnico_id: string | null;
    tecnico: string;
    paneles_limpiados: number | null;
    agua_galones: number | null;
    horas_trabajadas: number | null;
    avance_pct: number | null;
  }[];
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function sumar(vals: (number | null)[]): number | null {
  const xs = vals.filter((v): v is number => v !== null);
  if (!xs.length) return null;
  return Number(xs.reduce((a, b) => a + b, 0).toFixed(2));
}

function promediar(vals: (number | null)[]): number | null {
  const xs = vals.filter((v): v is number => v !== null);
  if (!xs.length) return null;
  return Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1));
}

function maximo(vals: (number | null)[]): number | null {
  const xs = vals.filter((v): v is number => v !== null);
  if (!xs.length) return null;
  return Math.max(...xs);
}

function unirTextos(
  filas: DiarioCrudo[],
  campo: "trabajo_realizado" | "hallazgos" | "bloqueos" | "observaciones" | "clima",
  nombrePorId: Map<string, string>,
): string | null {
  const partes: string[] = [];
  for (const f of filas) {
    const txt = (f[campo] ?? "").toString().trim();
    if (!txt) continue;
    const nombre = f.tecnico_id ? nombrePorId.get(f.tecnico_id) : null;
    const prefijo = filas.length > 1 && nombre ? `${nombre}: ` : "";
    const linea = `${prefijo}${txt}`;
    if (!partes.includes(linea)) partes.push(linea);
  }
  return partes.length ? partes.join(" | ") : null;
}

/**
 * Agrupa los reportes diarios por (trabajo, fecha) y devuelve una fila
 * consolidada por día con el aporte combinado de todos los técnicos.
 */
export function consolidarDiarios(
  diarios: DiarioCrudo[],
  nombrePorId: Map<string, string> = new Map(),
): DiarioConsolidado[] {
  const grupos = new Map<string, DiarioCrudo[]>();
  // Deduplicación defensiva: una sola fila por (trabajo, fecha, técnico, fase).
  // Si llega más de una (caché desactualizada, edición concurrente), se
  // conserva la última recibida para no sumar dos veces el mismo aporte.
  const unicos = new Map<string, DiarioCrudo>();
  for (const d of diarios) {
    const k = `${d.trabajo_id ?? "—"}|${String(d.fecha ?? "")}|${d.tecnico_id ?? d.id ?? "—"}|${d.fase ?? "intervencion"}`;
    unicos.set(k, d);
  }
  for (const d of unicos.values()) {
    const key = `${d.trabajo_id ?? "—"}|${String(d.fecha ?? "")}`;
    const arr = grupos.get(key) ?? [];
    arr.push(d);
    grupos.set(key, arr);
  }

  const out: DiarioConsolidado[] = [];
  for (const filas of grupos.values()) {
    const base = filas[0];
    const paneles = sumar(filas.map((f) => num(f.paneles_limpiados)));
    const wattsPanel = promediar(filas.map((f) => num(f.watts_panel)));
    const wattsTotales = sumar(
      filas.map((f) => {
        const w = num(f.watts_panel);
        const p = num(f.paneles_limpiados);
        return w !== null && p !== null ? Math.round(w * p) : null;
      }),
    );
    const tecnicos: string[] = [];
    for (const f of filas) {
      const n = f.tecnico_id ? nombrePorId.get(f.tecnico_id) : null;
      if (n && !tecnicos.includes(n)) tecnicos.push(n);
    }
    out.push({
      trabajo_id: base.trabajo_id ?? null,
      fecha: String(base.fecha ?? ""),
      tecnicos,
      aportes: filas.length,
      por_tecnico: filas.map((f) => ({
        tecnico_id: f.tecnico_id ?? null,
        tecnico: (f.tecnico_id ? nombrePorId.get(f.tecnico_id) : null) ?? "Técnico",
        paneles_limpiados: num(f.paneles_limpiados),
        agua_galones: num(f.agua_galones),
        horas_trabajadas: num(f.horas_trabajadas),
        avance_pct: num(f.avance_pct),
      })),
      avance_pct: maximo(filas.map((f) => num(f.avance_pct))),
      paneles_limpiados: paneles,
      agua_galones: sumar(filas.map((f) => num(f.agua_galones))),
      horas_trabajadas: sumar(filas.map((f) => num(f.horas_trabajadas))),
      watts_panel: wattsPanel === null ? null : Math.round(wattsPanel),
      watts_totales: wattsTotales === null ? null : Math.round(wattsTotales),
      tds_ppm: promediar(filas.map((f) => num(f.tds_ppm))),
      angulo_inclinacion: promediar(filas.map((f) => num(f.angulo_inclinacion))),
      presion_agua_psi: promediar(filas.map((f) => num(f.presion_agua_psi))),
      clima: unirTextos(filas, "clima", nombrePorId),
      trabajo_realizado: unirTextos(filas, "trabajo_realizado", nombrePorId),
      hallazgos: unirTextos(filas, "hallazgos", nombrePorId),
      bloqueos: unirTextos(filas, "bloqueos", nombrePorId),
      observaciones: unirTextos(filas, "observaciones", nombrePorId),
    });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
