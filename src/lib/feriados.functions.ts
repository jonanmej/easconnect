import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findCleaningClientConflicts } from "@/lib/scheduling";

/**
 * Reubica automáticamente los trabajos programados en `fechaISO` hacia el
 * siguiente día hábil disponible (saltando fines de semana, feriados y
 * conflictos por cliente/servicio o técnico). Solo mueve la OT afectada —
 * no toca otras programaciones de la misma planta que caigan en días
 * distintos.
 *
 * Devuelve el detalle de cada reubicación para poder informar al usuario.
 */
async function reubicarTrabajosDeFecha(
  supabase: any,
  fechaISO: string,
): Promise<Array<{ id: string; folio: string; fecha_anterior: string; fecha_nueva: string }>> {
  // Rango del día en zona SV (UTC-6): 06:00Z–29:59Z aproximado.
  const dia = new Date(fechaISO);
  dia.setUTCHours(0, 0, 0, 0);
  const desde = new Date(dia); desde.setUTCHours(0, 0, 0, 0);
  const hasta = new Date(dia); hasta.setUTCHours(23, 59, 59, 999);
  // Traer todas las OT programadas ese día que aún estén activas.
  const { data: pend } = await supabase
    .from("trabajos")
    .select("id, folio, tecnico_id, duracion_dias, planta_id, servicio, fecha_programada, estado")
    .gte("fecha_programada", desde.toISOString())
    .lte("fecha_programada", hasta.toISOString())
    .not("estado", "in", "(completado,cancelado)");
  const afectados = (pend ?? []) as Array<any>;
  if (afectados.length === 0) return [];

  const { motivoNoLaborableSV, setFeriadosCache } = await import("@/lib/dias-habiles");
  // Refrescar caché de feriados del año antes de iterar.
  const anio = dia.getUTCFullYear();
  const { data: fer } = await supabase
    .from("feriados").select("fecha").eq("anio", anio).eq("activo", true);
  setFeriadosCache(anio, new Set(((fer ?? []) as Array<{ fecha: string }>).map((r) => r.fecha)));

  const movidos: Array<{ id: string; folio: string; fecha_anterior: string; fecha_nueva: string }> = [];
  for (const t of afectados) {
    const dur = Math.max(1, Number(t.duracion_dias ?? 1));
    const cursor = new Date(t.fecha_programada);
    // Avanzamos día por día hasta encontrar uno hábil sin conflictos.
    for (let i = 0; i < 90; i++) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const candidato = cursor.toISOString();
      if (motivoNoLaborableSV(candidato)) continue;
      const cf = await findCleaningClientConflicts(supabase, {
        plantaId: t.planta_id,
        servicio: t.servicio,
        fechaProgramada: candidato,
        duracionDias: dur,
        excluirTrabajoId: t.id,
      });
      if (cf.length > 0) continue;
      if (t.tecnico_id) {
        const { data: cts } = await supabase.rpc("verificar_conflicto_tecnico" as any, {
          _tecnico_id: t.tecnico_id,
          _fecha: candidato,
          _duracion_dias: dur,
          _excluir_trabajo_id: t.id,
        });
        if ((cts ?? []).length > 0) continue;
      }
      const { error } = await supabase
        .from("trabajos").update({ fecha_programada: candidato }).eq("id", t.id);
      if (!error) {
        movidos.push({ id: t.id, folio: t.folio, fecha_anterior: t.fecha_programada, fecha_nueva: candidato });
        try {
          const { notificarEventoTrabajo } = await import("@/lib/notificaciones-eventos.server");
          await notificarEventoTrabajo({ evento: "reprogramado", trabajoId: t.id }).catch(() => {});
        } catch { /* silenciar */ }
      }
      break;
    }
  }
  return movidos;
}

/** Base de feriados nacionales SV para precargar al crear un año nuevo. */
function seedNacionalesSV(year: number): { fecha: string; nombre: string }[] {
  // Semana Santa (Anonymous Gregorian algorithm)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const jueves = new Date(easter); jueves.setDate(jueves.getDate() - 3);
  const viernes = new Date(easter); viernes.setDate(viernes.getDate() - 2);
  const sabado = new Date(easter); sabado.setDate(sabado.getDate() - 1);
  return [
    { fecha: `${year}-01-01`, nombre: "Año Nuevo" },
    { fecha: fmt(jueves), nombre: "Jueves Santo" },
    { fecha: fmt(viernes), nombre: "Viernes Santo" },
    { fecha: fmt(sabado), nombre: "Sábado Santo" },
    { fecha: `${year}-05-01`, nombre: "Día del Trabajo" },
    { fecha: `${year}-05-10`, nombre: "Día de la Madre" },
    { fecha: `${year}-06-17`, nombre: "Día del Padre" },
    { fecha: `${year}-08-06`, nombre: "Fiestas Agostinas" },
    { fecha: `${year}-09-15`, nombre: "Independencia" },
    { fecha: `${year}-11-02`, nombre: "Día de los Difuntos" },
    { fecha: `${year}-12-25`, nombre: "Navidad" },
  ];
}

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Solo administradores pueden gestionar el calendario de feriados.");
}

export const listFeriados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ anio: z.number().int().min(2000).max(2100).optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase.from("feriados" as any).select("*").order("fecha", { ascending: true });
    if (data.anio) q = q.eq("anio", data.anio);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown) as Array<{
      id: string; anio: number; fecha: string; nombre: string;
      tipo: "nacional" | "personalizado"; activo: boolean;
    }>;
  });

export const upsertFeriado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      nombre: z.string().min(2).max(120),
      tipo: z.enum(["nacional", "personalizado"]).default("personalizado"),
      activo: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const anio = Number(data.fecha.slice(0, 4));
    const payload = {
      fecha: data.fecha,
      nombre: data.nombre.trim(),
      tipo: data.tipo,
      activo: data.activo,
      anio,
      updated_by: context.userId,
    } as any;
    const q = data.id
      ? context.supabase.from("feriados" as any).update(payload).eq("id", data.id).select().single()
      : context.supabase.from("feriados" as any).upsert(payload, { onConflict: "fecha" }).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    // Si el feriado quedó activo, reubicar los trabajos programados ese día.
    let reubicados: Array<{ id: string; folio: string; fecha_anterior: string; fecha_nueva: string }> = [];
    if (data.activo) {
      reubicados = await reubicarTrabajosDeFecha(context.supabase, `${data.fecha}T13:00:00.000Z`);
    }
    return { row, reubicados } as any;
  });

export const toggleFeriadoActivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), activo: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: prev } = await context.supabase
      .from("feriados" as any).select("fecha").eq("id", data.id).single();
    const { error } = await context.supabase
      .from("feriados" as any).update({ activo: data.activo, updated_by: context.userId }).eq("id", data.id);
    if (error) throw new Error(error.message);
    let reubicados: Array<{ id: string; folio: string; fecha_anterior: string; fecha_nueva: string }> = [];
    if (data.activo && (prev as any)?.fecha) {
      reubicados = await reubicarTrabajosDeFecha(context.supabase, `${(prev as any).fecha}T13:00:00.000Z`);
    }
    return { ok: true, reubicados };
  });

export const deleteFeriado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("feriados" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const seedFeriadosAnio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ anio: z.number().int().min(2000).max(2100) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const seeds = seedNacionalesSV(data.anio).map((s) => ({
      anio: data.anio,
      fecha: s.fecha,
      nombre: s.nombre,
      tipo: "nacional" as const,
      activo: true,
      updated_by: context.userId,
    }));
    const { error } = await context.supabase
      .from("feriados" as any)
      .upsert(seeds, { onConflict: "fecha", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true, insertados: seeds.length };
  });

/** Lectura pública (autenticada) usada por validaciones de servidor. */
export const listFeriadosActivos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ anio: z.number().int().min(2000).max(2100) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("feriados" as any)
      .select("fecha, nombre")
      .eq("anio", data.anio)
      .eq("activo", true);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown) as Array<{ fecha: string; nombre: string }>;
  });