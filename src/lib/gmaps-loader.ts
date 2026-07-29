/** Carga única de Google Maps JS con las librerías de dibujo/geometría. */
declare global {
  interface Window {
    __eaGmapsInit?: () => void;
  }
}

let promesa: Promise<any> | null = null;

export function cargarGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const g = () => (window as any).google;
  if (g()?.maps) return Promise.resolve(g());
  if (promesa) return promesa;

  promesa = new Promise((resolve, reject) => {
    const existente = document.getElementById("gmaps-js") as HTMLScriptElement | null;
    if (existente) {
      const timer = setInterval(() => {
        if (g()?.maps) { clearInterval(timer); resolve(g()); }
      }, 100);
      setTimeout(() => { clearInterval(timer); reject(new Error("Tiempo de espera agotado")); }, 15000);
      return;
    }
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!key) { reject(new Error("Falta la clave de Google Maps")); return; }
    window.__eaGmapsInit = () => resolve(g());
    const s = document.createElement("script");
    s.id = "gmaps-js";
    s.async = true;
    s.defer = true;
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async` +
      `&libraries=drawing,geometry&callback=__eaGmapsInit${channel ? `&channel=${channel}` : ""}`;
    s.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.body.appendChild(s);
  });
  return promesa;
}

export function centroDe(pts: { lat: number; lng: number }[]) {
  const n = pts.length || 1;
  return {
    lat: pts.reduce((a, p) => a + Number(p.lat), 0) / n,
    lng: pts.reduce((a, p) => a + Number(p.lng), 0) / n,
  };
}
