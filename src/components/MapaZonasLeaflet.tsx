import { useEffect, useRef, useState } from "react";
import { cargarLeaflet, TILES_SATELITE, ATRIBUCION_SATELITE, type LeafletNS } from "@/lib/leaflet-loader";

export type ZonaLeaflet = {
  id: string;
  nombre?: string | null;
  color?: string | null;
  poligono?: { lat: number; lng: number }[] | any;
  opacidad?: number;
};

type Punto = { lat: number; lng: number };

/**
 * Mapa satelital alternativo (sin WebGL) para ver y marcar zonas.
 * Se usa cuando Mapbox no puede iniciar en el dispositivo.
 */
export function MapaZonasLeaflet({
  zonas,
  center,
  modoDibujo = false,
  puntos = [],
  onPunto,
  onClickZona,
}: {
  zonas: ZonaLeaflet[];
  center?: Punto | null;
  modoDibujo?: boolean;
  puntos?: Punto[];
  onPunto?: (p: Punto) => void;
  onClickZona?: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<LeafletNS | null>(null);
  const capaRef = useRef<any>(null);
  const dibujoRef = useRef(modoDibujo);
  dibujoRef.current = modoDibujo;
  const onPuntoRef = useRef(onPunto);
  onPuntoRef.current = onPunto;
  const onZonaRef = useRef(onClickZona);
  onZonaRef.current = onClickZona;

  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    cargarLeaflet()
      .then((L) => {
        if (cancelado || !el.current || mapRef.current) return;
        LRef.current = L;
        const map = L.map(el.current, { attributionControl: true, zoomControl: true }).setView(
          [center?.lat ?? 13.7, center?.lng ?? -89.2],
          center ? 18 : 8,
        );
        L.tileLayer(TILES_SATELITE, { maxZoom: 21, attribution: ATRIBUCION_SATELITE }).addTo(map);
        capaRef.current = L.layerGroup().addTo(map);
        map.on("click", (ev: any) => {
          if (dibujoRef.current) onPuntoRef.current?.({ lat: ev.latlng.lat, lng: ev.latlng.lng });
        });
        mapRef.current = map;
        setListo(true);
      })
      .catch((e) => setError(e?.message ?? "No se pudo cargar el mapa alternativo"));
    return () => {
      cancelado = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Redibuja zonas y trazo en curso.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const capa = capaRef.current;
    if (!listo || !L || !map || !capa) return;
    capa.clearLayers();
    const todos: Punto[] = [];
    zonas.forEach((z) => {
      const pts: Punto[] = Array.isArray(z.poligono) ? z.poligono : [];
      if (pts.length < 3) return;
      const latlngs = pts.map((p) => [Number(p.lat), Number(p.lng)] as [number, number]);
      const color = z.color || "#22c55e";
      const poly = L.polygon(latlngs, {
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: z.opacidad ?? 0.3,
      }).addTo(capa);
      if (z.nombre) poly.bindTooltip(z.nombre, { direction: "center", permanent: false });
      poly.on("click", (ev: any) => {
        ev.originalEvent?.stopPropagation?.();
        if (!dibujoRef.current) onZonaRef.current?.(z.id);
      });
      todos.push(...pts);
    });
    puntos.forEach((p) =>
      L.circleMarker([Number(p.lat), Number(p.lng)], {
        radius: 5,
        color: "#22c55e",
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 2,
      }).addTo(capa),
    );
    if (puntos.length >= 2) {
      L.polyline(puntos.map((p) => [Number(p.lat), Number(p.lng)] as [number, number]), {
        color: "#22c55e",
        weight: 3,
      }).addTo(capa);
    }
    map.getContainer().style.cursor = modoDibujo ? "crosshair" : "";
    if (todos.length && !puntos.length) {
      const b = L.latLngBounds(todos.map((p) => [Number(p.lat), Number(p.lng)] as [number, number]));
      if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 20 });
    }
  }, [listo, zonas, puntos, modoDibujo]);

  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [listo]);

  if (error) {
    return (
      <div className="w-full h-full grid place-items-center p-4 text-center text-[11px] text-muted-foreground">
        {error}
      </div>
    );
  }
  return <div ref={el} className="w-full h-full z-0" />;
}
