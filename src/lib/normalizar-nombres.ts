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
  // 1 error cada 6 caracteres, con topes razonables. Umbrales conservadores
  // para evitar que ventanas con palabras extra (p.ej. "en EL ÁNGEL TECHO 2")
  // colapsen sobre nombres parecidos. Las alucinaciones tipo
  // "APOPA" → "APOPAPARETE" se atrapan aparte con coincidePorInserciones.
  return Math.min(3, Math.max(1, Math.floor(canon.length / 6)));
}

/**
 * Verifica si la ventana coincide con el canónico permitiendo SOLO
 * inserciones dentro de cada token (no sustituciones ni tokens distintos).
 * Útil para atrapar alucinaciones donde la IA agrega letras extra a un
 * nombre propio, sin caer en la trampa de reemplazar un nombre válido
 * por otro parecido.
 */
function coincidePorInserciones(windowLower: string, canonLower: string): boolean {
  const wTokens = windowLower.split(/\s+/);
  const cTokens = canonLower.split(/\s+/);
  if (wTokens.length !== cTokens.length) return false;
  for (let i = 0; i < cTokens.length; i++) {
    const c = cTokens[i];
    const w = wTokens[i];
    if (w === c) continue;
    // El token canónico debe aparecer como subsecuencia dentro del token
    // de la ventana, y la ventana no puede ser mucho más larga.
    if (w.length < c.length) return false;
    if (w.length > c.length * 2 + 2) return false;
    let j = 0;
    for (let k = 0; k < w.length && j < c.length; k++) {
      if (w.charCodeAt(k) === c.charCodeAt(j)) j++;
    }
    if (j !== c.length) return false;
  }
  return true;
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

  const canonicosLower = new Set(canonicos.map((c) => c.toLowerCase()));

  let out = texto;
  // Pre-pass: para cada canónico, colapsar variantes con letras repetidas
  // (ej. "APPOPA ENERGY" → "Apopa Energy") y variantes case-insensitive
  // exactas. Este pase usa un patrón por palabra tolerante a duplicación.
  for (const canon of canonicos) {
    // Escapa regex y permite letras repetidas dentro de cada palabra del canónico.
    // "Apopa" → /A+p+o+p+a+/i  y las palabras se separan por \s+
    const words = canon.split(/\s+/).map((w) => {
      const chars = Array.from(w);
      return chars
        .map((c) => {
          const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          // Solo letras: permitir repetición
          return /[\p{L}]/u.test(c) ? `${esc}+` : esc;
        })
        .join("");
    });
    // Frontera "de palabra" tolerante a Unicode: bordes con no-letra o inicio/fin.
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])(${words.join("\\s+")})(?=[^\\p{L}\\p{N}]|$)`,
      "giu",
    );
    out = out.replace(pattern, (_m, pre) => `${pre}${canon}`);
  }

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
          // Si la ventana ya coincide exactamente con OTRO nombre canónico
          // (p. ej. "EL ÁNGEL TECHO 2" cuando el canónico actual es
          // "EL ÁNGEL TECHO 1"), no la toques: es un nombre válido distinto.
          if (canonicosLower.has(winLower)) {
            continue;
          }
          if (coincidePorInserciones(winLower, canonLower)) {
            words.splice(i, size, canon);
            cambio = true;
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