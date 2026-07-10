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