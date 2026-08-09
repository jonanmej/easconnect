import { createFileRoute } from "@tanstack/react-router";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listPlantas } from "@/lib/operations.functions";
import { MapPin, Satellite, Map as MapIcon } from "lucide-react";
import {
  cargarMapbox, ajustarA, ESTILO_SATELITE, ESTILO_SATELITE_PURO, ESTILO_CALLES,
  type MapboxNS,
} from "@/lib/mapbox-loader";

export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa de plantas \u00b7 EA Service Connect" },
      { name: "description", content: "Ubicaci\u00f3n satelital de todas las plantas registradas." },
    ],
  }),
  component: MapaPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">No encontrado.</div>,
});

type Vista = "satellite" | "hybrid" | "roadmap";
const ESTILOS: Record<Vista, string> = {
  hybrid: ESTILO_SATELITE,
  satellite: ESTILO_SATELITE_PURO,
  roadmap: ESTILO_CALLES,
};

function MapaPage() {
  const fPlantas = useServerFn(listPlantas);
  const plantas = useQuery({ queryKey: ["plantas"], queryFn: () => fPlantas() });
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mbRef = useRef<MapboxNS | null>(null);
  const markersRef = useRef<any[]>([]);
  const [listo, setListo] = useState(false);
  const [tipo, setTipo] = usePersistedState<Vista>("mapa.tipo", "hybrid");
  const [selected, setSelected] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = ((plantas.data as any[] | undefined) ?? []).filter(
    (p) => p.latitud != null && p.longitud != null,
  );

  useEffect(() => {
    let cancelled = false;
    cargarMapbox()
      .then((mb) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        mbRef.current = mb;
        const map = new mb.Map({
          container: mapEl.current,
          style: ESTILOS[tipo] ?? ESTILO_SATELITE,
          center: [-89.2, 13.7],
          zoom: 6,
          attributionControl: false,
        });
        map.addControl(new mb.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mb.FullscreenControl(), "top-right");
        map.on("load", () => { mapRef.current = map; setListo(true); });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!listo || !mapRef.current) return;
    mapRef.current.setStyle(ESTILOS[tipo] ?? ESTILO_SATELITE);
  }, [listo, tipo]);

  useEffect(() => {
    const map = mapRef.current;
    const mb = mbRef.current;
    if (!listo || !map || !mb || rows.length === 0) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    rows.forEach((p) => {
      const pos: [number, number] = [Number(p.longitud), Number(p.latitud)];
      const marker = new mb.Marker({ color: "#16a34a" }).setLngLat(pos).addTo(map);
      marker.getElement().style.cursor = "pointer";
      marker.getElement().setAttribute("aria-label", p.nombre);
      marker.getElement().addEventListener("click", () => {
        setSelected(p);
        map.flyTo({ center: pos, zoom: Math.max(map.getZoom(), 16), duration: 500 });
      });
      markersRef.current.push(marker);
    });
    ajustarA(mb, map, rows.map((p) => ({ lat: Number(p.latitud), lng: Number(p.longitud) })), 60, 16);
  }, [listo, rows.length]);

  function enfocar(p: any) {
    if (!mapRef.current) return;
    mapRef.current.flyTo({ center: [Number(p.longitud), Number(p.latitud)], zoom: 18, duration: 600 });
    setSelected(p);
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full space-y-4">
      <PageHeader
        title="Mapa de plantas"
        description="Visualiza todas las plantas registradas con vista satelital y ubicación exacta."
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Vista:</span>
        {([
          { v: "hybrid", label: "Satélite + etiquetas", Icon: Satellite },
          { v: "satellite", label: "Satélite", Icon: Satellite },
          { v: "roadmap", label: "Mapa", Icon: MapIcon },
        ] as const).map((o) => (
          <button
            key={o.v}
            onClick={() => setTipo(o.v)}
            className={
              "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border transition-colors " +
              (tipo === o.v
                ? "bg-primary text-primary-foreground border-primary"
                : "border-input hover:bg-secondary")
            }
          >
            <o.Icon className="size-3.5" />
            {o.label}
          </button>
        ))}
        <span className="ml-auto text-muted-foreground">
          {rows.length} de {(plantas.data as any[] | undefined)?.length ?? 0} plantas con coordenadas
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="rounded-xl border border-border overflow-hidden bg-secondary/40 relative" style={{ height: "70vh", minHeight: 480 }}>
          {error && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-destructive">
              No se pudo cargar el mapa: {error}
            </div>
          )}
          <div ref={mapEl} className="w-full h-full" />
        </div>

        <aside className="rounded-xl border border-border bg-card overflow-hidden flex flex-col" style={{ height: "70vh", minHeight: 480 }}>
          <div className="px-4 py-3 border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Plantas registradas
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {rows.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                Ninguna planta tiene coordenadas registradas todavía. Añade latitud/longitud desde el módulo de Plantas.
              </p>
            )}
            {rows.map((p) => (
              <button
                key={p.id}
                onClick={() => enfocar(p)}
                className={
                  "w-full text-left px-4 py-3 hover:bg-secondary/60 transition-colors " +
                  (selected?.id === p.id ? "bg-secondary" : "")
                }
              >
                <div className="flex items-start gap-2">
                  <MapPin className="size-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.clientes?.nombre ?? "Sin cliente"}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      {Number(p.latitud).toFixed(5)}, {Number(p.longitud).toFixed(5)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {selected && (
            <div className="border-t border-border p-3 text-xs bg-secondary/30">
              <p className="font-semibold">{selected.nombre}</p>
              <a
                target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${selected.latitud},${selected.longitud}`}
                className="text-primary hover:underline"
              >
                Abrir en Google Maps ↗
              </a>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}