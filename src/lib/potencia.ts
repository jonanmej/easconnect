/**
 * Formato único de potencia para pantalla, PDF y datos que recibe la IA.
 *
 * - `contexto: "instalada"` → potencia pico de un sistema FV (Wp, kWp, MWp).
 * - `contexto: "medida"`    → potencia medida/recuperada (W, kW, MW).
 *
 * El valor de entrada siempre se indica en la unidad base `unidad` ("W" o "kW").
 */
export type ContextoPotencia = "instalada" | "medida";

export function formatPotencia(
  valor: number | string | null | undefined,
  opts: { unidad?: "W" | "kW"; contexto?: ContextoPotencia; decimales?: number } = {},
): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  const w = opts.unidad === "kW" ? n * 1000 : n;
  const p = (opts.contexto ?? "medida") === "instalada" ? "p" : "";
  const abs = Math.abs(w);
  const fmt = (x: number, d: number) =>
    x.toLocaleString("es-SV", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  if (abs >= 1_000_000) return `${fmt(w / 1_000_000, opts.decimales ?? 3)} MW${p}`;
  if (abs >= 1_000) return `${fmt(w / 1_000, opts.decimales ?? 2)} kW${p}`;
  return `${fmt(w, opts.decimales ?? 0)} W${p}`;
}

/** Capacidad instalada guardada en kWp (columna `capacidad_kwp`). */
export function formatCapacidadKwp(kwp: number | string | null | undefined): string {
  return formatPotencia(kwp, { unidad: "kW", contexto: "instalada" });
}
