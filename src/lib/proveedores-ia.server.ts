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
  /** Unidades que trae el empaque (1 si es venta por unidad). */
  unidades_por_empaque: number;
  empaque: string;
  /** Precio por unidad (con impuesto) para comparar ofertas de forma transparente. */
  precio_por_unidad: number | null;
  tiempo_entrega: string;
  url: string;
  disponibilidad: string;
  notas: string;
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
  opts: { moneda: string; impuestoPct: number },
): Promise<ResultadoProveedor[]> {
  if (fuentes.length === 0) return [];
  const g = gateway();
  const contexto = fuentes
    .map((f, i) => `FUENTE ${i + 1}\nURL: ${f.url}\nTITULO: ${f.title}\nRESUMEN: ${f.description}\nCONTENIDO:\n${f.markdown}`)
    .join("\n\n---\n\n");

  const prompt = [
    `Producto buscado: "${termino}".`,
    "A partir de las fuentes web, extrae hasta 8 ofertas de proveedores reales.",
    'Responde ÚNICAMENTE con JSON válido con esta forma: {"resultados":[{"proveedor":"","producto":"","precio":0,"moneda":"USD","unidades_por_empaque":1,"empaque":"","tiempo_entrega":"","url":"","disponibilidad":"","notas":""}]}',
    "Reglas: usa solo datos presentes en las fuentes; precio numérico del empaque completo sin símbolos (null si no aparece);",
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

function normalizar(rows: any[], opts: { moneda: string; impuestoPct: number }): ResultadoProveedor[] {
  const factor = 1 + Math.max(0, Number(opts.impuestoPct) || 0) / 100;
  return rows
    .filter((r) => r && String(r.proveedor ?? "").trim())
    .slice(0, 10)
    .map((r) => {
      const precio = r.precio == null || Number.isNaN(Number(r.precio)) ? null : Number(r.precio);
      const conImp = precio == null ? null : Math.round(precio * factor * 10000) / 10000;
      const unidades = Math.max(1, Number(r.unidades_por_empaque) || 1);
      return {
        proveedor: String(r.proveedor).trim().slice(0, 80),
        producto: String(r.producto ?? "").trim().slice(0, 140),
        precio,
        moneda: (String(r.moneda ?? "").trim().slice(0, 6) || opts.moneda || "USD").toUpperCase(),
        precio_con_impuesto: conImp,
        unidades_por_empaque: unidades,
        empaque: String(r.empaque ?? "").trim().slice(0, 60),
        precio_por_unidad: conImp == null ? null : Math.round((conImp / unidades) * 10000) / 10000,
        tiempo_entrega: String(r.tiempo_entrega ?? "").trim().slice(0, 90),
        url: String(r.url ?? "").trim(),
        disponibilidad: String(r.disponibilidad ?? "").trim().slice(0, 90),
        notas: String(r.notas ?? "").trim().slice(0, 90),
      };
    })
    .sort((a, b) => (a.precio_por_unidad ?? Infinity) - (b.precio_por_unidad ?? Infinity));
}
