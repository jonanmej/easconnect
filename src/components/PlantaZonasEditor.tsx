import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Pencil, Trash2, Save, Shapes } from "lucide-react";
import { cargarGoogleMaps, centroDe } from "@/lib/gmaps-loader";
import {
  listZonasPlanta,
  upsertZonaPlanta,
  eliminarZonaPlanta,
} from "@/lib/planta-zonas.functions";

type Punto = { lat: number; lng: number };

const COLORES = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];

/** Editor de zonas (polígonos) sobre la vista satelital de una planta. */
export function PlantaZonasEditor({
  planta,
  onClose,
}: {
  planta: { id: string; nombre: string; latitud?: number | null; longitud?: number | null };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fList = useServerFn(listZonasPlanta);
  const fSave = useServerFn(upsertZonaPlanta);
  const fDel = useServerFn(eliminarZonaPlanta);

  const zonas = useQuery({
    queryKey: ["planta-zonas", planta.id],
    queryFn: () => fList({ data: { planta_id: planta.id } }),
  });

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const shapesRef = useRef<Map<string, any>>(new Map());
  const drawingRef = useRef<any>(null);
  const nuevoRef = useRef<any>(null);

  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [borrador, setBorrador] = useState<Punto[] | null>(null);
  const [editando, setEditando] = useState<any | null>(null);

  const rows = (zonas.data as any[] | undefined) ?? [];

  const save = useMutation({
    mutationFn: (v: any) => fSave({ data: v }),
    onSuccess: () => {
      toast.success("Zona guardada");
      limpiarBorrador();
      setEditando(null);
      qc.invalidateQueries({ queryKey: ["planta-zonas", planta.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => fDel({ data: { id } }),
    onSuccess: () => {
      toast.success("Zona eliminada");
      qc.invalidateQueries({ queryKey: ["planta-zonas", planta.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function limpiarBorrador() {
    if (nuevoRef.current) { nuevoRef.current.setMap(null); nuevoRef.current = null; }
    setBorrador(null);
  }

  useEffect(() => {
    let cancelado = false;
    cargarGoogleMaps()
      .then(async (google) => {
        if (cancelado || !mapEl.current) return;
        const center =
          planta.latitud != null && planta.longitud != null
            ? { lat: Number(planta.latitud), lng: Number(planta.longitud) }
            : { lat: 13.7, lng: -89.2 };
        mapRef.current = new google.maps.Map(mapEl.current, {
          zoom: planta.latitud != null ? 18 : 8,
          center,
          mapTypeId: "hybrid",
          streetViewControl: false,
          tilt: 0,
        });
        const { DrawingManager } = (await google.maps.importLibrary("drawing")) as any;
        const dm = new DrawingManager({
          drawingMode: null,
          drawingControl: false,
          polygonOptions: {
            strokeColor: "#22c55e",
            strokeWeight: 2,
            fillColor: "#22c55e",
            fillOpacity: 0.3,
            editable: true,
          },
        });
        dm.setMap(mapRef.current);
        drawingRef.current = dm;
        google.maps.event.addListener(dm, "polygoncomplete", (poly: any) => {
          dm.setDrawingMode(null);
          if (nuevoRef.current) nuevoRef.current.setMap(null);
          nuevoRef.current = poly;
          const pts: Punto[] = poly.getPath().getArray().map((p: any) => ({ lat: p.lat(), lng: p.lng() }));
          setBorrador(pts);
          setEditando(null);
        });
        setListo(true);
      })
      .catch((e) => setError(e.message));
    return () => { cancelado = true; };
  }, [planta.id, planta.latitud, planta.longitud]);

  // Pinta las zonas guardadas.
  useEffect(() => {
    if (!listo || !mapRef.current) return;
    const google = (window as any).google;
    shapesRef.current.forEach((s) => s.setMap(null));
    shapesRef.current.clear();
    const bounds = new google.maps.LatLngBounds();
    let hay = false;
    rows.forEach((z) => {
      const pts: Punto[] = Array.isArray(z.poligono) ? z.poligono : [];
      if (pts.length < 3) return;
      const poly = new google.maps.Polygon({
        paths: pts,
        strokeColor: z.color || "#22c55e",
        strokeWeight: 2,
        fillColor: z.color || "#22c55e",
        fillOpacity: 0.25,
        map: mapRef.current,
      });
      poly.addListener("click", () => setEditando(z));
      shapesRef.current.set(z.id, poly);
      pts.forEach((p) => { bounds.extend(p); hay = true; });
    });
    if (hay && planta.latitud == null) mapRef.current.fitBounds(bounds, 60);
  }, [listo, rows, planta.latitud]);

  function dibujar() {
    if (!drawingRef.current) return;
    const google = (window as any).google;
    drawingRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    toast.message("Marca los vértices de la zona en el mapa y cierra el polígono.");
  }

  function guardarBorrador(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pts = nuevoRef.current
      ? nuevoRef.current.getPath().getArray().map((p: any) => ({ lat: p.lat(), lng: p.lng() }))
      : borrador;
    if (!pts || pts.length < 3) { toast.error("Dibuja primero la zona en el mapa."); return; }
    save.mutate({
      planta_id: planta.id,
      nombre: String(f.get("nombre") || "").trim() || `Zona ${rows.length + 1}`,
      paneles_estimados: Number(f.get("paneles") || 0),
      color: String(f.get("color") || "#22c55e"),
      poligono: pts,
      orden: rows.length,
    });
  }

  function guardarEdicion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const f = new FormData(e.currentTarget);
    save.mutate({
      id: editando.id,
      planta_id: planta.id,
      nombre: String(f.get("nombre") || editando.nombre),
      paneles_estimados: Number(f.get("paneles") || 0),
      color: String(f.get("color") || editando.color),
      poligono: editando.poligono,
      orden: editando.orden ?? 0,
    });
  }

  const inputCls = "w-full h-9 px-3 rounded-md border border-input bg-background text-sm";

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-6xl h-full sm:h-[90vh] bg-background sm:rounded-xl border border-border flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <div className="min-w-0">
            <p className="text-[11px] uppercase text-primary font-semibold">Layout de zonas</p>
            <p className="text-sm font-medium truncate">{planta.nombre}</p>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-md hover:bg-secondary" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] overflow-hidden">
          <div className="relative bg-secondary/40 min-h-[320px]">
            {error && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-destructive">
                No se pudo cargar el mapa: {error}
              </div>
            )}
            <div ref={mapEl} className="w-full h-full" />
            <button
              onClick={dibujar}
              disabled={!listo}
              className="absolute top-3 left-3 h-9 px-3 inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold shadow disabled:opacity-50"
            >
              <Shapes className="size-3.5" /> Dibujar zona
            </button>
          </div>

          <aside className="border-t lg:border-t-0 lg:border-l border-border overflow-y-auto p-3 space-y-3">
            {borrador && (
              <form onSubmit={guardarBorrador} className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-primary">Nueva zona ({borrador.length} vértices)</p>
                <input name="nombre" placeholder="Nombre de la zona" className={inputCls} required />
                <input name="paneles" type="number" min="0" placeholder="Paneles estimados" className={inputCls} />
                <select name="color" className={inputCls} defaultValue="#22c55e">
                  {COLORES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex gap-2">
                  <button type="submit" disabled={save.isPending} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                    <Save className="size-3.5" /> Guardar
                  </button>
                  <button type="button" onClick={limpiarBorrador} className="h-9 px-3 rounded-md border border-input text-xs">
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {editando && (
              <form onSubmit={guardarEdicion} className="rounded-md border border-border bg-card p-3 space-y-2">
                <p className="text-xs font-semibold">Editar zona</p>
                <input name="nombre" defaultValue={editando.nombre} className={inputCls} required />
                <input name="paneles" type="number" min="0" defaultValue={editando.paneles_estimados ?? 0} className={inputCls} />
                <select name="color" className={inputCls} defaultValue={editando.color ?? "#22c55e"}>
                  {COLORES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex gap-2">
                  <button type="submit" disabled={save.isPending} className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                    Guardar cambios
                  </button>
                  <button type="button" onClick={() => setEditando(null)} className="h-9 px-3 rounded-md border border-input text-xs">
                    Cerrar
                  </button>
                </div>
              </form>
            )}

            <p className="text-[10px] uppercase font-bold text-muted-foreground">Zonas ({rows.length})</p>
            {rows.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Aún no hay zonas. Pulsa «Dibujar zona» y traza el área sobre el mapa satelital.
              </p>
            )}
            <ul className="space-y-1.5">
              {rows.map((z) => (
                <li key={z.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <span className="size-3 rounded-sm shrink-0" style={{ background: z.color ?? "#22c55e" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{z.nombre}</p>
                    <p className="text-[10px] text-muted-foreground">{z.paneles_estimados ?? 0} paneles est.</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditando(z);
                      const c = centroDe(z.poligono ?? []);
                      mapRef.current?.panTo(c);
                      mapRef.current?.setZoom(19);
                    }}
                    className="size-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground"
                    aria-label="Editar"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm(`¿Eliminar la zona ${z.nombre}?`)) del.mutate(z.id); }}
                    className="size-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}
