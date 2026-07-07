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
    const { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFRef } = await import("pdf-lib");
    const pdf = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });

    // 1) Contar cuántas páginas referencian cada XObject imagen. Los logos
    //    del membrete y elementos de plantilla aparecen en varias páginas,
    //    mientras que las fotografías de campo se insertan en una sola
    //    página. Filtrar por reference-count elimina el logo aunque su
    //    tamaño y color engañen a las heurísticas de dimensión.
    const refCount = new Map<string, number>();
    const pages = pdf.getPages();
    for (const p of pages) {
      const node: any = p.node;
      const resources = node.Resources?.() ?? node.get?.(PDFName.of("Resources"));
      const xobjects = resources instanceof PDFDict
        ? resources.get(PDFName.of("XObject"))
        : null;
      if (!(xobjects instanceof PDFDict)) continue;
      const seenInPage = new Set<string>();
      for (const [, value] of xobjects.entries()) {
        if (value instanceof PDFRef) {
          const key = `${value.objectNumber} ${value.generationNumber}`;
          if (seenInPage.has(key)) continue;
          seenInPage.add(key);
          refCount.set(key, (refCount.get(key) ?? 0) + 1);
        }
      }
    }

    const out: string[] = [];
    const seen = new Set<string>();
    const indirects = pdf.context.enumerateIndirectObjects();
    for (const [ref, obj] of indirects) {
      if (out.length >= maxImages) break;
      if (!(obj instanceof PDFRawStream)) continue;
      const dict = obj.dict;
      const subtype = dict.get(PDFName.of("Subtype"))?.toString();
      if (subtype !== "/Image") continue;

      // Si el XObject se referencia desde más de una página es parte de la
      // plantilla (logo membrete, sello de agua, marco). Lo excluimos.
      const refKey = `${ref.objectNumber} ${ref.generationNumber}`;
      const pagesUsing = refCount.get(refKey) ?? 0;
      if (pagesUsing !== 1) continue;

      const filter = dict.get(PDFName.of("Filter"));
      const filterStr = filter?.toString() ?? "";
      // DCTDecode = JPEG embebido; los bytes ya son un JPEG válido.
      // DCTDecode = JPEG puro. JPXDecode = JPEG 2000 (soportado por
      // @react-pdf vía su decoder subyacente en muchos visores). Aceptamos
      // ambos como fuente directa de bytes de imagen.
      const isJpeg = filterStr.includes("DCTDecode");
      const isJpx = filterStr.includes("JPXDecode");
      if (!isJpeg && !isJpx) continue;
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

      const info = isJpeg ? readJpegInfo(bytes) : null;
      if (info) {
        // JPEG con 1 componente = escala de grises (firmas escaneadas,
        // sellos monocromos). Los registros fotográficos reales son RGB (3).
        if (info.components === 1) continue;
        const shortSide = Math.min(info.w, info.h);
        const longSide = Math.max(info.w, info.h);
        const ratio = longSide / Math.max(1, shortSide);
        // Firmas manuscritas suelen ser tiras muy alargadas (ratio > 2.5)
        // y de peso moderado. Filtramos esa forma.
        if (ratio > 2.6 && bytes.byteLength < 120_000) continue;
        // Logos/isotipos: dimensiones y peso reducidos. Un registro
        // fotográfico real de cámara supera ampliamente estos umbrales.
        const parecesLogo = shortSide < 500 && bytes.byteLength < 80_000;
        if (parecesLogo) continue;
      } else if (isJpeg) {
        // No pudimos leer SOF: por prudencia exigimos peso mínimo de foto.
        if (bytes.byteLength < 60_000) continue;
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
      const mime = isJpx ? "image/jp2" : "image/jpeg";
      out.push(`data:${mime};base64,${btoa(bin)}`);
    }
    return out;
  } catch {
    return [];
  }
}