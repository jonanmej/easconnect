/// <reference types="google.maps" />
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  MapPin, Navigation, Loader2, Clock, Route as RouteIcon, AlertTriangle,
  Share2, Copy, Mail, MessageCircle, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  computeRutas, listDestinosOTs, listRecipientesRuta,
  enviarRutaEmail, OFICINA_ORIGEN,
  type ComputeRutasResult, type RutaAlternativa, type DestinoOT, type RecipienteRuta,
} from "@/lib/rutas.functions";

export const Route = createFileRoute("/_authenticated/rutas")({
  component: RutasPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-8">
        <p className="text-sm text-destructive mb-3">{error.message}</p>
        <button
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary"
          onClick={() => { router.invalidate(); reset(); }}
        >Reintentar</button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8 text-sm">No encontrado</div>,
});

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const TRACKING_ID = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

declare global {
  interface Window {
    google?: typeof google;
    __initSolarosMap?: () => void;
  }
}

let mapsLoader: Promise<typeof google> | null = null;
function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (mapsLoader) return mapsLoader;
  if (!BROWSER_KEY) return Promise.reject(new Error("Falta clave del navegador de Google Maps"));
  mapsLoader = new Promise((resolve, reject) => {
    window.__initSolarosMap = () => {
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps no se inicializó"));
    };
    const params = new URLSearchParams({
      key: BROWSER_KEY,
      libraries: "geometry",
      loading: "async",
      callback: "__initSolarosMap",
      language: "es",
      region: "SV",
    });
    if (TRACKING_ID) params.set("channel", TRACKING_ID);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(s);
  });
  return mapsLoader;
}

const COLORES = ["#1d4ed8", "#16a34a", "#ea580c", "#9333ea", "#dc2626"];

function RutasPage() {
  const [destino, setDestino] = useState("");
  const [modo, setModo] = useState<"DRIVE" | "TWO_WHEELER" | "WALK" | "BICYCLE">("DRIVE");
  const [resultado, setResultado] = useState<ComputeRutasResult | null>(null);
  const [seleccion, setSeleccion] = useState<number>(0);
  const [otSeleccionada, setOtSeleccionada] = useState<DestinoOT | null>(null);
  const [compartirAbierto, setCompartirAbierto] = useState(false);

  const fnCompute = useServerFn(computeRutas);
  const fnDestinos = useServerFn(listDestinosOTs);
  const destinosQuery = useQuery({
    queryKey: ["rutas", "destinos-ots"],
    queryFn: () => fnDestinos(),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (
      input:
        | { destinoTexto: string; modo: typeof modo }
        | { destinoLat: number; destinoLng: number; destinoTexto?: string; modo: typeof modo },
    ) => fnCompute({ data: input as any }),
    onSuccess: (r) => {
      setResultado(r);
      setSeleccion(0);
    },
    onError: (e: Error) => toast.error(e.message ?? "Error al calcular rutas"),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (destino.trim().length < 3) {
      toast.error("Ingresa una dirección o lugar de destino");
      return;
    }
    setOtSeleccionada(null);
    mutation.mutate({ destinoTexto: destino.trim(), modo });
  }

  function onSelectOT(ot: DestinoOT) {
    setOtSeleccionada(ot);
    const label = `${ot.clienteNombre} — ${ot.plantaNombre} (OT ${ot.folio})`;
    setDestino(ot.ubicacion ?? label);
    if (ot.latitud != null && ot.longitud != null) {
      mutation.mutate({
        destinoLat: ot.latitud,
        destinoLng: ot.longitud,
        destinoTexto: label,
        modo,
      });
    } else if (ot.ubicacion) {
      mutation.mutate({ destinoTexto: ot.ubicacion, modo });
    } else {
      toast.error("Esta planta no tiene ubicación registrada");
    }
  }

  return (
    <div id="main-content" className="p-6 md:p-8 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trazado de rutas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calcula rutas alternativas desde la oficina hacia cualquier destino.
          </p>
        </div>
        <div className="text-xs text-muted-foreground bg-secondary border border-border rounded-md px-3 py-2 max-w-sm">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <MapPin className="size-3.5 text-primary" /> Punto de salida
          </div>
          <div className="mt-0.5">{OFICINA_ORIGEN.label}</div>
          <div className="text-[10px] text-muted-foreground/80 mt-0.5">
            {OFICINA_ORIGEN.lat}, {OFICINA_ORIGEN.lng}
          </div>
        </div>
      </header>

      <div className="bg-card border border-border rounded-lg p-4 space-y-2">
        <label htmlFor="ot-destino" className="block text-xs font-medium">
          Destino desde OTs en progreso
        </label>
        <select
          id="ot-destino"
          value={otSeleccionada?.trabajoId ?? ""}
          onChange={(e) => {
            const ot = destinosQuery.data?.find((d) => d.trabajoId === e.target.value);
            if (ot) onSelectOT(ot);
          }}
          disabled={destinosQuery.isLoading || mutation.isPending}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">
            {destinosQuery.isLoading
              ? "Cargando OTs en progreso…"
              : (destinosQuery.data?.length ?? 0) === 0
                ? "No hay OTs en progreso"
                : "Seleccionar planta de una OT en progreso…"}
          </option>
          {destinosQuery.data?.map((d) => (
            <option key={d.trabajoId} value={d.trabajoId}>
              {d.clienteNombre} — {d.plantaNombre} · OT {d.folio}
              {d.latitud == null ? " (sin coords)" : ""}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">
          Selecciona una planta con OT activa para trazar la ruta y compartirla con el técnico, supervisor y administrador.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-wrap gap-3 items-end bg-card border border-border rounded-lg p-4">
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="destino" className="block text-xs font-medium mb-1.5">Destino manual</label>
          <input
            id="destino"
            type="text"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="Ej: Planta solar Acajutla, Sonsonate"
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="modo" className="block text-xs font-medium mb-1.5">Modo</label>
          <select
            id="modo"
            value={modo}
            onChange={(e) => setModo(e.target.value as typeof modo)}
            className="bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="DRIVE">Vehículo</option>
            <option value="TWO_WHEELER">Motocicleta</option>
            <option value="BICYCLE">Bicicleta</option>
            <option value="WALK">Caminando</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
        >
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />}
          Calcular rutas
        </button>
        {resultado && (
          <button
            type="button"
            onClick={() => setCompartirAbierto(true)}
            className="inline-flex items-center gap-2 bg-secondary border border-border text-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-secondary/70"
          >
            <Share2 className="size-4" /> Compartir ruta
          </button>
        )}
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <aside className="space-y-2">
          {!resultado && !mutation.isPending && (
            <div className="text-xs text-muted-foreground bg-secondary border border-dashed border-border rounded-md p-4">
              Ingresa un destino para ver las rutas disponibles. Se calculan hasta 3 alternativas.
            </div>
          )}
          {resultado?.rutas.map((r) => (
            <RutaCard
              key={r.index}
              ruta={r}
              color={COLORES[r.index % COLORES.length]}
              activa={seleccion === r.index}
              onSelect={() => setSeleccion(r.index)}
            />
          ))}
        </aside>

        <div className="rounded-lg overflow-hidden border border-border bg-secondary min-h-[480px] h-[60vh]">
          <MapaRutas resultado={resultado} seleccion={seleccion} />
        </div>
      </div>

      {compartirAbierto && resultado && (
        <CompartirRuta
          resultado={resultado}
          rutaActiva={resultado.rutas[seleccion] ?? resultado.rutas[0]}
          modo={modo}
          ot={otSeleccionada}
          onClose={() => setCompartirAbierto(false)}
        />
      )}
    </div>
  );
}

function RutaCard({ ruta, color, activa, onSelect }: { ruta: RutaAlternativa; color: string; activa: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "w-full text-left rounded-lg border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        (activa ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary")
      }
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-block size-3 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
        <span className="text-sm font-semibold flex-1 truncate">{ruta.resumen}</span>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> {ruta.duracionTexto}</span>
        <span className="inline-flex items-center gap-1"><RouteIcon className="size-3.5" /> {ruta.distanciaTexto}</span>
      </div>
      {ruta.warnings.length > 0 && (
        <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-start gap-1">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          <span>{ruta.warnings.join(" · ")}</span>
        </div>
      )}
    </button>
  );
}

function MapaRutas({ resultado, seleccion }: { resultado: ComputeRutasResult | null; seleccion: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polysRef = useRef<google.maps.Polyline[]>([]);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Init map once
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !ref.current) return;
        mapRef.current = new g.maps.Map(ref.current, {
          center: { lat: OFICINA_ORIGEN.lat, lng: OFICINA_ORIGEN.lng },
          zoom: 12,
          mapTypeControl: true,
          mapTypeId: g.maps.MapTypeId.ROADMAP,
          streetViewControl: false,
          fullscreenControl: true,
        });
        markersRef.current.push(
          new g.maps.Marker({
            position: { lat: OFICINA_ORIGEN.lat, lng: OFICINA_ORIGEN.lng },
            map: mapRef.current,
            title: "Oficina EA Service & Consulting",
            label: { text: "O", color: "#fff", fontWeight: "700" },
          }),
        );
      })
      .catch((e: Error) => setError(e.message));
    return () => { cancelled = true; };
  }, []);

  // Draw routes
  useEffect(() => {
    const g = window.google;
    const map = mapRef.current;
    if (!g || !map || !resultado) return;

    polysRef.current.forEach((p) => p.setMap(null));
    polysRef.current = [];
    // Drop existing destination marker (keep origin = index 0)
    markersRef.current.slice(1).forEach((m) => m.setMap(null));
    markersRef.current = markersRef.current.slice(0, 1);

    const bounds = new g.maps.LatLngBounds();
    bounds.extend({ lat: resultado.origen.lat, lng: resultado.origen.lng });
    bounds.extend({ lat: resultado.destino.lat, lng: resultado.destino.lng });

    resultado.rutas.forEach((r) => {
      const path = g.maps.geometry.encoding.decodePath(r.polyline);
      const activa = r.index === seleccion;
      const poly = new g.maps.Polyline({
        path,
        map,
        strokeColor: COLORES[r.index % COLORES.length],
        strokeOpacity: activa ? 0.95 : 0.45,
        strokeWeight: activa ? 6 : 4,
        zIndex: activa ? 10 : 1,
      });
      polysRef.current.push(poly);
    });

    markersRef.current.push(
      new g.maps.Marker({
        position: { lat: resultado.destino.lat, lng: resultado.destino.lng },
        map,
        title: resultado.destino.label,
        label: { text: "D", color: "#fff", fontWeight: "700" },
      }),
    );

    map.fitBounds(bounds, 64);
  }, [resultado, seleccion]);

  if (error) {
    return (
      <div className="h-full grid place-items-center text-sm text-destructive p-4 text-center">
        {error}
      </div>
    );
  }

  return <div ref={ref} className="w-full h-full" aria-label="Mapa de rutas" />;
}

const MODO_LABEL: Record<string, string> = {
  DRIVE: "Vehículo",
  TWO_WHEELER: "Motocicleta",
  BICYCLE: "Bicicleta",
  WALK: "Caminando",
};

const GMAPS_MODE: Record<string, string> = {
  DRIVE: "driving",
  TWO_WHEELER: "driving",
  BICYCLE: "bicycling",
  WALK: "walking",
};

function CompartirRuta({
  resultado,
  rutaActiva,
  modo,
  ot,
  onClose,
}: {
  resultado: ComputeRutasResult;
  rutaActiva: RutaAlternativa;
  modo: "DRIVE" | "TWO_WHEELER" | "WALK" | "BICYCLE";
  ot: DestinoOT | null;
  onClose: () => void;
}) {
  const fnRecips = useServerFn(listRecipientesRuta);
  const recipsQuery = useQuery({
    queryKey: ["rutas", "recipientes", ot?.trabajoId ?? null],
    queryFn: () => fnRecips({ data: { trabajoId: ot?.trabajoId } }),
  });
  const [sel, setSel] = useState<Set<string>>(new Set());

  // Pre-seleccionar todos al cargar
  useEffect(() => {
    if (recipsQuery.data) setSel(new Set(recipsQuery.data.map((r) => r.userId)));
  }, [recipsQuery.data]);

  const gmapsUrl = useMemo(() => {
    const o = `${resultado.origen.lat},${resultado.origen.lng}`;
    const d = `${resultado.destino.lat},${resultado.destino.lng}`;
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}&travelmode=${GMAPS_MODE[modo]}`;
  }, [resultado, modo]);

  const mensaje = useMemo(() => {
    const lines: string[] = [];
    lines.push("📍 Ruta EA Service Connect");
    if (ot) {
      lines.push(`OT ${ot.folio} — ${ot.servicio}`);
      lines.push(`Cliente: ${ot.clienteNombre}`);
      lines.push(`Planta: ${ot.plantaNombre}`);
      if (ot.tecnicoNombre) lines.push(`Técnico asignado: ${ot.tecnicoNombre}`);
    }
    lines.push("");
    lines.push(`Origen: ${resultado.origen.label}`);
    lines.push(`Destino: ${resultado.destino.label}`);
    lines.push(`Modo: ${MODO_LABEL[modo]}`);
    lines.push(`Ruta: ${rutaActiva.resumen}`);
    lines.push(`Tiempo estimado: ${rutaActiva.duracionTexto}`);
    lines.push(`Distancia: ${rutaActiva.distanciaTexto}`);
    lines.push("");
    lines.push(`Abrir en Google Maps: ${gmapsUrl}`);
    return lines.join("\n");
  }, [resultado, rutaActiva, modo, ot, gmapsUrl]);

  const seleccionados = (recipsQuery.data ?? []).filter((r) => sel.has(r.userId));
  const emails = seleccionados.map((r) => r.email).filter(Boolean) as string[];

  const mailto = `mailto:${emails.join(",")}?subject=${encodeURIComponent(
    `Ruta${ot ? ` OT ${ot.folio}` : ""} — ${resultado.destino.label}`,
  )}&body=${encodeURIComponent(mensaje)}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      toast.success("Mensaje copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compartir-title"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 id="compartir-title" className="text-lg font-semibold inline-flex items-center gap-2">
            <Share2 className="size-4" /> Compartir ruta
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 rounded-md hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Destinatarios
            </h3>
            {recipsQuery.isLoading && (
              <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" /> Cargando contactos…
              </div>
            )}
            {recipsQuery.error && (
              <div className="text-xs text-destructive">{(recipsQuery.error as Error).message}</div>
            )}
            {recipsQuery.data && recipsQuery.data.length === 0 && (
              <div className="text-xs text-muted-foreground">
                No hay contactos disponibles.
              </div>
            )}
            <ul className="space-y-1.5">
              {recipsQuery.data?.map((r: RecipienteRuta) => (
                <li key={r.userId} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    id={`r-${r.userId}`}
                    checked={sel.has(r.userId)}
                    onChange={() => toggle(r.userId)}
                    className="size-4"
                  />
                  <label htmlFor={`r-${r.userId}`} className="flex-1 cursor-pointer">
                    <span className="font-medium">{r.nombre}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wide bg-secondary border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                      {r.rol === "admin" ? "Admin" : r.rol === "supervisor" ? "Supervisor" : "Técnico"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {r.email ?? "Sin correo"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Mensaje
            </h3>
            <textarea
              readOnly
              value={mensaje}
              rows={10}
              className="w-full bg-background border border-border rounded-md p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </section>

          <section className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copiar}
              className="inline-flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2 text-sm hover:bg-secondary/70"
            >
              <Copy className="size-4" /> Copiar mensaje
            </button>
            <a
              href={mailto}
              className={
                "inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm hover:bg-primary/90 " +
                (emails.length === 0 ? "pointer-events-none opacity-50" : "")
              }
            >
              <Mail className="size-4" /> Enviar correo ({emails.length})
            </a>
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-600 text-white rounded-md px-3 py-2 text-sm hover:bg-emerald-700"
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2 text-sm hover:bg-secondary/70 ml-auto"
            >
              <MapPin className="size-4" /> Abrir en Google Maps
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}