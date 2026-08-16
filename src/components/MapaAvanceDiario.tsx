import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPinned } from "lucide-react";
import { cargarMapbox, ESTILO_SATELITE, ajustarA, type MapboxNS } from "@/lib/mapbox-loader";
import { listZonasDeTrabajo, listZonasDiario, marcarZonaDiario } from "@/lib/planta-zonas.functions";

type Estado = "en_proceso" | "completada" | null;

const ESTILO: Record<string, { stroke: string; fill: string; label: string }> = {
  completada: { stroke: "#16a34a", fill: "#22c55e", label: "Completada" },
  en_proceso: { stroke: "#d97706", fill: "#f59e0b", label: "En proceso" },
  pendiente: { stroke: "#94a3b8", fill: "#94a3b8", label: "Pendiente" },
};

const SRC = "zonas-avance";

/** Mapa satelital (Mapbox) donde el técnico marca el avance del día por zona. */
export function MapaAvanceDiario({
  trabajoId,
  reporteDiarioId,
  readOnly = false,
}: {
  trabajoId: string;
  reporteDiarioId: string;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const fZonas = useServerFn(listZonasDeTrabajo);
  const fMarcas = useServerFn(listZonasDiario);
  const fMarcar = useServerFn(marcarZonaDiario);

  const zonasQ = useQuery({
    queryKey: ["zonas-trabajo", trabajoId],
    queryFn: () => fZonas({ data: { trabajo_id: trabajoId } }),
  });
  const marcasQ = useQuery({
    queryKey: ["zonas-diario", reporteDiarioId],
    queryFn: () => fMarcas({ data: { reporte_diario_id: reporteDiarioId } }),
  });

  const marcar = useMutation({
    mutationFn: (v: { zona_id: string; estado: Estado }) =>
      fMarcar({ data: { reporte_diario_id: reporteDiarioId, trabajo_id: trabajoId, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zonas-diario", reporteDiarioId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mbRef = useRef<MapboxNS | null>(null);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zonas: any[] = (zonasQ.data as any)?.zonas ?? [];
  const marcas = new Map<string, Estado>(
    ((marcasQ.data as any[] | undefined) ?? []).map((m) => [m.zona_id, m.estado as Estado]),
  );
  const marcasRef = useRef(marcas);
  marcasRef.current = marcas;

  useEffect(() => {
    if (!zonas.length) return;
    let cancelado = false;
    cargarMapbox()
      .then((mb) => {
        if (cancelado || !mapEl.current || mapRef.current) return;
        mbRef.current = mb;
        const map = new mb.Map({
          container: mapEl.current,
          style: ESTILO_SATELITE,
          center: [-89.2, 13.7],
          zoom: 16,
          attributionControl: false,
        });
        map.addControl(new mb.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mb.FullscreenControl(), "top-right");
        map.on("load", () => {
          map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addLayer({
            id: `${SRC}-fill`,
            type: "fill",
            source: SRC,
            paint: { "fill-color": ["get", "fill"], "fill-opacity": ["get", "opacity"] },
          });
          map.addLayer({
            id: `${SRC}-line`,
            type: "line",
            source: SRC,
            paint: { "line-color": ["get", "stroke"], "line-width": 2 },
          });
          map.on("click", `${SRC}-fill`, (ev: any) => {
            if (readOnlyRef.current) return;
            const f = ev.features?.[0];
            if (!f) return;
            ciclar(f.properties.zonaId, marcasRef.current.get(f.properties.zonaId) ?? null);
          });
          map.on("mouseenter", `${SRC}-fill`, () => {
            if (!readOnlyRef.current) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", `${SRC}-fill`, () => {
            map.getCanvas().style.cursor = "";
          });
          mapRef.current = map;
          setListo(true);
        });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelado = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [zonas.length]);

  useEffect(() => {
    const map = mapRef.current;
    const mb = mbRef.current;
    if (!listo || !map || !mb) return;
    const features: any[] = [];
    const todos: { lat: number; lng: number }[] = [];
    zonas.forEach((z) => {
      const pts = Array.isArray(z.poligono) ? z.poligono : [];
      if (pts.length < 3) return;
      const est = marcas.get(z.id) ?? null;
      const style = ESTILO[est ?? "pendiente"];
      const ring = pts.map((p: any) => [Number(p.lng), Number(p.lat)]);
      ring.push(ring[0]);
      features.push({
        type: "Feature",
        properties: {
          zonaId: z.id,
          stroke: style.stroke,
          fill: style.fill,
          opacity: est ? 0.5 : 0.15,
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
      pts.forEach((p: any) => todos.push({ lat: Number(p.lat), lng: Number(p.lng) }));
    });
    map.getSource(SRC)?.setData({ type: "FeatureCollection", features });
    ajustarA(mb, map, todos, 40);
  }, [listo, zonas, marcasQ.data]);

  function ciclar(zonaId: string, actual: Estado) {
    const siguiente: Estado = actual === null ? "en_proceso" : actual === "en_proceso" ? "completada" : null;
    marcar.mutate({ zona_id: zonaId, estado: siguiente });
  }

  if (zonasQ.isLoading) return <p className="text-[11px] text-muted-foreground">Cargando mapa de zonas…</p>;
  if (!zonas.length) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Esta planta aún no tiene zonas dibujadas. Un supervisor puede crearlas desde Plantas → Zonas.
      </p>
    );
  }

  const completadas = zonas.filter((z) => marcas.get(z.id) === "completada").length;
  const enProceso = zonas.filter((z) => marcas.get(z.id) === "en_proceso").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
        <MapPinned className="size-3.5 text-primary" />
        <span>{completadas} completadas · {enProceso} en proceso · {zonas.length} zonas</span>
        {!readOnly && <span className="ml-auto">Toca una zona para cambiar su estado</span>}
      </div>
      <div className="rounded-md border border-border overflow-hidden relative" style={{ height: 280 }}>
        {error && (
          <div className="absolute inset-0 overflow-y-auto grid place-items-center p-3 text-center text-[11px] text-destructive z-10">
            <p>
              No se pudo cargar el mapa: {error}
              <br />
              <span className="text-muted-foreground">
                Puedes marcar el avance con los botones de zona de abajo.
              </span>
            </p>
          </div>
        )}
        <div ref={mapEl} className="w-full h-full" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {zonas.map((z) => {
          const est = marcas.get(z.id) ?? null;
          const style = ESTILO[est ?? "pendiente"];
          return (
            <button
              key={z.id}
              type="button"
              disabled={readOnly || marcar.isPending}
              onClick={() => ciclar(z.id, est)}
              className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border text-[10px] font-medium disabled:opacity-70"
              style={{ borderColor: style.stroke, color: style.stroke, background: `${style.fill}20` }}
            >
              <span className="size-2 rounded-full" style={{ background: style.stroke }} />
              {z.nombre} · {style.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
