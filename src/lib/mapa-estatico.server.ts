/**
 * Genera snapshots (data URL) del mapa satelital con las zonas de la planta
 * pintadas según su estado de avance, usando Static Maps a través del gateway.
 */
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type ZonaSnapshot = {
  poligono: { lat: number; lng: number }[];
  estado: "en_proceso" | "completada" | null;
};

function colorPorEstado(estado: ZonaSnapshot["estado"]) {
  if (estado === "completada") return { stroke: "0x16a34aff", fill: "0x22c55e66" };
  if (estado === "en_proceso") return { stroke: "0xd97706ff", fill: "0xf59e0b55" };
  return { stroke: "0x94a3b8ff", fill: "0x94a3b833" };
}

/** Reduce vértices para no exceder el largo máximo de URL de Static Maps. */
function simplificar(pts: { lat: number; lng: number }[], max = 18) {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  return pts.filter((_, i) => i % step === 0);
}

export async function snapshotZonas(zonas: ZonaSnapshot[]): Promise<string | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !mapsKey) return null;

  const validas = zonas.filter((z) => Array.isArray(z.poligono) && z.poligono.length >= 3);
  if (!validas.length) return null;

  const params = new URLSearchParams();
  params.set("size", "640x420");
  params.set("scale", "2");
  params.set("maptype", "hybrid");
  for (const z of validas) {
    const { stroke, fill } = colorPorEstado(z.estado);
    const pts = simplificar(z.poligono)
      .map((p) => `${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}`)
      .join("|");
    params.append("path", `color:${stroke}|weight:2|fillcolor:${fill}|${pts}`);
  }

  try {
    const res = await fetch(`${GATEWAY_URL}/maps/api/staticmap?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
      },
    });
    if (!res.ok) {
      console.error(`Static Maps falló [${res.status}]: ${await res.text()}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch (e) {
    console.error("Static Maps error", e);
    return null;
  }
}

/**
 * Base satelital compuesta por teselas (Esri World Imagery, sin llave).
 * Se usa cuando Static Maps de Google no está habilitada en la cuenta.
 * Devuelve las teselas con su posición en píxeles y los datos de proyección
 * para que el PDF dibuje los polígonos exactamente encima.
 */
export type BasemapZonas = {
  tiles: { src: string; x: number; y: number }[];
  w: number;
  h: number;
  z: number;
  ox: number;
  oy: number;
  tile: number;
};

const TILE = 256;
const TILE_URL = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

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
  const pts = zonas
    .filter((z) => Array.isArray(z.poligono) && z.poligono.length >= 3)
    .flatMap((z) => z.poligono)
    .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 3) return null;

  const minLat = Math.min(...pts.map((p) => p.lat));
  const maxLat = Math.max(...pts.map((p) => p.lat));
  const minLng = Math.min(...pts.map((p) => p.lng));
  const maxLng = Math.max(...pts.map((p) => p.lng));

  // Zoom máximo con el que la extensión (más 20% de margen) cabe en el lienzo.
  let z = 19;
  for (; z >= 2; z--) {
    const a = proyectar(maxLat, minLng, z);
    const b = proyectar(minLat, maxLng, z);
    if ((b.x - a.x) * 1.2 <= W && (b.y - a.y) * 1.2 <= H) break;
  }

  const c = proyectar((minLat + maxLat) / 2, (minLng + maxLng) / 2, z);
  const ox = Math.round(c.x - W / 2);
  const oy = Math.round(c.y - H / 2);

  const tx0 = Math.floor(ox / TILE);
  const ty0 = Math.floor(oy / TILE);
  const tx1 = Math.floor((ox + W) / TILE);
  const ty1 = Math.floor((oy + H) / TILE);
  const total = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
  if (total > 40) return null;

  const jobs: Promise<{ src: string; x: number; y: number } | null>[] = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      jobs.push(
        (async () => {
          try {
            const res = await fetch(TILE_URL(z, tx, ty));
            if (!res.ok) return null;
            const buf = Buffer.from(await res.arrayBuffer());
            if (!buf.length) return null;
            return {
              src: `data:image/jpeg;base64,${buf.toString("base64")}`,
              x: tx * TILE - ox,
              y: ty * TILE - oy,
            };
          } catch {
            return null;
          }
        })(),
      );
    }
  }
  const tiles = (await Promise.all(jobs)).filter(Boolean) as BasemapZonas["tiles"];
  if (!tiles.length) return null;
  return { tiles, w: W, h: H, z, ox, oy, tile: TILE };
}
