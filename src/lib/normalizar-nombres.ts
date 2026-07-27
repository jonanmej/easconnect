/**
 * Utilidades para blindar nombres propios (clientes y plantas) en textos
 * generados por IA.
 *
 * Regla definitiva: los nombres canónicos de la base NO se corrigen por
 * similitud, distancia Levenshtein ni heurísticas. Esas heurísticas pueden
 * convertir nombres válidos parecidos (p. ej. "Techo 2" → "Techo 1").
 * Solo se hacen dos cosas seguras:
 * 1) normalización exacta case-insensitive de nombres ya presentes; y
 * 2) protección con placeholders antes de enviar datos al modelo, para luego
 *    restaurarlos exactamente como están guardados.
 */

type NombreProtegido = { token: string; valor: string };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function limpiarCanonicos(nombresCanonicos: string[]): string[] {
  return Array.from(
    new Set(
      nombresCanonicos
        .map((n) => String(n ?? "").trim().replace(/\s+/g, " "))
        .filter((n) => n.length >= 3),
    ),
  ).sort((a, b) => b.length - a.length);
}

function replaceNombreExacto(texto: string, canon: string, reemplazo: string): string {
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escapeRegex(canon)})(?=[^\\p{L}\\p{N}]|$)`,
    "giu",
  );
  return texto.replace(pattern, (_match, prefijo: string) => `${prefijo}${reemplazo}`);
}

/**
 * Aplica corrección ortográfica de nombres canónicos sobre `texto`.
 * @param texto Texto (markdown u otro) generado por IA.
 * @param nombresCanonicos Lista de nombres exactos tal cual están en la base.
 */
export function normalizarNombresCanonicos(texto: string, nombresCanonicos: string[]): string {
  if (!texto) return texto;
  const canonicos = limpiarCanonicos(nombresCanonicos);
  if (canonicos.length === 0) return texto;
  let out = texto;
  for (const canon of canonicos) {
    out = replaceNombreExacto(out, canon, canon);
  }
  return out;
}

export function crearProtectorNombresCanonicos(nombresCanonicos: string[]) {
  const protegidos: NombreProtegido[] = limpiarCanonicos(nombresCanonicos).map((valor, index) => ({
    token: `@@NOMBRE_CANONICO_${index + 1}@@`,
    valor,
  }));

  const protegerTexto = (texto: string | null | undefined): string => {
    if (!texto) return "";
    let out = String(texto);
    for (const item of protegidos) {
      out = replaceNombreExacto(out, item.valor, item.token);
    }
    return out;
  };

  const restaurarTexto = (texto: string | null | undefined): string => {
    if (!texto) return "";
    let out = String(texto);
    for (const item of protegidos) {
      out = out.replace(new RegExp(escapeRegex(item.token), "g"), item.valor);
    }
    return normalizarNombresCanonicos(out, protegidos.map((p) => p.valor));
  };

  const protegerValor = <T>(value: T): T => {
    if (typeof value === "string") return protegerTexto(value) as T;
    if (Array.isArray(value)) return value.map((item) => protegerValor(item)) as T;
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, protegerValor(item)]);
      return Object.fromEntries(entries) as T;
    }
    return value;
  };

  return {
    protegidos,
    protegerTexto,
    restaurarTexto,
    protegerValor,
  };
}