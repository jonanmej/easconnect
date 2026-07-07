// Consulta el flag global "pausar correos automáticos" con caché breve para
// evitar golpear system_config en cada envío. Cuando está activo, TODOS los
// correos operativos se omiten; solo los marcados como bypass (seguridad y
// administración de usuarios) se siguen enviando.

export const EMAIL_PAUSE_KEY = "notify_report_upload_email_paused";

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