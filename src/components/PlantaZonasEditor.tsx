import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Pencil, Trash2, Save, Shapes, Check, RotateCcw, ListPlus, RefreshCw } from "lucide-react";
import {
  cargarMapbox, centroDe, ajustarA, ESTILO_SATELITE, type MapboxNS,
} from "@/lib/mapbox-loader";
import { MapaZonasLeaflet } from "@/components/MapaZonasLeaflet";
import {
  listZonasPlanta,
  upsertZonaPlanta,
  eliminarZonaPlanta,
} from "@/lib/planta-zonas.functions";

type Punto = { lat: number; lng: number };

const COLORES = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];
const SRC_ZONAS = "zonas-planta";
const SRC_DIBUJO = "zonas-dibujo";

/** Editor de zonas (polígonos) sobre la vista satelital de Mapbox. */
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
  const mbRef = useRef<MapboxNS | null>(null);
  const modoDibujoRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [borrador, setBorrador] = useState<Punto[] | null>(null);
  const [editando, setEditando] = useState<any | null>(null);
  const [modoDibujo, setModoDibujo] = useState(false);
  const [puntosDibujo, setPuntosDibujo] = useState<Punto[]>([]);
  const [modoLista, setModoLista] = useState(false);
  /** Motor de mapa: principal (Mapbox/WebGL) o alternativo por imágenes. */
  const [motor, setMotor] = useState<"principal" | "imagenes">("principal");
  const [motivo, setMotivo] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [restaurado, setRestaurado] = useState(false);

  const usarAlterno = motor === "imagenes";
  const CLAVE_BORRADOR = `zonas-borrador:${planta.id}`;

  /** Activa el mapa alternativo al instante, sin recargar, explicando el motivo. */
  function activarAlterno(razon: string) {
    setMotor((m) => {
      if (m === "imagenes") return m;
      toast.message("Mapa alternativo activado", { description: razon });
      return "imagenes";
    });
    setMotivo(razon);
  }

  function volverPrincipal() {
    setMotivo(null);
    setError(null);
    setListo(false);
    setMotor("principal");
    setIntento((n) => n + 1);
  }

  // Autoguardado del trazo en curso (sobrevive al cambio de mapa y a recargas).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLAVE_BORRADOR);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d?.borrador) && d.borrador.length >= 3) {
          setBorrador(d.borrador);
          toast.message("Se recuperó un trazo sin guardar de esta planta.");
        } else if (Array.isArray(d?.puntos) && d.puntos.length) {
          setPuntosDibujo(d.puntos);
          setModoDibujo(true);
          modoDibujoRef.current = true;
          toast.message(`Se recuperaron ${d.puntos.length} puntos del trazo en curso.`);
        }
      }
    } catch { /* sin autoguardado */ }
    setRestaurado(true);
  }, [planta.id]);

  useEffect(() => {
    if (!restaurado) return;
    try {
      if (borrador?.length || puntosDibujo.length) {
        localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ borrador, puntos: puntosDibujo, ts: Date.now() }));
      } else {
        localStorage.removeItem(CLAVE_BORRADOR);
      }
    } catch { /* almacenamiento lleno */ }
  }, [restaurado, borrador, puntosDibujo, CLAVE_BORRADOR]);

  const rows = (zonas.data as any[] | undefined) ?? [];
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

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
    setBorrador(null);
    setPuntosDibujo([]);
    setModoDibujo(false);
    modoDibujoRef.current = false;
  }

  useEffect(() => {
    let cancelado = false;
    cargarMapbox()
      .then((mb) => {
        if (cancelado || !mapEl.current || mapRef.current) return;
        mbRef.current = mb;
        const center: [number, number] =
          planta.latitud != null && planta.longitud != null
            ? [Number(planta.longitud), Number(planta.latitud)]
            : [-89.2, 13.7];
        const map = new mb.Map({
          container: mapEl.current,
          style: ESTILO_SATELITE,
          center,
          zoom: planta.latitud != null ? 18 : 8,
          attributionControl: false,
        });
        map.addControl(new mb.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mb.FullscreenControl(), "top-right");
        map.on("load", () => {
          const vacio = { type: "FeatureCollection", features: [] } as any;
          map.addSource(SRC_ZONAS, { type: "geojson", data: vacio });
          map.addLayer({
            id: `${SRC_ZONAS}-fill`,
            type: "fill",
            source: SRC_ZONAS,
            paint: { "fill-color": ["get", "color"], "fill-opacity": 0.25 },
          });
          map.addLayer({
            id: `${SRC_ZONAS}-line`,
            type: "line",
            source: SRC_ZONAS,
            paint: { "line-color": ["get", "color"], "line-width": 2 },
          });
          map.addSource(SRC_DIBUJO, { type: "geojson", data: vacio });
          map.addLayer({
            id: `${SRC_DIBUJO}-fill`,
            type: "fill",
            source: SRC_DIBUJO,
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: { "fill-color": "#22c55e", "fill-opacity": 0.3 },
          });
          map.addLayer({
            id: `${SRC_DIBUJO}-line`,
            type: "line",
            source: SRC_DIBUJO,
            paint: { "line-color": "#22c55e", "line-width": 3 },
          });
          map.addLayer({
            id: `${SRC_DIBUJO}-pts`,
            type: "circle",
            source: SRC_DIBUJO,
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-radius": 5,
              "circle-color": "#ffffff",
              "circle-stroke-color": "#22c55e",
              "circle-stroke-width": 2,
            },
          });

          map.on("click", (ev: any) => {
            if (modoDibujoRef.current) {
              const { lng, lat } = ev.lngLat;
              setPuntosDibujo((actuales) => [...actuales, { lat, lng }]);
              return;
            }
            const hits = map.queryRenderedFeatures(ev.point, { layers: [`${SRC_ZONAS}-fill`] });
            const id = (hits?.[0] as any)?.properties?.zonaId as string | undefined;
            if (id) {
              const z = rowsRef.current.find((r: any) => r.id === id);
              if (z) setEditando(z);
            }
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
  }, [planta.id, planta.latitud, planta.longitud]);

  // Pinta las zonas guardadas.
  useEffect(() => {
    const map = mapRef.current;
    const mb = mbRef.current;
    if (!listo || !map || !mb) return;
    const features: any[] = [];
    const todos: Punto[] = [];
    rows.forEach((z) => {
      const pts: Punto[] = Array.isArray(z.poligono) ? z.poligono : [];
      if (pts.length < 3) return;
      const ring = pts.map((p) => [Number(p.lng), Number(p.lat)]);
      ring.push(ring[0]);
      features.push({
        type: "Feature",
        properties: { zonaId: z.id, color: z.color || "#22c55e" },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
      pts.forEach((p) => todos.push(p));
    });
    map.getSource(SRC_ZONAS)?.setData({ type: "FeatureCollection", features });
    if (todos.length && planta.latitud == null) ajustarA(mb, map, todos, 60);
  }, [listo, rows, planta.latitud]);

  // Cursor y trazo del dibujo en curso / borrador.
  useEffect(() => {
    const map = mapRef.current;
    if (!listo || !map) return;
    map.getCanvas().style.cursor = modoDibujo ? "crosshair" : "";
    const pts = borrador ?? puntosDibujo;
    const features: any[] = [];
    if (pts.length) {
      features.push(
        ...pts.map((p) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        })),
      );
      if (borrador && pts.length >= 3) {
        const ring = pts.map((p) => [p.lng, p.lat]);
        ring.push(ring[0]);
        features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [ring] },
        });
      } else if (pts.length >= 2) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: pts.map((p) => [p.lng, p.lat]) },
        });
      }
    }
    map.getSource(SRC_DIBUJO)?.setData({ type: "FeatureCollection", features });
  }, [listo, puntosDibujo, borrador, modoDibujo]);

  function dibujar() {
    if (!mapRef.current && !error) return;
    limpiarBorrador();
    setModoDibujo(true);
    modoDibujoRef.current = true;
    toast.message("Toca el mapa para marcar los vértices de la zona. Finaliza cuando tengas al menos 3 puntos.");
  }

  function finalizarDibujo() {
    if ((!mapRef.current && !error) || puntosDibujo.length < 3) {
      toast.error("Marca al menos 3 puntos para formar una zona.");
      return;
    }
    setBorrador(puntosDibujo);
    setPuntosDibujo([]);
    setModoDibujo(false);
    modoDibujoRef.current = false;
    setEditando(null);
    toast.success("Zona marcada. Completa los datos y guarda.");
  }

  function deshacerPunto() {
    setPuntosDibujo((actuales) => actuales.slice(0, -1));
  }

  function guardarBorrador(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pts = borrador;
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

  /** Crea un cuadrado pequeño alrededor de la planta para poder registrar la zona sin mapa. */
  function poligonoAproximado(): Punto[] | null {
    if (planta.latitud == null || planta.longitud == null) return null;
    const lat = Number(planta.latitud);
    const lng = Number(planta.longitud);
    const d = 0.0003;
    return [
      { lat: lat + d, lng: lng - d },
      { lat: lat + d, lng: lng + d },
      { lat: lat - d, lng: lng + d },
      { lat: lat - d, lng: lng - d },
    ];
  }

  function guardarSinMapa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pts = poligonoAproximado();
    if (!pts) {
      toast.error("Esta planta no tiene coordenadas. Regístralas en Plantas para poder crear zonas sin mapa.");
      return;
    }
    const f = new FormData(e.currentTarget);
    save.mutate({
      planta_id: planta.id,
      nombre: String(f.get("nombre") || "").trim() || `Zona ${rows.length + 1}`,
      paneles_estimados: Number(f.get("paneles") || 0),
      color: String(f.get("color") || "#22c55e"),
      poligono: pts,
      orden: rows.length,
    });
    e.currentTarget.reset();
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-stretch sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-6xl h-full sm:h-[90vh] bg-background sm:rounded-xl border border-border flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="safe-top safe-x sm:!pt-3 flex items-center justify-between gap-2 px-4 pb-3 border-b border-border shrink-0 bg-background">
          <div className="min-w-0">
            <p className="text-[11px] uppercase text-primary font-semibold">Layout de zonas</p>
            <p className="text-sm font-medium truncate">{planta.nombre}</p>
          </div>
          <button
            onClick={onClose}
            className="size-10 shrink-0 grid place-items-center rounded-md border border-border hover:bg-secondary active:scale-95"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_320px]">
          <div className="relative bg-secondary/40 h-[46vh] min-h-[260px] lg:h-auto">
            {error ? (
              <>
                <div className="absolute top-2 left-2 right-2 z-[400] rounded-md border border-primary/40 bg-background/95 px-2.5 py-1.5 text-[10px] leading-snug shadow-sm">
                  <span className="font-semibold text-primary">Mapa alternativo activo</span> — imágenes
                  satelitales sin aceleración gráfica. Puedes dibujar y editar zonas normalmente.
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="ml-1.5 inline-flex items-center gap-1 font-semibold underline"
                  >
                    <RefreshCw className="size-3" /> Reintentar mapa principal
                  </button>
                </div>
                <MapaZonasLeaflet
                  zonas={rows.map((z: any) => ({
                    id: z.id,
                    nombre: z.nombre,
                    color: z.color,
                    poligono: z.poligono,
                  }))}
                  center={
                    planta.latitud != null && planta.longitud != null
                      ? { lat: Number(planta.latitud), lng: Number(planta.longitud) }
                      : null
                  }
                  modoDibujo={modoDibujo}
                  puntos={borrador ?? puntosDibujo}
                  onPunto={(p) => setPuntosDibujo((a) => [...a, p])}
                  onClickZona={(id) => {
                    const z = rowsRef.current.find((r: any) => r.id === id);
                    if (z) setEditando(z);
                  }}
                />
              </>
            ) : (
              <div ref={mapEl} className="w-full h-full" />
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[500] pointer-events-auto flex flex-col items-center gap-2 w-[92%]">
              {modoDibujo && (
                <div className="rounded-full bg-background/95 border border-border px-3 py-1.5 text-xs font-medium shadow-lg">
                  {puntosDibujo.length} punto{puntosDibujo.length === 1 ? "" : "s"} marcados
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {!modoDibujo ? (
                  <button
                    onClick={dibujar}
                    disabled={!listo && !error}
                    className="h-10 px-4 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-black/20 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <Shapes className="size-4" /> Dibujar zona
                  </button>
                ) : (
                  <>
                    <button
                      onClick={deshacerPunto}
                      disabled={puntosDibujo.length === 0}
                      className="h-10 px-3 inline-flex items-center gap-2 rounded-full border border-border bg-background text-sm font-semibold shadow-lg disabled:opacity-50"
                    >
                      <RotateCcw className="size-4" /> Deshacer
                    </button>
                    <button
                      onClick={finalizarDibujo}
                      disabled={puntosDibujo.length < 3}
                      className="h-10 px-4 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-black/20 active:scale-95 transition-transform disabled:opacity-50"
                    >
                      <Check className="size-4" /> Finalizar zona
                    </button>
                    <button
                      onClick={limpiarBorrador}
                      className="h-10 px-3 inline-flex items-center gap-2 rounded-full border border-border bg-background text-sm font-semibold shadow-lg"
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <aside className="border-t lg:border-t-0 lg:border-l border-border lg:overflow-y-auto p-3 pb-[max(env(safe-area-inset-bottom),1rem)] space-y-3">
            {(modoLista || error) && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-primary inline-flex items-center gap-1.5">
                  <ListPlus className="size-3.5" /> Modo lista (sin mapa)
                </p>
                {!modoLista ? (
                  <button
                    type="button"
                    onClick={() => setModoLista(true)}
                    className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold"
                  >
                    Activar modo lista
                  </button>
                ) : (
                  <form onSubmit={guardarSinMapa} className="space-y-2">
                    <input name="nombre" placeholder="Nombre de la zona" className={inputCls} required />
                    <input name="paneles" type="number" min="0" placeholder="Paneles estimados" className={inputCls} />
                    <select name="color" className={inputCls} defaultValue="#22c55e">
                      {COLORES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button
                      type="submit"
                      disabled={save.isPending}
                      className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
                    >
                      <Save className="size-3.5" /> Guardar zona sin trazo
                    </button>
                    <p className="text-[10px] text-muted-foreground">
                      Se guarda con una ubicación aproximada de la planta; podrás corregir el trazo en el mapa
                      cuando esté disponible.
                    </p>
                  </form>
                )}
              </div>
            )}

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
                      mapRef.current?.flyTo({ center: [c.lng, c.lat], zoom: 19, duration: 400 });
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
