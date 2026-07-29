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
