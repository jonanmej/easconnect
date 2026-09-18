import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LIMITE_ALMUERZO_MIN = 60;

function fechaHoySV(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
}

function minutosEntre(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

export function calcularResumen(j: {
  hora_inicio?: string | null;
  hora_fin?: string | null;
  almuerzo_inicio?: string | null;
  almuerzo_fin?: string | null;
}) {
  const totalMin = minutosEntre(j.hora_inicio, j.hora_fin);
  const almMin = minutosEntre(j.almuerzo_inicio, j.almuerzo_fin);
  const efectivosMin = Math.max(0, totalMin - almMin);
  return {
    totalMin,
    almMin,
    efectivosMin,
    horasEfectivas: Math.round((efectivosMin / 60) * 100) / 100,
    almuerzoExcedido: almMin > LIMITE_ALMUERZO_MIN,
  };
}

/** Estado actual de la jornada del técnico hoy. */
export const getJornadaHoy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const fecha = fechaHoySV();
    const { data, error } = await context.supabase
      .from("jornadas_laborales")
      .select("*")
      .eq("tecnico_id", context.userId)
      .eq("fecha", fecha)
      .order("hora_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const iniciarJornada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const fecha = fechaHoySV();
    // Cerrar cualquier abierta previa del mismo día seguridad
    const { data: abierta } = await context.supabase
      .from("jornadas_laborales")
      .select("id")
      .eq("tecnico_id", context.userId)
      .eq("fecha", fecha)
      .is("hora_fin", null)
      .maybeSingle();
    if (abierta?.id) {
      throw new Error("Ya tienes una jornada abierta hoy.");
    }
    const { data, error } = await context.supabase
      .from("jornadas_laborales")
      .insert({ tecnico_id: context.userId, fecha, hora_inicio: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    try {
      const { notificarJornadaEvento } = await import("@/lib/jornadas.server");
      await notificarJornadaEvento({
        tipo: "jornada_iniciada",
        jornada: data,
        tecnicoId: context.userId,
      });
    } catch (e) { console.warn("[jornada] email inicio", e); }
    return data;
  });

export const iniciarAlmuerzo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const fecha = fechaHoySV();
    const { data: j } = await context.supabase
      .from("jornadas_laborales")
      .select("*")
      .eq("tecnico_id", context.userId)
      .eq("fecha", fecha)
      .is("hora_fin", null)
      .maybeSingle();
    if (!j) throw new Error("No hay jornada abierta.");
    if (j.almuerzo_inicio) throw new Error("El almuerzo ya fue iniciado.");
    const { data, error } = await context.supabase
      .from("jornadas_laborales")
      .update({ almuerzo_inicio: new Date().toISOString() })
      .eq("id", j.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const finalizarAlmuerzo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const fecha = fechaHoySV();
    const { data: j } = await context.supabase
      .from("jornadas_laborales")
      .select("*")
      .eq("tecnico_id", context.userId)
      .eq("fecha", fecha)
      .is("hora_fin", null)
      .maybeSingle();
    if (!j) throw new Error("No hay jornada abierta.");
    if (!j.almuerzo_inicio) throw new Error("Aún no has iniciado el almuerzo.");
    if (j.almuerzo_fin) throw new Error("El almuerzo ya fue finalizado.");
    const almFin = new Date().toISOString();
    const resumen = calcularResumen({ ...j, almuerzo_fin: almFin });
    const { data, error } = await context.supabase
      .from("jornadas_laborales")
      .update({ almuerzo_fin: almFin, almuerzo_excedido: resumen.almuerzoExcedido })
      .eq("id", j.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (resumen.almuerzoExcedido) {
      try {
        const { notificarJornadaEvento } = await import("@/lib/jornadas.server");
        await notificarJornadaEvento({
          tipo: "almuerzo_excedido",
          jornada: data,
          tecnicoId: context.userId,
          extra: { minutos: resumen.almMin },
        });
      } catch (e) { console.warn("[jornada] email almuerzo excedido", e); }
    }
    return data;
  });

export const finalizarJornada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ notas: z.string().max(2000).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const fecha = fechaHoySV();
    const { data: j } = await context.supabase
      .from("jornadas_laborales")
      .select("*")
      .eq("tecnico_id", context.userId)
      .eq("fecha", fecha)
      .is("hora_fin", null)
      .maybeSingle();
    if (!j) throw new Error("No hay jornada abierta.");
    // Si tiene almuerzo abierto sin cerrar, cerrarlo ahora
    const almFin = j.almuerzo_inicio && !j.almuerzo_fin ? new Date().toISOString() : j.almuerzo_fin;
    const horaFin = new Date().toISOString();
    const resumen = calcularResumen({ ...j, almuerzo_fin: almFin, hora_fin: horaFin });
    const { data: cerrada, error } = await context.supabase
      .from("jornadas_laborales")
      .update({
        hora_fin: horaFin,
        almuerzo_fin: almFin,
        almuerzo_excedido: resumen.almuerzoExcedido,
        notas: data.notas ?? j.notas,
      })
      .eq("id", j.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    try {
      const { notificarJornadaEvento } = await import("@/lib/jornadas.server");
      await notificarJornadaEvento({
        tipo: "jornada_finalizada",
        jornada: cerrada,
        tecnicoId: context.userId,
        extra: {
          totalMin: resumen.totalMin,
          almMin: resumen.almMin,
          efectivosMin: resumen.efectivosMin,
          horasEfectivas: resumen.horasEfectivas,
        },
      });
    } catch (e) { console.warn("[jornada] email fin", e); }
    return cerrada;
  });
/* ─────────── Módulo de control de marcaciones (registro histórico) ─────────── */

const ZRango = z.object({
  desde: z.string().min(8),
  hasta: z.string().min(8),
  tecnico_id: z.string().uuid().optional(),
});

/**
 * Listado de marcaciones en un rango de fechas. RLS decide el alcance:
 * admin/supervisor ven a todo el personal, cada técnico ve solo lo propio.
 */
export const listJornadas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ZRango.parse(d))
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("jornadas_laborales")
      .select("*")
      .gte("fecha", data.desde)
      .lte("fecha", data.hasta)
      .order("fecha", { ascending: false })
      .order("hora_inicio", { ascending: false });
    if (data.tecnico_id) q = q.eq("tecnico_id", data.tecnico_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.tecnico_id)));
    let perfiles = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, display_name, cargo").in("id", ids);
      perfiles = new Map((profs ?? []).map((p: any) => [p.id, p.display_name ?? "—"]));
    }
    return (rows ?? []).map((r: any) => {
      const resumen = calcularResumen(r);
      return {
        ...r,
        tecnico_nombre: perfiles.get(r.tecnico_id) ?? "Colaborador",
        total_min: resumen.totalMin,
        almuerzo_min: resumen.almMin,
        horas_efectivas: resumen.horasEfectivas,
      };
    });
  });

/** Personal con marcaciones registradas (para el filtro del módulo). */
export const listPersonalJornadas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("jornadas_laborales")
      .select("tecnico_id")
      .order("fecha", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.tecnico_id)));
    if (!ids.length) return [];
    const { data: profs } = await context.supabase
      .from("profiles").select("id, display_name").in("id", ids);
    return (profs ?? [])
      .map((p: any) => ({ id: p.id as string, nombre: (p.display_name as string) ?? "Colaborador" }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  });

async function requireStaff(context: any) {
  const [{ data: esAdmin }, { data: esSup }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" }),
  ]);
  if (!esAdmin && !esSup) throw new Error("Solo administradores y supervisores pueden hacer este ajuste.");
}

/** Corrección manual de una marcación (solo admin/supervisor). */
export const ajustarJornada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      hora_inicio: z.string().min(4),
      hora_fin: z.string().min(4).nullable().optional(),
      almuerzo_inicio: z.string().min(4).nullable().optional(),
      almuerzo_fin: z.string().min(4).nullable().optional(),
      notas: z.string().max(2000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const resumen = calcularResumen(data);
    const { data: row, error } = await context.supabase
      .from("jornadas_laborales")
      .update({
        hora_inicio: data.hora_inicio,
        hora_fin: data.hora_fin ?? null,
        almuerzo_inicio: data.almuerzo_inicio ?? null,
        almuerzo_fin: data.almuerzo_fin ?? null,
        almuerzo_excedido: resumen.almuerzoExcedido,
        notas: data.notas ?? null,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Elimina una marcación (solo admin/supervisor). */
export const eliminarJornada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const { error } = await context.supabase
      .from("jornadas_laborales").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Crea una marcación manualmente a nombre de un colaborador (solo admin/supervisor).
 * Sirve para los casos en que alguien olvidó marcar su entrada o salida.
 */
export const crearJornadaManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tecnico_id: z.string().uuid(),
      fecha: z.string().min(8),
      hora_inicio: z.string().min(4),
      hora_fin: z.string().min(4).nullable().optional(),
      almuerzo_inicio: z.string().min(4).nullable().optional(),
      almuerzo_fin: z.string().min(4).nullable().optional(),
      notas: z.string().max(2000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const { data: existente } = await context.supabase
      .from("jornadas_laborales")
      .select("id")
      .eq("tecnico_id", data.tecnico_id)
      .eq("fecha", data.fecha)
      .maybeSingle();
    if (existente?.id) {
      throw new Error("Ese colaborador ya tiene una marcación registrada en esa fecha. Corrígela en lugar de crear otra.");
    }
    const resumen = calcularResumen(data);
    const { data: row, error } = await context.supabase
      .from("jornadas_laborales")
      .insert({
        tecnico_id: data.tecnico_id,
        fecha: data.fecha,
        hora_inicio: data.hora_inicio,
        hora_fin: data.hora_fin ?? null,
        almuerzo_inicio: data.almuerzo_inicio ?? null,
        almuerzo_fin: data.almuerzo_fin ?? null,
        almuerzo_excedido: resumen.almuerzoExcedido,
        notas: data.notas ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
