import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MousePointerClick, Eye, Percent, ListOrdered, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPanelSearchConsole, getEstadoSitemap, type MetricaFila } from "@/lib/search-console.functions";

export const Route = createFileRoute("/_authenticated/search-console")({
  head: () => ({
    meta: [
      { title: "Rendimiento en buscadores · EA Service Connect" },
      {
        name: "description",
        content:
          "Panel interno de Google Search Console: clics, impresiones, CTR y páginas del sitio de EA Service Connect por periodo.",
      },
      { property: "og:title", content: "Rendimiento en buscadores · EA Service Connect" },
      {
        property: "og:description",
        content: "Métricas de Search Console (clics, impresiones, CTR y posición) por periodo y filtro de páginas.",
      },
    ],
  }),
  component: SearchConsolePage,
});

const PERIODOS = [7, 28, 90] as const;

function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function Tabla({ titulo, descripcion, filas, etiqueta }: { titulo: string; descripcion: string; filas: MetricaFila[]; etiqueta: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 sm:px-6 sm:pb-6">
        {filas.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground sm:px-0 sm:pb-0">Sin datos reportados en este periodo.</p>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pl-6 pr-3 font-medium sm:pl-0">{etiqueta}</th>
                <th className="py-2 pr-3 text-right font-medium">Clics</th>
                <th className="py-2 pr-3 text-right font-medium">Impr.</th>
                <th className="py-2 pr-3 text-right font-medium">CTR</th>
                <th className="py-2 pr-6 text-right font-medium sm:pr-0">Pos.</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave} className="border-b last:border-0">
                  <td className="max-w-[280px] truncate py-2 pl-6 pr-3 sm:pl-0" title={f.clave}>{f.clave}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{f.clicks}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{f.impressions}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{pct(f.ctr)}</td>
                  <td className="py-2 pr-6 text-right tabular-nums sm:pr-0">{f.position.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function SearchConsolePage() {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(28);
  const [filtro, setFiltro] = useState("");
  const [filtroAplicado, setFiltroAplicado] = useState("");
  const [propiedad, setPropiedad] = useState<string | undefined>(undefined);

  const fetchPanel = useServerFn(getPanelSearchConsole);
  const fetchSitemap = useServerFn(getEstadoSitemap);

  const panel = useQuery({
    queryKey: ["gsc-panel", dias, filtroAplicado, propiedad],
    queryFn: () => fetchPanel({ data: { dias, filtroPagina: filtroAplicado || undefined, siteUrl: propiedad } }),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const sitemap = useQuery({
    queryKey: ["gsc-sitemap", propiedad],
    queryFn: () => fetchSitemap({ data: { siteUrl: propiedad } }),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const data = panel.data;

  return (
    <div>
      <PageHeader
        title="Rendimiento en buscadores"
        description="Métricas de Google Search Console: clics, impresiones, CTR, posición promedio y páginas con mejor desempeño."
        actions={
          <>
            {PERIODOS.map((p) => (
              <Button key={p} size="sm" variant={dias === p ? "default" : "outline"} onClick={() => setDias(p)}>
                {p} días
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => void panel.refetch()} disabled={panel.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${panel.isFetching ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </>
        }
      />

      <form
        className="mb-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setFiltroAplicado(filtro.trim());
        }}
      >
        <Input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por URL o sección (ej. /plantas, nombre de cliente)"
          className="sm:max-w-md"
        />
        <Button type="submit" size="sm" variant="secondary">
          <Search className="mr-2 h-4 w-4" />
          Aplicar filtro
        </Button>
        {filtroAplicado ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => { setFiltro(""); setFiltroAplicado(""); }}>
            Limpiar
          </Button>
        ) : null}
      </form>

      {panel.isError ? (
        <Card className="mb-6 border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">No se pudieron cargar las métricas</CardTitle>
            <CardDescription>{(panel.error as Error).message}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {data?.estado === "seleccion_requerida" ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Elige la propiedad a monitorear</CardTitle>
            <CardDescription>Hay varias propiedades verificadas que cubren este sitio.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data.candidatas.map((c) => (
              <Button key={c} size="sm" variant="outline" onClick={() => setPropiedad(c)}>
                {c}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {data?.estado === "ok" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Clics", value: String(data.totales.clicks), icon: MousePointerClick },
              { label: "Impresiones", value: String(data.totales.impressions), icon: Eye },
              { label: "CTR promedio", value: pct(data.totales.ctr), icon: Percent },
              { label: "Posición promedio", value: data.totales.position ? data.totales.position.toFixed(1) : "—", icon: ListOrdered },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <k.icon className="h-4 w-4" />
                    {k.label}
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Propiedad <span className="font-medium">{data.siteUrl}</span> · periodo {data.periodo.startDate} a {data.periodo.endDate}
            {filtroAplicado ? ` · filtro “${filtroAplicado}”` : ""}. Google reporta con ~2 días de rezago y omite consultas de bajo volumen.
          </p>

          <div className="grid gap-6 xl:grid-cols-2">
            <Tabla titulo="Páginas con mejor desempeño" descripcion="URLs ordenadas por clics en el periodo." filas={data.paginas} etiqueta="Página" />
            <Tabla titulo="Consultas principales" descripcion="Términos de búsqueda que muestran el sitio." filas={data.consultas} etiqueta="Consulta" />
            <Tabla titulo="Evolución diaria" descripcion="Serie por fecha dentro del periodo seleccionado." filas={data.porFecha} etiqueta="Fecha" />
            <Tabla titulo="Países" descripcion="Origen geográfico de las impresiones." filas={data.paises} etiqueta="País" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rastreo e indexación</CardTitle>
              <CardDescription>Estado del sitemap y del robots.txt enviados a Google.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {sitemap.data?.estado === "ok" ? (
                <>
                  <p>Sitemap: <span className="font-medium">{sitemap.data.sitemap}</span></p>
                  <p className="text-muted-foreground">
                    URLs enviadas: {sitemap.data.urls} · errores: {sitemap.data.errores} · advertencias: {sitemap.data.advertencias}
                  </p>
                  <p className="text-muted-foreground">
                    Último envío: {sitemap.data.lastSubmitted ?? "—"} · última descarga por Google: {sitemap.data.lastDownloaded ?? "—"}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">Sin datos de sitemap disponibles por ahora.</p>
              )}
              <p className="text-muted-foreground">
                robots.txt: <a className="underline" href="/robots.txt" target="_blank" rel="noreferrer">/robots.txt</a> permite el rastreo completo y declara el sitemap.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : panel.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando métricas de Search Console…</p>
      ) : null}
    </div>
  );
}
