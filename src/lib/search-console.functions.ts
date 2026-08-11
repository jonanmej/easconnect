import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";
const SITE_TARGET = "https://easconnect.lovable.app/";

function gatewayHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"];
  if (!lovableKey || !connKey) {
    throw new Error("Falta la conexión de Google Search Console en este proyecto.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

function coversTarget(siteUrl: string, target: URL) {
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    const host = target.hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  try {
    return target.href.startsWith(new URL(siteUrl).href);
  } catch {
    return false;
  }
}

/** Devuelve las propiedades verificadas que cubren el sitio publicado. */
async function propiedadesVerificadas(): Promise<string[]> {
  const res = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers: gatewayHeaders() });
  if (!res.ok) {
    throw new Error(`No se pudieron listar las propiedades [${res.status}]: ${await res.text()}`);
  }
  const json = (await res.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel?: string }> };
  const target = new URL(SITE_TARGET);
  return (json.siteEntry ?? [])
    .filter((e) => e.permissionLevel !== "siteUnverifiedUser" && coversTarget(e.siteUrl, target))
    .map((e) => e.siteUrl);
}

async function resolverPropiedad(seleccionada?: string) {
  const matches = await propiedadesVerificadas();
  if (matches.length === 0) throw new Error("Ninguna propiedad verificada cubre easconnect.lovable.app");
  if (seleccionada) {
    if (!matches.includes(seleccionada)) throw new Error("La propiedad seleccionada ya no está verificada.");
    return { estado: "ok" as const, siteUrl: seleccionada, candidatas: matches };
  }
  if (matches.length === 1) return { estado: "ok" as const, siteUrl: matches[0]!, candidatas: matches };
  return { estado: "seleccion_requerida" as const, candidatas: matches };
}

async function consultar(siteUrl: string, body: Record<string, unknown>) {
  const res = await fetch(
    `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    { method: "POST", headers: gatewayHeaders(), body: JSON.stringify(body) },
  );
  if (res.status === 403) {
    throw new Error("La cuenta conectada no tiene acceso a esta propiedad de Search Console.");
  }
  if (!res.ok) throw new Error(`Consulta a Search Console fallida [${res.status}]: ${await res.text()}`);
  return (await res.json()) as { rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> };
}

const inputSchema = z.object({
  dias: z.union([z.literal(7), z.literal(28), z.literal(90)]).default(28),
  // Filtro libre: coincide con la URL de la página (útil para aislar un cliente o sección).
  filtroPagina: z.string().trim().max(200).optional(),
  siteUrl: z.string().trim().max(300).optional(),
});

function rangoFechas(dias: number) {
  // Search Console tiene ~3 días de rezago; el rango termina hace 2 días.
  const fin = new Date(Date.now() - 2 * 86_400_000);
  const ini = new Date(fin.getTime() - (dias - 1) * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(ini), endDate: iso(fin) };
}

export type MetricaFila = { clave: string; clicks: number; impressions: number; ctr: number; position: number };
export type PanelGsc =
  | { estado: "seleccion_requerida"; candidatas: string[] }
  | {
      estado: "ok";
      siteUrl: string;
      candidatas: string[];
      periodo: { startDate: string; endDate: string };
      totales: { clicks: number; impressions: number; ctr: number; position: number };
      porFecha: MetricaFila[];
      paginas: MetricaFila[];
      consultas: MetricaFila[];
      paises: MetricaFila[];
    };

/** Métricas de rendimiento de búsqueda (clics, impresiones, CTR, posición). */
export const getPanelSearchConsole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => inputSchema.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<PanelGsc> => {
    const { data: esAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: esSupervisor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "supervisor",
    });
    if (!esAdmin && !esSupervisor) throw new Error("Solo administradores y supervisores pueden ver este panel.");

    const prop = await resolverPropiedad(data.siteUrl);
    if (prop.estado === "seleccion_requerida") {
      return { estado: "seleccion_requerida", candidatas: prop.candidatas };
    }

    const periodo = rangoFechas(data.dias);
    const filtro = data.filtroPagina
      ? {
          dimensionFilterGroups: [
            { filters: [{ dimension: "page", operator: "contains", expression: data.filtroPagina }] },
          ],
        }
      : {};

    const base = { ...periodo, ...filtro, rowLimit: 25 };
    const [fechas, paginas, consultas, paises] = await Promise.all([
      consultar(prop.siteUrl, { ...base, dimensions: ["date"], rowLimit: 100 }),
      consultar(prop.siteUrl, { ...base, dimensions: ["page"] }),
      consultar(prop.siteUrl, { ...base, dimensions: ["query"] }),
      consultar(prop.siteUrl, { ...base, dimensions: ["country"], rowLimit: 10 }),
    ]);

    const mapear = (r: { rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }> }): MetricaFila[] =>
      (r.rows ?? []).map((row) => ({
        clave: row.keys?.[0] ?? "—",
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      }));

    const porFecha = mapear(fechas);
    const clicks = porFecha.reduce((a, r) => a + r.clicks, 0);
    const impressions = porFecha.reduce((a, r) => a + r.impressions, 0);
    const position = porFecha.length
      ? porFecha.reduce((a, r) => a + r.position * Math.max(1, r.impressions), 0) /
        porFecha.reduce((a, r) => a + Math.max(1, r.impressions), 0)
      : 0;

    return {
      estado: "ok",
      siteUrl: prop.siteUrl,
      candidatas: prop.candidatas,
      periodo,
      totales: { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position },
      porFecha,
      paginas: mapear(paginas),
      consultas: mapear(consultas),
      paises: mapear(paises),
    };
  });

/** Estado del sitemap enviado a Search Console (para monitoreo del rastreo). */
export const getEstadoSitemap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ siteUrl: z.string().trim().max(300).optional() }).parse(raw ?? {}))
  .handler(async ({ data }) => {
    const prop = await resolverPropiedad(data.siteUrl);
    if (prop.estado === "seleccion_requerida") return { estado: "seleccion_requerida" as const };
    const sitemap = "https://easconnect.lovable.app/sitemap.xml";
    const res = await fetch(
      `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(prop.siteUrl)}/sitemaps/${encodeURIComponent(sitemap)}`,
      { headers: gatewayHeaders() },
    );
    if (!res.ok) return { estado: "sin_datos" as const, detalle: `[${res.status}] ${await res.text()}` };
    const json = (await res.json()) as {
      lastSubmitted?: string; lastDownloaded?: string; errors?: string; warnings?: string;
      contents?: Array<{ type?: string; submitted?: string; indexed?: string }>;
    };
    return {
      estado: "ok" as const,
      sitemap,
      lastSubmitted: json.lastSubmitted ?? null,
      lastDownloaded: json.lastDownloaded ?? null,
      errores: Number(json.errors ?? 0),
      advertencias: Number(json.warnings ?? 0),
      urls: Number(json.contents?.[0]?.submitted ?? 0),
    };
  });
