import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

/** Oficina EA Service & Consulting — punto de salida fijo. */
export const OFICINA_ORIGEN = {
  label: "Boulevard Venezuela #2731, Colonia Luz, San Salvador",
  lat: 13.691649,
  lng: -89.217841,
} as const;

export type RutaAlternativa = {
  index: number;
  resumen: string;
  distanciaMetros: number;
  distanciaTexto: string;
  duracionSegundos: number;
  duracionTexto: string;
  polyline: string;
  warnings: string[];
};

export type ComputeRutasResult = {
  origen: { lat: number; lng: number; label: string };
  destino: { lat: number; lng: number; label: string };
  rutas: RutaAlternativa[];
};

function fmtDistancia(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtDuracion(s: number): string {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

function requireKeys() {
  const lovable = process.env.LOVABLE_API_KEY;
  const gmaps = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovable || !gmaps) {
    throw new Error("Credenciales de Google Maps no disponibles en el servidor");
  }
  return { lovable, gmaps };
}

const inputSchema = z
  .object({
    destinoTexto: z.string().trim().min(3).max(300).optional(),
    destinoLat: z.number().gte(-90).lte(90).optional(),
    destinoLng: z.number().gte(-180).lte(180).optional(),
    modo: z.enum(["DRIVE", "TWO_WHEELER", "WALK", "BICYCLE"]).default("DRIVE"),
  })
  .refine(
    (v) => Boolean(v.destinoTexto) || (typeof v.destinoLat === "number" && typeof v.destinoLng === "number"),
    { message: "Indica una dirección o coordenadas de destino" },
  );

export const computeRutas = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ComputeRutasResult> => {
    const { lovable, gmaps } = requireKeys();

    // 1) Resolver destino (geocoding si vino como texto)
    let destLat = data.destinoLat;
    let destLng = data.destinoLng;
    let destLabel = data.destinoTexto ?? "";

    if (typeof destLat !== "number" || typeof destLng !== "number") {
      const geoResp = await fetch(
        `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(
          data.destinoTexto ?? "",
        )}&region=sv&language=es`,
        {
          headers: {
            Authorization: `Bearer ${lovable}`,
            "X-Connection-Api-Key": gmaps,
          },
        },
      );
      if (!geoResp.ok) {
        const text = await geoResp.text();
        throw new Error(`Geocoding falló (${geoResp.status}): ${text.slice(0, 200)}`);
      }
      const geo = (await geoResp.json()) as {
        status: string;
        results: Array<{
          formatted_address: string;
          geometry: { location: { lat: number; lng: number } };
        }>;
      };
      if (geo.status !== "OK" || !geo.results.length) {
        throw new Error("No se encontró la dirección de destino");
      }
      const top = geo.results[0];
      destLat = top.geometry.location.lat;
      destLng = top.geometry.location.lng;
      destLabel = top.formatted_address;
    }

    // 2) Routes API — pedir rutas alternativas
    const routesResp = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovable}`,
        "X-Connection-Api-Key": gmaps,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.description,routes.warnings,routes.routeLabels",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: OFICINA_ORIGEN.lat, longitude: OFICINA_ORIGEN.lng } } },
        destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
        travelMode: data.modo,
        routingPreference: data.modo === "DRIVE" ? "TRAFFIC_AWARE" : undefined,
        computeAlternativeRoutes: true,
        languageCode: "es-SV",
        units: "METRIC",
      }),
    });

    if (!routesResp.ok) {
      const text = await routesResp.text();
      throw new Error(`Routes API falló (${routesResp.status}): ${text.slice(0, 300)}`);
    }

    const payload = (await routesResp.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
        description?: string;
        warnings?: string[];
        routeLabels?: string[];
      }>;
    };

    const rutas: RutaAlternativa[] = (payload.routes ?? [])
      .filter((r) => r.polyline?.encodedPolyline)
      .map((r, i) => {
        const secs = r.duration ? parseInt(String(r.duration).replace("s", ""), 10) || 0 : 0;
        const meters = r.distanceMeters ?? 0;
        const labels = r.routeLabels ?? [];
        const isDefault = labels.includes("DEFAULT_ROUTE");
        const resumen = r.description || (isDefault ? "Ruta recomendada" : `Alternativa ${i}`);
        return {
          index: i,
          resumen,
          distanciaMetros: meters,
          distanciaTexto: fmtDistancia(meters),
          duracionSegundos: secs,
          duracionTexto: fmtDuracion(secs),
          polyline: r.polyline!.encodedPolyline!,
          warnings: r.warnings ?? [],
        };
      });

    if (!rutas.length) {
      throw new Error("No se encontraron rutas para el destino indicado");
    }

    return {
      origen: { lat: OFICINA_ORIGEN.lat, lng: OFICINA_ORIGEN.lng, label: OFICINA_ORIGEN.label },
      destino: { lat: destLat, lng: destLng, label: destLabel },
      rutas,
    };
  });