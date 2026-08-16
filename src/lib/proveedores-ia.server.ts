import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const GATEWAY_FIRECRAWL = "https://connector-gateway.lovable.dev/firecrawl/v2";

export type ResultadoProveedor = {
  proveedor: string;
  producto: string;
  precio: number | null;
  moneda: string;
  url: string;
  disponibilidad: string;
  notas: string;
};

const EsquemaResultados = z.object({
  resultados: z.array(
    z.object({
      proveedor: z.string(),
      producto: z.string(),
      precio: z.number().nullable(),
      moneda: z.string(),
      url: z.string(),
      disponibilidad: z.string(),
      notas: z.string(),
    }),
  ),
});

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
  const rows: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json?.web) ? json.web : [];
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
): Promise<ResultadoProveedor[]> {
  if (fuentes.length === 0) return [];
  const g = gateway();
  const contexto = fuentes
    .map((f, i) => `FUENTE ${i + 1}\nURL: ${f.url}\nTITULO: ${f.title}\nRESUMEN: ${f.description}\nCONTENIDO:\n${f.markdown}`)
    .join("\n\n---\n\n");

  const prompt = [
    `Producto buscado: "${termino}".`,
    "A partir de las fuentes web, extrae hasta 8 ofertas de proveedores reales con su precio unitario.",
    "Reglas: usa solo datos presentes en las fuentes; precio numérico sin símbolos (null si no aparece);",
    "moneda en código (USD, GTQ, MXN, etc.); url exacta de la fuente; disponibilidad y notas breves (máx 90 caracteres cada una);",
    "ordena de menor a mayor precio y descarta resultados que no correspondan al producto.",
    "",
    contexto,
  ].join("\n");

  try {
    const { output } = await generateText({
      model: g("google/gemini-2.5-flash"),
      output: Output.object({ schema: EsquemaResultados }),
      prompt,
    });
    return normalizar(output?.resultados ?? []);
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      try {
        const raw = JSON.parse(String(error.text ?? "").replace(/^```json|```$/g, "").trim());
        return normalizar(raw?.resultados ?? []);
      } catch {
        return [];
      }
    }
    throw error;
  }
}

function normalizar(rows: any[]): ResultadoProveedor[] {
  return rows
    .filter((r) => r && String(r.proveedor ?? "").trim())
    .slice(0, 8)
    .map((r) => ({
      proveedor: String(r.proveedor).trim().slice(0, 80),
      producto: String(r.producto ?? "").trim().slice(0, 140),
      precio: r.precio == null || Number.isNaN(Number(r.precio)) ? null : Number(r.precio),
      moneda: String(r.moneda ?? "USD").trim().slice(0, 6) || "USD",
      url: String(r.url ?? "").trim(),
      disponibilidad: String(r.disponibilidad ?? "").trim().slice(0, 90),
      notas: String(r.notas ?? "").trim().slice(0, 90),
    }))
    .sort((a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity));
}
