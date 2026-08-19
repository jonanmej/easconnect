import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const GATEWAY_FIRECRAWL = "https://connector-gateway.lovable.dev/firecrawl/v2";

export type ResultadoProveedor = {
  proveedor: string;
  producto: string;
  precio: number | null;
  moneda: string;
  /** Precio con impuesto aplicado según configuración del usuario. */
  precio_con_impuesto: number | null;
  /** true si el precio publicado por el proveedor ya venía con impuesto incluido. */
  impuesto_incluido: boolean;
  /** Porcentaje de impuesto usado en el cálculo. */
  impuesto_pct: number;
  /** Arancel / derecho de importación aplicado (%). */
  arancel_pct: number;
  /** Retención (IVA/renta) aplicada al proveedor (%). */
  retencion_pct: number;
  /** Cargos locales fijos por oferta (trámites, aduana, manejo). */
  cargos_fijos: number;
  /** Envío/flete detectado en la fuente (0 si no aparece o es gratis). */
  envio: number;
  /** Desglose para auditoría: neto + arancel + envío + IVA + retención + cargos. */
  desglose: {
    neto: number | null;
    arancel: number;
    envio: number;
    impuesto: number;
    retencion: number;
    cargos_fijos: number;
  } | null;
  /** Precio final exacto con IVA y todos los cargos adicionales aplicados. */
  precio_final: number | null;
  /** Unidades que trae el empaque (1 si es venta por unidad). */
  unidades_por_empaque: number;
  empaque: string;
  /** Precio por unidad (con impuestos y cargos) para comparar de forma transparente. */
  precio_por_unidad: number | null;
  tiempo_entrega: string;
  url: string;
  disponibilidad: string;
  notas: string;
};

export type OpcionesFiscales = {
  moneda: string;
  impuestoPct: number;
  impuestoIncluido: boolean;
  arancelPct?: number;
  retencionPct?: number;
  cargosFijos?: number;
};

function gateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY no configurada");
  return createLovableAiGatewayProvider(key);
}

/** Identifica el producto a partir de una foto usando Gemini (multimodal). */
export async function describirProductoDesdeImagen(base64: string, mime: string): Promise<string> {
  const g = gateway();
  const r = await generateText({
    model: g("google/gemini-2.5-flash"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Identifica el producto de la imagen para poder comprarlo. Responde SOLO con un término de búsqueda comercial corto (marca, modelo, tipo y especificaciones visibles). Sin explicaciones.",
          },
          { type: "image", image: `data:${mime};base64,${base64}` },
        ],
      },
    ],
  });
  return r.text.trim().replace(/^["'`]+|["'`]+$/g, "").slice(0, 120);
}

/** Búsqueda web de proveedores y precios vía Firecrawl (gateway). */
export async function buscarEnWeb(termino: string, pais: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!lovableKey || !fcKey) throw new Error("Búsqueda web no configurada (falta conector Firecrawl)");

  const res = await fetch(`${GATEWAY_FIRECRAWL}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": fcKey,
    },
    body: JSON.stringify({
      query: `${termino} precio comprar proveedor ${pais}`.trim(),
      limit: 8,
      scrapeOptions: { formats: ["markdown"] },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Búsqueda web falló [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const rows: any[] = Array.isArray(json?.data?.web)
    ? json.data.web
    : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.web)
        ? json.web
        : [];
  return rows.map((r) => ({
    url: String(r?.url ?? ""),
    title: String(r?.title ?? ""),
    description: String(r?.description ?? ""),
    markdown: String(r?.markdown ?? "").slice(0, 4000),
  }));
}

/** Extrae proveedores/precios estructurados de los resultados web. */
export async function extraerProveedores(
  termino: string,
  fuentes: Array<{ url: string; title: string; description: string; markdown: string }>,
  opts: OpcionesFiscales,
): Promise<ResultadoProveedor[]> {
  if (fuentes.length === 0) return [];
  const g = gateway();
  const contexto = fuentes
    .map((f, i) => `FUENTE ${i + 1}\nURL: ${f.url}\nTITULO: ${f.title}\nRESUMEN: ${f.description}\nCONTENIDO:\n${f.markdown}`)
    .join("\n\n---\n\n");

  const prompt = [
    `Producto buscado: "${termino}".`,
    "A partir de las fuentes web, extrae hasta 8 ofertas de proveedores reales.",
    'Responde ÚNICAMENTE con JSON válido con esta forma: {"resultados":[{"proveedor":"","producto":"","precio":0,"moneda":"USD","envio":0,"unidades_por_empaque":1,"empaque":"","tiempo_entrega":"","url":"","disponibilidad":"","notas":""}]}',
    "Reglas: usa solo datos presentes en las fuentes; precio numérico del empaque completo sin símbolos (null si no aparece);",
    "envio = costo de envío/flete numérico si la fuente lo indica (0 si es gratis o no aparece);",
    "moneda en código ISO (USD, GTQ, MXN, EUR…); unidades_por_empaque = cantidad de piezas/litros que incluye el precio (1 si es unitario);",
    "empaque = descripción corta del formato (ej: 'caja 12 un', 'galón 3.8 L'); tiempo_entrega = plazo de entrega o envío si aparece;",
    "url exacta de la fuente; disponibilidad, tiempo_entrega y notas breves (máx 90 caracteres cada una);",
    "descarta resultados que no correspondan al producto. Sin texto fuera del JSON.",
    "",
    contexto,
  ].join("\n");

  const { text } = await generateText({ model: g("google/gemini-2.5-flash"), prompt });
  const raw = parsearJson(text);
  return normalizar(Array.isArray(raw?.resultados) ? raw.resultados : [], opts);
}

function parsearJson(text: string): any {
  const limpio = String(text ?? "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(limpio);
  } catch {
    const ini = limpio.indexOf("{");
    const fin = limpio.lastIndexOf("}");
    if (ini >= 0 && fin > ini) {
      try {
        return JSON.parse(limpio.slice(ini, fin + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizar(rows: any[], opts: OpcionesFiscales): ResultadoProveedor[] {
  const pct = Math.max(0, Number(opts.impuestoPct) || 0);
  const factor = 1 + pct / 100;
  const incluido = !!opts.impuestoIncluido;
  const arancelPct = Math.max(0, Number(opts.arancelPct) || 0);
  const retencionPct = Math.max(0, Number(opts.retencionPct) || 0);
  const cargosFijos = Math.max(0, Number(opts.cargosFijos) || 0);
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  return rows
    .filter((r) => r && String(r.proveedor ?? "").trim())
    .slice(0, 10)
    .map((r) => {
      const publicado = r.precio == null || Number.isNaN(Number(r.precio)) ? null : Number(r.precio);
      // En países donde el precio de lista ya incluye impuesto (ej. El Salvador, México),
      // el precio publicado ES el precio final y el neto se obtiene dividiendo por el factor.
      const precio = publicado == null ? null : incluido ? r4(publicado / factor) : publicado;
      const conImp = publicado == null ? null : incluido ? r4(publicado) : r4(publicado * factor);
      const unidades = Math.max(1, Number(r.unidades_por_empaque) || 1);
      const envio = Math.max(0, Number(r.envio) || 0);
      // Cargos adicionales sobre el neto: arancel y envío entran a la base
      // gravable; la retención y los cargos locales fijos se suman al final.
      const arancel = precio == null ? 0 : r4(precio * (arancelPct / 100));
      const base = precio == null ? null : r4(precio + arancel + envio);
      const impuesto = base == null ? 0 : r4(base * (pct / 100));
      const retencion = base == null ? 0 : r4(base * (retencionPct / 100));
      const precioFinal = base == null ? null : r4(base + impuesto + retencion + cargosFijos);
      return {
        proveedor: String(r.proveedor).trim().slice(0, 80),
        producto: String(r.producto ?? "").trim().slice(0, 140),
        precio,
        moneda: (String(r.moneda ?? "").trim().slice(0, 6) || opts.moneda || "USD").toUpperCase(),
        precio_con_impuesto: conImp,
        impuesto_incluido: incluido,
        impuesto_pct: pct,
        arancel_pct: arancelPct,
        retencion_pct: retencionPct,
        cargos_fijos: cargosFijos,
        envio,
        precio_final: precioFinal,
        desglose: precio == null ? null : { neto: precio, arancel, envio, impuesto, retencion, cargos_fijos: cargosFijos },
        unidades_por_empaque: unidades,
        empaque: String(r.empaque ?? "").trim().slice(0, 60),
        precio_por_unidad: precioFinal == null ? null : r4(precioFinal / unidades),
        tiempo_entrega: String(r.tiempo_entrega ?? "").trim().slice(0, 90),
        url: String(r.url ?? "").trim(),
        disponibilidad: String(r.disponibilidad ?? "").trim().slice(0, 90),
        notas: String(r.notas ?? "").trim().slice(0, 90),
      };
    })
    .sort((a, b) => (a.precio_por_unidad ?? Infinity) - (b.precio_por_unidad ?? Infinity));
}
