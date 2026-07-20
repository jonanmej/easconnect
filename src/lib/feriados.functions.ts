import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    return row;
  });

export const toggleFeriadoActivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), activo: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("feriados" as any).update({ activo: data.activo, updated_by: context.userId }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
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