/**
 * Carga única de Mapbox GL JS (solo navegador).
 * El token público viene del conector de Mapbox.
 */
import type mapboxgl from "mapbox-gl";

export type MapboxNS = typeof mapboxgl;

let promesa: Promise<MapboxNS> | null = null;

/** Detecta si el dispositivo/navegador puede crear un contexto WebGL. */
export function soportaWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      (canvas.getContext as any).call(canvas, "experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}

export const MSG_SIN_WEBGL =
  "Tu navegador no pudo activar la aceleración gráfica (WebGL), necesaria para el mapa. " +
  "En iPhone/iPad: Ajustes → Safari → Avanzado → activa WebGL / desactiva el Modo de bajo consumo, " +
  "cierra pestañas abiertas y recarga. También puedes seguir trabajando con la lista de zonas.";

/** Estilo satelital con etiquetas de calles (equivalente al "hybrid"). */
export const ESTILO_SATELITE = "mapbox://styles/mapbox/satellite-streets-v12";
export const ESTILO_SATELITE_PURO = "mapbox://styles/mapbox/satellite-v9";
export const ESTILO_CALLES = "mapbox://styles/mapbox/streets-v12";

export function cargarMapbox(): Promise<MapboxNS> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (promesa) return promesa;
  const token = import.meta.env.VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN as string | undefined;
  if (!token) return Promise.reject(new Error("Falta el token público de Mapbox"));
  if (!soportaWebGL()) return Promise.reject(new Error(MSG_SIN_WEBGL));

  promesa = (async () => {
    await import("mapbox-gl/dist/mapbox-gl.css");
    const mod = await import("mapbox-gl");
    const mb = (mod.default ?? mod) as MapboxNS;
    mb.accessToken = token;
    return mb;
  })();
  return promesa;
}

export function centroDe(pts: { lat: number; lng: number }[]) {
  const n = pts.length || 1;
  return {
    lat: pts.reduce((a, p) => a + Number(p.lat), 0) / n,
    lng: pts.reduce((a, p) => a + Number(p.lng), 0) / n,
  };
}

/** Ajusta el mapa a un conjunto de puntos. */
export function ajustarA(
  mb: MapboxNS,
  map: any,
  pts: { lat: number; lng: number }[],
  padding = 40,
  maxZoom = 19,
) {
  const validos = pts.filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  if (!validos.length) return;
  if (validos.length === 1) {
    map.jumpTo({ center: [Number(validos[0].lng), Number(validos[0].lat)], zoom: 17 });
    return;
  }
  const b = new mb.LngLatBounds(
    [Number(validos[0].lng), Number(validos[0].lat)],
    [Number(validos[0].lng), Number(validos[0].lat)],
  );
  validos.forEach((p) => b.extend([Number(p.lng), Number(p.lat)]));
  map.fitBounds(b, { padding, maxZoom, duration: 0 });
}
