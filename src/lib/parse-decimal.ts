/**
 * Convierte texto numérico escrito con coma o punto decimal.
 * - "12,5" y "12.5" → 12.5
 * - Con ambos separadores, el último es el decimal y el otro separa miles en grupos de 3:
 *   "1.234,5" → 1234.5, "1,234.5" → 1234.5
 * - Vacío o texto inválido → null (rechazo claro; nunca adivina).
 */
export function parseDecimal(entrada: string | null | undefined): number | null {
  const s = (entrada ?? "").trim().replace(/\s+/g, "");
  if (!s) return null;
  if (!/^-?[0-9.,]+$/.test(s)) return null;
  const neg = s.startsWith("-");
  const cuerpo = neg ? s.slice(1) : s;
  const ultPunto = cuerpo.lastIndexOf(".");
  const ultComa = cuerpo.lastIndexOf(",");
  let entero: string;
  let decimal = "";
  if (ultPunto >= 0 && ultComa >= 0) {
    const decSep = ultPunto > ultComa ? "." : ",";
    const milSep = decSep === "." ? "," : ".";
    const i = cuerpo.lastIndexOf(decSep);
    entero = cuerpo.slice(0, i);
    decimal = cuerpo.slice(i + 1);
    if (entero.includes(decSep)) return null;
    const grupos = entero.split(milSep);
    if (!/^\d{1,3}$/.test(grupos[0]) || grupos.slice(1).some((g) => !/^\d{3}$/.test(g))) return null;
    entero = grupos.join("");
  } else {
    const sep = ultPunto >= 0 ? "." : ultComa >= 0 ? "," : null;
    if (sep && cuerpo.indexOf(sep) !== cuerpo.lastIndexOf(sep)) return null;
    const partes = sep ? cuerpo.split(sep) : [cuerpo];
    entero = partes[0];
    decimal = partes[1] ?? "";
    if (sep && decimal === "") return null;
  }
  if (!/^\d*$/.test(entero) || !/^\d*$/.test(decimal) || (entero === "" && decimal === "")) return null;
  const n = Number(`${neg ? "-" : ""}${entero || "0"}${decimal ? "." + decimal : ""}`);
  return Number.isFinite(n) ? n : null;
}
