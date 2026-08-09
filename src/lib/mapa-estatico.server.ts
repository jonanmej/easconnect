/**
 * Snapshots del mapa satelital (Mapbox Static Images API vía el gateway)
 * con las zonas de la planta pintadas según su estado de avance.
 */
const GATEWAY_URL = "https://connector-gateway.lovable.dev/mapbox";
const ESTILO = "satellite-streets-v12";

export type ZonaSnapshot = {
  poligono: { lat: number; lng: number }[];
  estado: "en_proceso" | "completada" | null;
};

function colorPorEstado(estado: ZonaSnapshot["estado"]) {
  if (estado === "completada") return { stroke: "16a34a", fill: "22c55e", opacity: 0.45 };
  if (estado === "en_proceso") return { stroke: "d97706", fill: "f59e0b", opacity: 0.4 };
  return { stroke: "94a3b8", fill: "94a3b8", opacity: 0.2 };
}

/** Reduce vértices para no exceder el largo máximo de URL. */
function simplificar(pts: { lat: number; lng: number }[], max = 24) {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  return pts.filter((_, i) => i % step === 0);
}

function claves() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const mapboxKey = process.env.MAPBOX_API_KEY;
  if (!lovableKey || !mapboxKey) return null;
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": mapboxKey,
  };
}

function validas(zonas: ZonaSnapshot[]) {
  return zonas.filter((z) => Array.isArray(z.poligono) && z.poligono.length >= 3);
}

function geojsonZonas(zonas: ZonaSnapshot[]) {
  return {
    type: "FeatureCollection",
    features: validas(zonas).map((z) => {
      const { stroke, fill, opacity } = colorPorEstado(z.estado);
      const ring = simplificar(z.poligono).map((p) => [
        Number(Number(p.lng).toFixed(5)),
        Number(Number(p.lat).toFixed(5)),
      ]);
      ring.push(ring[0]);
      return {
        type: "Feature",
        properties: {
          stroke: `#${stroke}`,
          "stroke-width": 2,
          fill: `#${fill}`,
          "fill-opacity": opacity,
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      };
    }),
  };
}

/** Imagen satelital (data URL) con los polígonos ya dibujados por Mapbox. */
export async function snapshotZonas(zonas: ZonaSnapshot[]): Promise<string | null> {
  const headers = claves();
  if (!headers) return null;
  const zs = validas(zonas);
  if (!zs.length) return null;

  const overlay = encodeURIComponent(JSON.stringify(geojsonZonas(zs)));
  const url =
    `${GATEWAY_URL}/styles/v1/mapbox/${ESTILO}/static/geojson(${overlay})/auto/1000x420@2x` +
    `?padding=30&attribution=false&logo=false`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`Mapbox Static falló [${res.status}]: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch (e) {
    console.error("Mapbox Static error", e);
    return null;
  }
}

/**
 * Base satelital para que el PDF dibuje los polígonos vectoriales encima.
 * Devuelve la imagen y los datos de proyección Web Mercator usados.
 */
export type BasemapZonas = {
  tiles: { src: string; x: number; y: number; w?: number; h?: number }[];
  w: number;
  h: number;
  z: number;
  ox: number;
  oy: number;
  tile: number;
};

const TILE = 256;

function proyectar(lat: number, lng: number, z: number) {
  const n = TILE * Math.pow(2, z);
  const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

export async function basemapZonas(
  zonas: ZonaSnapshot[],
  W = 1000,
  H = 420,
): Promise<BasemapZonas | null> {
  const headers = claves();
  if (!headers) return null;

  const pts = validas(zonas)
    .flatMap((z) => z.poligono)
    .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 3) return null;

  const minLat = Math.min(...pts.map((p) => p.lat));
  const maxLat = Math.max(...pts.map((p) => p.lat));
  const minLng = Math.min(...pts.map((p) => p.lng));
  const maxLng = Math.max(...pts.map((p) => p.lng));

  // Zoom (fraccional) máximo con el que la extensión más 20% de margen cabe.
  let z = 19;
  for (; z >= 2; z -= 0.25) {
    const a = proyectar(maxLat, minLng, z);
    const b = proyectar(minLat, maxLng, z);
    if ((b.x - a.x) * 1.2 <= W && (b.y - a.y) * 1.2 <= H) break;
  }
  z = Math.max(1, Math.min(19, z));

  const centro = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const c = proyectar(centro.lat, centro.lng, z);
  const ox = c.x - W / 2;
  const oy = c.y - H / 2;

  const url =
    `${GATEWAY_URL}/styles/v1/mapbox/${ESTILO}/static/` +
    `${centro.lng.toFixed(6)},${centro.lat.toFixed(6)},${z.toFixed(2)},0/` +
    `${Math.round(W)}x${Math.round(H)}@2x?attribution=false&logo=false`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`Mapbox Static (base) falló [${res.status}]: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return {
      tiles: [{ src: `data:image/png;base64,${buf.toString("base64")}`, x: 0, y: 0, w: W, h: H }],
      w: W,
      h: H,
      z,
      ox,
      oy,
      tile: TILE,
    };
  } catch (e) {
    console.error("Mapbox Static (base) error", e);
    return null;
  }
}
