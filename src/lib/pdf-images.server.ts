/**
 * Extrae imágenes embebidas (JPEG) desde un PDF utilizando pdf-lib.
 * Se limita a XObjects con filtro DCTDecode porque contienen bytes JPEG
 * listos para insertar en cualquier visor sin recodificar. Los flujos
 * FlateDecode se omiten para evitar reconstruir raster crudo en Workers.
 *
 * Devuelve dataURLs listos para consumir en <img>/@react-pdf.
 */
export async function extractJpegImagesFromPdf(
  buf: Uint8Array,
  opts: { maxImages?: number; minBytes?: number } = {},
): Promise<string[]> {
  const maxImages = opts.maxImages ?? 12;
  const minBytes = opts.minBytes ?? 6_000; // filtra logos/íconos diminutos
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