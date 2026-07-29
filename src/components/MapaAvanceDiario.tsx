import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPinned } from "lucide-react";
import { cargarGoogleMaps } from "@/lib/gmaps-loader";
import { listZonasDeTrabajo, listZonasDiario, marcarZonaDiario } from "@/lib/planta-zonas.functions";

type Estado = "en_proceso" | "completada" | null;

const ESTILO: Record<string, { stroke: string; fill: string; label: string }> = {
  completada: { stroke: "#16a34a", fill: "#22c55e", label: "Completada" },
  en_proceso: { stroke: "#d97706", fill: "#f59e0b", label: "En proceso" },
  pendiente: { stroke: "#94a3b8", fill: "#94a3b8", label: "Pendiente" },
};

/** Mapa satelital donde el técnico marca el avance del día por zona. */
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
  const polysRef = useRef<Map<string, any>>(new Map());
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zonas: any[] = (zonasQ.data as any)?.zonas ?? [];
  const marcas = new Map<string, Estado>(
    ((marcasQ.data as any[] | undefined) ?? []).map((m) => [m.zona_id, m.estado as Estado]),
  );

  useEffect(() => {
    if (!zonas.length) return;
    let cancelado = false;
    cargarGoogleMaps()
      .then((google) => {
        if (cancelado || !mapEl.current || mapRef.current) return;
        mapRef.current = new google.maps.Map(mapEl.current, {
          zoom: 18,
          center: { lat: 13.7, lng: -89.2 },
          mapTypeId: "hybrid",
          streetViewControl: false,
          fullscreenControl: true,
        });
        setListo(true);
      })
      .catch((e) => setError(e.message));
    return () => { cancelado = true; };
  }, [zonas.length]);

  useEffect(() => {
    if (!listo || !mapRef.current) return;
    const google = (window as any).google;
    polysRef.current.forEach((p) => p.setMap(null));
    polysRef.current.clear();
    const bounds = new google.maps.LatLngBounds();
    let hay = false;
    zonas.forEach((z) => {
      const pts = Array.isArray(z.poligono) ? z.poligono : [];
      if (pts.length < 3) return;
      const est = marcas.get(z.id) ?? null;
      const style = ESTILO[est ?? "pendiente"];
      const poly = new google.maps.Polygon({
        paths: pts,
        strokeColor: style.stroke,
        strokeWeight: 2,
        fillColor: style.fill,
        fillOpacity: est ? 0.5 : 0.15,
        map: mapRef.current,
        clickable: !readOnly,
      });
      if (!readOnly) {
        poly.addListener("click", () => ciclar(z.id, est));
      }
      polysRef.current.set(z.id, poly);
      pts.forEach((p: any) => { bounds.extend(p); hay = true; });
    });
    if (hay) mapRef.current.fitBounds(bounds, 40);
  }, [listo, zonas, marcasQ.data, readOnly]);

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
          <div className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-destructive">
            No se pudo cargar el mapa: {error}
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
