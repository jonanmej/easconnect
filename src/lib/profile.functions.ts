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
    const update = {
      nombres: data.nombres,
      apellidos: data.apellidos,
      cargo: data.cargo,
      display_name,
      perfil_completado: true,
      ...(data.password_actualizada ? { debe_cambiar_password: false } : {}),
    };
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

/** Preferencias del formulario "Reporte ejecutivo" persistidas por usuario. */
const ZReportesPeriodoPref = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  periodo: z.string().max(120).nullable().optional(),
  manual: z.boolean().optional().default(false),
});

export const getReportesPeriodoPref = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("reportes_periodo_pref")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.reportes_periodo_pref as z.infer<typeof ZReportesPeriodoPref> | null) ?? null;
  });

export const setReportesPeriodoPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ZReportesPeriodoPref.parse(d))
  .handler(async ({ context, data }) => {
    if (data.desde && data.hasta && data.desde > data.hasta) {
      throw new Error('La fecha "Desde" no puede ser posterior a "Hasta".');
    }
    const { error } = await context.supabase
      .from("profiles")
      .update({ reportes_periodo_pref: data })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });