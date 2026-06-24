import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Devuelve el perfil del usuario autenticado (campos para el flujo de completar perfil). */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, display_name, nombres, apellidos, cargo, perfil_completado, debe_cambiar_password")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

/** Guarda nombres, apellidos y cargo, y marca perfil_completado=true. */
export const completarMiPerfil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        nombres: z.string().min(2, "Ingresa tus nombres"),
        apellidos: z.string().min(2, "Ingresa tus apellidos"),
        cargo: z.string().min(2, "Ingresa tu cargo"),
        password_actualizada: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const display_name = `${data.nombres} ${data.apellidos}`.trim();
    const update: Record<string, unknown> = {
      nombres: data.nombres,
      apellidos: data.apellidos,
      cargo: data.cargo,
      display_name,
      perfil_completado: true,
    };
    if (data.password_actualizada) update.debe_cambiar_password = false;
    const { error } = await context.supabase
      .from("profiles")
      .update(update)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Devuelve el nombre completo y cargo de un usuario para firma ejecutiva en reportes. */
export const getFirmaEjecutiva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const uid = data.userId ?? context.userId;
    const { data: p } = await context.supabase
      .from("profiles")
      .select("display_name, nombres, apellidos, cargo")
      .eq("id", uid)
      .maybeSingle();
    const nombre = p?.nombres && p?.apellidos
      ? `${p.nombres} ${p.apellidos}`.trim()
      : p?.display_name ?? "Equipo EA Service and Consulting";
    return { nombre, cargo: p?.cargo ?? "Responsable Operativo" };
  });