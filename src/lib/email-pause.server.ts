// Consulta el flag global "pausar correos automáticos" con caché breve para
// evitar golpear system_config en cada envío. Cuando está activo, TODOS los
// correos operativos se omiten; solo los marcados como bypass (seguridad y
// administración de usuarios) se siguen enviando.

export const EMAIL_PAUSE_KEY = "notify_report_upload_email_paused";
export const EMAIL_CATEGORIES_KEY = "email_notif_categorias";

let cached: { value: boolean; expiresAt: number } | null = null;
const TTL_MS = 15_000;

export async function isEmailsPaused(): Promise<boolean> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("system_config")
      .select("value")
      .eq("key", EMAIL_PAUSE_KEY)
      .maybeSingle();
    const paused = Boolean((data?.value as any)?.paused);
    cached = { value: paused, expiresAt: now + TTL_MS };
    return paused;
  } catch (e) {
    console.warn("[email-pause] fallo al leer flag, asumiendo activo", e);
    return false;
  }
}

export function invalidateEmailsPausedCache() {
  cached = null;
}

/** Categorías de correo automático que se pueden activar/desactivar. */
export type EmailCategoria =
  | "trabajos_eventos"
  | "asignacion_tecnico"
  | "jornadas"
  | "staff_interno"
  | "solicitudes_visita"
  | "contratos"
  | "rutas"
  | "avisos_programacion";

let catsCache: { value: Record<string, boolean>; expiresAt: number } | null = null;

export async function getEmailCategoriasConfig(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (catsCache && catsCache.expiresAt > now) return catsCache.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("system_config")
      .select("value")
      .eq("key", EMAIL_CATEGORIES_KEY)
      .maybeSingle();
    const value = ((data?.value as Record<string, boolean> | null) ?? {}) as Record<string, boolean>;
    catsCache = { value, expiresAt: now + TTL_MS };
    return value;
  } catch (e) {
    console.warn("[email-cats] fallo al leer configuración, asumiendo todo activo", e);
    return {};
  }
}

/** `true` si la categoría está habilitada (por omisión, todas lo están). */
export async function isEmailCategoriaEnabled(cat: EmailCategoria): Promise<boolean> {
  const cfg = await getEmailCategoriasConfig();
  return cfg[cat] !== false;
}

export function invalidateEmailCategoriasCache() {
  catsCache = null;
}