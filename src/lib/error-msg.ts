/**
 * Extrae un mensaje legible de cualquier error, incluyendo respuestas HTTP
 * lanzadas por server functions (que no tienen `message`).
 */
export async function mensajeDeError(e: unknown): Promise<string> {
  if (!e) return "Error desconocido";
  if (typeof e === "string") return e;
  if (typeof Response !== "undefined" && e instanceof Response) {
    let cuerpo = "";
    try {
      cuerpo = await e.clone().text();
    } catch {
      /* noop */
    }
    try {
      const j = JSON.parse(cuerpo);
      if (j?.error) return String(j.error);
      if (j?.message) return String(j.message);
    } catch {
      /* no era JSON */
    }
    if (e.status === 401) return "Sesión expirada. Cierra y vuelve a iniciar sesión.";
    if (e.status === 413) return "La foto es demasiado grande.";
    return `Error del servidor (${e.status}${e.statusText ? ` ${e.statusText}` : ""})`;
  }
  const anyE = e as any;
  if (anyE?.message) return String(anyE.message);
  if (anyE?.error) return String(anyE.error);
  if (anyE?.status) return `Error del servidor (${anyE.status})`;
  try {
    return JSON.stringify(anyE);
  } catch {
    return "Error desconocido";
  }
}