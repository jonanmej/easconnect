import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listPlantas } from "@/lib/operations.functions";
import { MapPin, Satellite, Map as MapIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa de plantas · EA Service Connect" },
      { name: "description", content: "Ubicación satelital de todas las plantas registradas." },
    ],
  }),
  component: MapaPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">No encontrado.</div>,
});

declare global {
  interface Window {
    __eaInitMap?: () => void;
  }
}
const gmaps = (): any => (typeof window !== "undefined" ? (window as any).google : undefined);

function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (gmaps()?.maps) return Promise.resolve(gmaps());
  const existing = document.getElementById("gmaps-js") as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (gmaps()?.maps) { clearInterval(timer); resolve(gmaps()); }
      }, 100);
      setTimeout(() => { clearInterval(timer); reject(new Error("timeout")); }, 15000);
    });
  }
  return new Promise((resolve, reject) => {
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!key) { reject(new Error("Falta clave de Google Maps")); return; }
    window.__eaInitMap = () => resolve(gmaps());
    const s = document.createElement("script");
    s.id = "gmaps-js";
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__eaInitMap${channel ? `&channel=${channel}` : ""}`;
    s.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.body.appendChild(s);
  });
}

function MapaPage() {
  const fPlantas = useServerFn(listPlantas);
  const plantas = useQuery({ queryKey: ["plantas"], queryFn: () => fPlantas() });
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [tipo, setTipo] = useState<"satellite" | "hybrid" | "roadmap">("hybrid");
  const [selected, setSelected] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = ((plantas.data as any[] | undefined) ?? []).filter(
    (p) => p.latitud != null && p.longitud != null,
  );

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapEl.current) return;
        mapRef.current = new google.maps.Map(mapEl.current, {
          zoom: 6,
          center: { lat: 13.7, lng: -89.2 },
          mapTypeId: "hybrid",
          streetViewControl: false,
          fullscreenControl: true,
        });
      })
      .catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !gmaps()?.maps) return;
    mapRef.current.setMapTypeId(tipo);
  }, [tipo]);

  useEffect(() => {
    if (!mapRef.current || !gmaps()?.maps || rows.length === 0) return;
    const google = gmaps();
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new google.maps.LatLngBounds();
    rows.forEach((p) => {
      const pos = { lat: Number(p.latitud), lng: Number(p.longitud) };
      const marker = new google.maps.Marker({
        position: pos,
        map: mapRef.current,
        title: p.nombre,
      });
      marker.addListener("click", () => {
        setSelected(p);
        mapRef.current.panTo(pos);
        if (mapRef.current.getZoom() < 15) mapRef.current.setZoom(17);
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
    });
    if (rows.length === 1) {
      mapRef.current.setCenter(bounds.getCenter());
      mapRef.current.setZoom(15);
    } else {
      mapRef.current.fitBounds(bounds, 60);
    }
  }, [rows.length]);

  function enfocar(p: any) {
    if (!mapRef.current || !gmaps()?.maps) return;
    const pos = { lat: Number(p.latitud), lng: Number(p.longitud) };
    mapRef.current.panTo(pos);
    mapRef.current.setZoom(18);
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