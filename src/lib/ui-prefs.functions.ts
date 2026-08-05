import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Preferencias de interfaz (vista y filtros) del usuario autenticado. */
export const getUiPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("ui_prefs")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return ((data?.ui_prefs as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  });

/** Fusiona (merge) las claves recibidas en las preferencias del usuario. */
export const setUiPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ prefs: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: actual } = await context.supabase
      .from("profiles")
      .select("ui_prefs")
      .eq("id", context.userId)
      .maybeSingle();
    const merged = {
      ...(((actual?.ui_prefs as Record<string, unknown> | null) ?? {}) as Record<string, unknown>),
      ...data.prefs,
    };
    const { error } = await context.supabase
      .from("profiles")
      .update({ ui_prefs: merged })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
