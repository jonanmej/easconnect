/**
 * Escala automática de tipografía y padding para tablas del PDF.
 *
 * En el reporte ejecutivo la cantidad de información por celda varía mucho
 * (nombres largos de técnicos, watts totales de 6-7 dígitos, folios, etc.).
 * En vez de fijar un tamaño de letra a mano, aquí se calcula el mayor tamaño
 * que aún permite que el contenido más largo de cada columna quepa en su
 * ancho disponible, y el padding se deriva del tamaño resultante para que la
 * densidad visual siempre se vea consistente.
 */

export type ColumnaEscala = {
  /** Ancho de la columna en porcentaje del ancho útil de la tabla. */
  ancho: number;
  /** Encabezado (puede traer saltos de línea con \n). */
  head?: string;
  /** Contenido de la columna en todas las filas. */
  textos: (string | number | null | undefined)[];
  /** true para columnas monoespaciadas (Courier), más anchas por carácter. */
  mono?: boolean;
  /** true si el texto puede repartirse en varias líneas (se mide la palabra más larga). */
  multilinea?: boolean;
};

export type EscalaTabla = {
  fontSize: number;
  fontSizeHead: number;
  padH: number;
  padV: number;
};

/** Ancho medio de carácter relativo al tamaño de fuente. */
const COEF = { helvetica: 0.52, bold: 0.56, mono: 0.605 };

function tramoMasLargo(txt: string, multilinea: boolean) {
  const limpio = txt.replace(/\s+/g, " ").trim();
  if (!limpio) return 1;
  if (!multilinea) return limpio.length;
  return limpio.split(" ").reduce((m, w) => Math.max(m, w.length), 1);
}

/**
 * @param anchoUtil ancho útil de la tabla en puntos (A4 con márgenes ≈ 445).
 */
export function escalaTabla(
  anchoUtil: number,
  columnas: ColumnaEscala[],
  opciones: { min?: number; max?: number } = {},
): EscalaTabla {
  const min = opciones.min ?? 5.2;
  const max = opciones.max ?? 8.5;

  // Dos pasadas: el padding depende del tamaño de fuente y viceversa.
  let fontSize = max;
  for (let pasada = 0; pasada < 2; pasada++) {
    const padH = paddingH(fontSize);
    let candidato = max;
    for (const col of columnas) {
      const disponible = (col.ancho / 100) * anchoUtil - padH * 2;
      if (disponible <= 0) continue;
      const coefCuerpo = col.mono ? COEF.mono : COEF.helvetica;

      const largoCuerpo = col.textos.reduce<number>((m, t) => {
        const s = t === null || t === undefined ? "" : String(t);
        return Math.max(m, tramoMasLargo(s, col.multilinea ?? false));
      }, 1);
      candidato = Math.min(candidato, disponible / (coefCuerpo * largoCuerpo));

      // El encabezado se mide por palabra (siempre puede envolver).
      const largoHead = tramoMasLargo(col.head ?? "", true);
      if (largoHead > 1) {
        // El head usa un tamaño algo menor que el cuerpo.
        candidato = Math.min(candidato, disponible / (COEF.bold * largoHead) / 0.92);
      }
    }
    fontSize = Math.max(min, Math.min(max, Number(candidato.toFixed(2))));
  }

  const padH = paddingH(fontSize);
  return {
    fontSize,
    fontSizeHead: Number(Math.max(min - 0.4, fontSize * 0.92).toFixed(2)),
    padH,
    padV: Number(Math.max(2, fontSize * 0.55).toFixed(2)),
  };
}

function paddingH(fontSize: number) {
  return Number(Math.max(1.5, Math.min(5, fontSize * 0.45)).toFixed(2));
}
