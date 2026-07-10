/**
 * Extrae imágenes embebidas (JPEG) desde un PDF utilizando pdf-lib.
 * Se limita a XObjects con filtro DCTDecode porque contienen bytes JPEG
 * listos para insertar en cualquier visor sin recodificar. Los flujos
 * FlateDecode se omiten para evitar reconstruir raster crudo en Workers.
 *
 * Devuelve dataURLs listos para consumir en <img>/@react-pdf.
 */
/** Lee dimensiones (w,h) de un JPEG buscando el marker SOF (0xFFC0..0xFFCF, excepto C4/C8/CC). */
function readJpegInfo(bytes: Uint8Array): { w: number; h: number; components: number } | null {
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
      if (i + 7 >= len) return null;
      const h = (bytes[i + 3] << 8) | bytes[i + 4];
      const w = (bytes[i + 5] << 8) | bytes[i + 6];
      const components = bytes[i + 7];
      return { w, h, components };
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

function shouldKeepPhoto(bytes: Uint8Array) {
  if (!bytes || bytes.byteLength < 12_000) return false;
  const info = readJpegInfo(bytes);
  if (!info) return bytes.byteLength >= 45_000;
  if (info.components === 1) return false;
  const shortSide = Math.min(info.w, info.h);
  const longSide = Math.max(info.w, info.h);
  const ratio = longSide / Math.max(1, shortSide);
  if (ratio > 2 && bytes.byteLength < 140_000) return false;
  if (shortSide < 120) return false;
  if (longSide < 260 && bytes.byteLength < 70_000) return false;
  return true;
}

function toDataUrl(bytes: Uint8Array) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

function pushJpeg(out: string[], seen: Set<string>, bytes: Uint8Array, maxImages: number) {
  if (out.length >= maxImages) return;
  if (!shouldKeepPhoto(bytes)) return;
  const info = readJpegInfo(bytes);
  const sig = `${bytes.byteLength}:${info?.w ?? 0}x${info?.h ?? 0}:${bytes[0]},${bytes[1]},${bytes[2]},${bytes[3]}`;
  if (seen.has(sig)) return;
  seen.add(sig);
  out.push(toDataUrl(bytes));
}

function extractInlineJpegs(buf: Uint8Array, out: string[], seen: Set<string>, maxImages: number) {
  for (let i = 0; i < buf.byteLength - 4 && out.length < maxImages; i++) {
    if (buf[i] !== 0xff || buf[i + 1] !== 0xd8) continue;
    for (let j = i + 2; j < buf.byteLength - 1; j++) {
      if (buf[j] === 0xff && buf[j + 1] === 0xd9) {
        pushJpeg(out, seen, buf.subarray(i, j + 2), maxImages);
        i = j + 1;
        break;
      }
    }
  }
}

export async function extractJpegImagesFromPdf(
  buf: Uint8Array,
  opts: { maxImages?: number; minBytes?: number } = {},
): Promise<string[]> {
  const maxImages = opts.maxImages ?? 12;
  // Base baja para no descartar fotos comprimidas; usamos otras heurísticas
  // (páginas que referencian la imagen, colorspace, ratio) para filtrar
  // logos/plantillas/firmas.
  const minBytes = opts.minBytes ?? 3_000;
  try {
    const { PDFDocument, PDFName, PDFRawStream } = await import("pdf-lib");
    const pdf = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });

    const out: string[] = [];
    const seen = new Set<string>();
    const indirects = pdf.context.enumerateIndirectObjects();
    for (const [ref, obj] of indirects) {
      if (out.length >= maxImages) break;
      if (!(obj instanceof PDFRawStream)) continue;
      const dict = obj.dict;
      const subtype = dict.get(PDFName.of("Subtype"))?.toString();
      if (subtype !== "/Image") continue;

      const filter = dict.get(PDFName.of("Filter"));
      const filterStr = filter?.toString() ?? "";
      // DCTDecode = JPEG puro: los bytes ya son una imagen válida para
      // @react-pdf. Algunos PDFs declaran TODAS las imágenes como XObject en
      // cada página aunque solo se dibujen una vez, por eso NO filtramos por
      // cantidad de páginas que referencian el recurso; ese criterio eliminaba
      // todos los registros fotográficos en producción.
      const isJpeg = filterStr.includes("DCTDecode");
      if (!isJpeg) continue;
      const bytes = obj.contents as Uint8Array;
      if (!bytes || bytes.byteLength < minBytes) continue;

      // Descartar firmas y máscaras: PDFs suelen marcar la firma manuscrita
      // como ColorSpace DeviceGray o como imagen indexada 1-bit. También
      // descartamos cualquier XObject usado como SMask (canal alfa auxiliar).
      const colorSpace = dict.get(PDFName.of("ColorSpace"))?.toString() ?? "";
      const isSMask = !!dict.get(PDFName.of("SMask"))
        || dict.get(PDFName.of("ImageMask"))?.toString() === "true";
      if (isSMask) continue;
      if (colorSpace.includes("DeviceGray") || colorSpace.includes("CalGray")) continue;

      pushJpeg(out, seen, bytes, maxImages);
    }
    // Fallback robusto para PDFs producidos por sistemas que no exponen bien
    // las fotos como XObject al parser, pero sí contienen los JPEG embebidos.
    if (out.length === 0) extractInlineJpegs(buf, out, seen, maxImages);
    return out;
  } catch {
    const out: string[] = [];
    extractInlineJpegs(buf, out, new Set<string>(), maxImages);
    return out;
  }
}