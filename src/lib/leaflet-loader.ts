/**
 * Servicio de mapa alternativo (Leaflet + teselas satelitales Esri).
 * No requiere WebGL: funciona por imágenes, ideal cuando Mapbox falla.
 */
import type * as L from "leaflet";

export type LeafletNS = typeof L;

let promesa: Promise<LeafletNS> | null = null;

export const TILES_SATELITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const ATRIBUCION_SATELITE = "Imágenes © Esri, Maxar, Earthstar Geographics";

export function cargarLeaflet(): Promise<LeafletNS> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (promesa) return promesa;
  promesa = (async () => {
    await import("leaflet/dist/leaflet.css");
    const mod = await import("leaflet");
    return ((mod as any).default ?? mod) as LeafletNS;
  })();
  promesa.catch(() => { promesa = null; });
  return promesa;
}
