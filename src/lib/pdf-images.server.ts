/**
 * Extrae imágenes embebidas (JPEG) desde un PDF utilizando pdf-lib.
 * Se limita a XObjects con filtro DCTDecode porque contienen bytes JPEG
 * listos para insertar en cualquier visor sin recodificar. Los flujos
 * FlateDecode se omiten para evitar reconstruir raster crudo en Workers.
 *
 * Devuelve dataURLs listos para consumir en <img>/@react-pdf.
 */
/** Lee dimensiones (w,h) de un JPEG buscando el marker SOF (0xFFC0..0xFFCF, excepto C4/C8/CC). */
function readJpegDimensions(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  const len = bytes.byteLength;
  while (i < len) {
    if (bytes[i] !== 0xff) return null;
    let marker = bytes[i + 1];
    // Saltar marcadores de padding
    while (marker === 0xff && i + 1 < len) {
      i++;
      marker = bytes[i + 1];
    }
    i += 2;
    // SOF markers (excluye DHT=C4, JPG=C8, DAC=CC)
    if (
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    ) {
      if (i + 5 >= len) return null;
      const h = (bytes[i + 3] << 8) | bytes[i + 4];
      const w = (bytes[i + 5] << 8) | bytes[i + 6];
      return { w, h };
    }
    // Standalone markers sin longitud
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 1 >= len) return null;
    const segLen = (bytes[i] << 8) | bytes[i + 1];
    if (segLen < 2) return null;
    i += segLen;
  }
  return null;
}

export async function extractJpegImagesFromPdf(
  buf: Uint8Array,
  opts: { maxImages?: number; minBytes?: number } = {},
): Promise<string[]> {
  const maxImages = opts.maxImages ?? 12;
  // Umbral base muy bajo: dejamos pasar prácticamente todo JPEG DCT del PDF
  // y solo descartamos lo que sea claramente un logo/ícono (poco peso Y
  // dimensiones pequeñas simultáneamente).
  const minBytes = opts.minBytes ?? 8_000;
  try {
    const { PDFDocument, PDFName, PDFRawStream } = await import("pdf-lib");
    const pdf = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    const out: string[] = [];
    const seen = new Set<string>();
    const indirects = pdf.context.enumerateIndirectObjects();
    for (const [, obj] of indirects) {
      if (out.length >= maxImages) break;
      if (!(obj instanceof PDFRawStream)) continue;
      const dict = obj.dict;
      const subtype = dict.get(PDFName.of("Subtype"))?.toString();
      if (subtype !== "/Image") continue;
      const filter = dict.get(PDFName.of("Filter"));
      const filterStr = filter?.toString() ?? "";
      // DCTDecode = JPEG embebido; los bytes ya son un JPEG válido.
      if (!filterStr.includes("DCTDecode")) continue;
      const bytes = obj.contents as Uint8Array;
      if (!bytes || bytes.byteLength < minBytes) continue;
      const dims = readJpegDimensions(bytes);
      if (dims) {
        const shortSide = Math.min(dims.w, dims.h);
        // Solo descartamos como logo si ES pequeño en dimensiones Y liviano.
        // Una foto de cámara siempre supera >=400px en su lado corto o
        // pesa bastante más que un isotipo.
        const parecesLogo = shortSide < 250 && bytes.byteLength < 60_000;
        if (parecesLogo) continue;
      }
      // Deduplicar por tamaño + primeros bytes (evita repetir la misma foto).
      const sig = `${bytes.byteLength}:${bytes[0]},${bytes[1]},${bytes[2]},${bytes[3]}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.byteLength; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
      }
      out.push(`data:image/jpeg;base64,${btoa(bin)}`);
    }
    return out;
  } catch {
    return [];
  }
}