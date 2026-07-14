/**
 * Utilidades para corregir la ortografía de nombres propios (clientes y plantas)
 * en textos generados por modelos de IA, evitando mutaciones como "Apopa" → "Appopa".
 *
 * Estrategia: comparar ventanas de N palabras del texto contra cada nombre
 * canónico y, cuando la distancia de Levenshtein es pequeña (≤ 1 letra por
 * cada 6 caracteres, mínimo 1, máximo 3), reemplazar el fragmento por el
 * nombre canónico exacto. No altera coincidencias ya idénticas.
 */

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function maxDistanciaPermitida(canon: string): number {
  // 1 error cada 6 caracteres, con topes razonables.
  return Math.min(3, Math.max(1, Math.floor(canon.length / 6)));
}

/**
 * Aplica corrección ortográfica de nombres canónicos sobre `texto`.
 * @param texto Texto (markdown u otro) generado por IA.
 * @param nombresCanonicos Lista de nombres exactos tal cual están en la base.
 */
export function normalizarNombresCanonicos(texto: string, nombresCanonicos: string[]): string {
  if (!texto) return texto;
  const canonicos = Array.from(
    new Set(
      nombresCanonicos
        .map((n) => (n ?? "").trim())
        .filter((n) => n.length >= 3),
    ),
  ).sort((a, b) => b.length - a.length);
  if (canonicos.length === 0) return texto;

  let out = texto;
  for (const canon of canonicos) {
    const tokens = canon.split(/\s+/);
    const nTokens = tokens.length;
    const maxDist = maxDistanciaPermitida(canon);
    const canonLower = canon.toLowerCase();

    // Recorre el texto extrayendo secuencias contiguas de palabras
    // (letras/dígitos/guiones) y probando ventanas del tamaño del nombre canónico.
    out = out.replace(/[\p{L}\p{N}][\p{L}\p{N}\-'.]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}\-'.]*)*/gu, (frase) => {
      const words = frase.split(/\s+/);
      let cambio = false;
      for (let size = nTokens; size <= Math.min(words.length, nTokens + 1); size++) {
        for (let i = 0; i + size <= words.length; i++) {
          const window = words.slice(i, i + size).join(" ");
          const winLower = window.toLowerCase();
          if (winLower === canonLower) {
            // Ya coincide (posiblemente con mayúsculas distintas): forzar la
            // forma canónica exacta.
            if (window !== canon) {
              words.splice(i, size, canon);
              cambio = true;
            }
            continue;
          }
          const dist = levenshtein(winLower, canonLower);
          if (dist > 0 && dist <= maxDist) {
            words.splice(i, size, canon);
            cambio = true;
          }
        }
      }
      return cambio ? words.join(" ") : frase;
    });
  }
  return out;
}