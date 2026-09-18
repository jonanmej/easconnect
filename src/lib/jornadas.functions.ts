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

/* ─────────── Horas extras para nómina ─────────── */

/** Jornada ordinaria diaria (horas). Todo lo que exceda cuenta como extra. */
export const LIMITE_DIARIO_HORAS = 8;

function esDomingo(fechaISO: string): boolean {
  // fechaISO = YYYY-MM-DD; mediodía para evitar desfases de zona.
  return new Date(`${fechaISO}T12:00:00`).getDay() === 0;
}

/**
 * Resumen de horas extras por colaborador en un rango de fechas.
 * - Ordinarias: hasta 8 h efectivas por día hábil.
 * - Extras: lo que exceda 8 h efectivas en un día hábil.
 * - Descanso/feriado: las horas de domingo o feriado se reportan aparte.
 */
export const resumenHorasExtras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ZRango.parse(d))
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("jornadas_laborales")
      .select("*")
      .gte("fecha", data.desde)
      .lte("fecha", data.hasta)
      .order("fecha", { ascending: true });
    if (data.tecnico_id) q = q.eq("tecnico_id", data.tecnico_id);
    const [{ data: rows, error }, { data: feriados }] = await Promise.all([
      q,
      context.supabase
        .from("feriados")
        .select("fecha, nombre, activo")
        .gte("fecha", data.desde)
        .lte("fecha", data.hasta),
    ]);
    if (error) throw new Error(error.message);

    const mapaFeriados = new Map<string, string>(
      (feriados ?? []).filter((f: any) => f.activo).map((f: any) => [f.fecha as string, f.nombre as string]),
    );

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.tecnico_id)));
    let perfiles = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, display_name").in("id", ids);
      perfiles = new Map((profs ?? []).map((p: any) => [p.id, p.display_name ?? "Colaborador"]));
    }

    const dias = (rows ?? []).map((r: any) => {
      const resumen = calcularResumen(r);
      const horas = resumen.horasEfectivas;
      const feriado = mapaFeriados.get(r.fecha) ?? null;
      const descanso = !!feriado || esDomingo(r.fecha);
      const ordinarias = descanso ? 0 : Math.min(horas, LIMITE_DIARIO_HORAS);
      const extras = descanso ? 0 : Math.max(0, Math.round((horas - LIMITE_DIARIO_HORAS) * 100) / 100);
      return {
        id: r.id as string,
        fecha: r.fecha as string,
        tecnico_id: r.tecnico_id as string,
        colaborador: perfiles.get(r.tecnico_id) ?? "Colaborador",
        horas_efectivas: horas,
        horas_ordinarias: Math.round(ordinarias * 100) / 100,
        horas_extras: extras,
        horas_descanso: descanso ? horas : 0,
        es_descanso: descanso,
        motivo_descanso: feriado ? `Feriado: ${feriado}` : descanso ? "Domingo" : null,
        abierta: !r.hora_fin,
      };
    });

    const porColaborador = new Map<string, {
      tecnico_id: string; colaborador: string; dias: number;
      horas_efectivas: number; horas_ordinarias: number; horas_extras: number;
      horas_descanso: number; dias_con_extras: number; dias_descanso: number;
    }>();
    for (const d of dias) {
      const acc = porColaborador.get(d.tecnico_id) ?? {
        tecnico_id: d.tecnico_id, colaborador: d.colaborador, dias: 0,
        horas_efectivas: 0, horas_ordinarias: 0, horas_extras: 0,
        horas_descanso: 0, dias_con_extras: 0, dias_descanso: 0,
      };
      acc.dias += 1;
      acc.horas_efectivas += d.horas_efectivas;
      acc.horas_ordinarias += d.horas_ordinarias;
      acc.horas_extras += d.horas_extras;
      acc.horas_descanso += d.horas_descanso;
      if (d.horas_extras > 0) acc.dias_con_extras += 1;
      if (d.es_descanso) acc.dias_descanso += 1;
      porColaborador.set(d.tecnico_id, acc);
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const resumenPersonal = Array.from(porColaborador.values())
      .map((a) => ({
        ...a,
        horas_efectivas: r2(a.horas_efectivas),
        horas_ordinarias: r2(a.horas_ordinarias),
        horas_extras: r2(a.horas_extras),
        horas_descanso: r2(a.horas_descanso),
      }))
      .sort((a, b) => b.horas_extras - a.horas_extras || a.colaborador.localeCompare(b.colaborador, "es"));

    return {
      limite_diario: LIMITE_DIARIO_HORAS,
      desde: data.desde,
      hasta: data.hasta,
      dias,
      personal: resumenPersonal,
      totales: {
        horas_efectivas: r2(resumenPersonal.reduce((s, a) => s + a.horas_efectivas, 0)),
        horas_ordinarias: r2(resumenPersonal.reduce((s, a) => s + a.horas_ordinarias, 0)),
        horas_extras: r2(resumenPersonal.reduce((s, a) => s + a.horas_extras, 0)),
        horas_descanso: r2(resumenPersonal.reduce((s, a) => s + a.horas_descanso, 0)),
      },
    };
  });

/* ─────────── Salarios y cálculo de pago (nómina El Salvador) ─────────── */

/** Salarios registrados manualmente (RLS: staff ve todos, cada quien ve el suyo). */
export const listSalarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("nomina_salarios")
      .select("id, user_id, salario_mensual, moneda, notas, updated_at");
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.user_id);
    let perfiles = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, display_name").in("id", ids);
      perfiles = new Map((profs ?? []).map((p: any) => [p.id, p.display_name ?? "Colaborador"]));
    }
    return (rows ?? [])
      .map((r: any) => ({
        ...r,
        salario_mensual: Number(r.salario_mensual ?? 0),
        colaborador: perfiles.get(r.user_id) ?? "Colaborador",
      }))
      .sort((a: any, b: any) => a.colaborador.localeCompare(b.colaborador, "es"));
  });

/** Crea o actualiza el salario mensual de un colaborador (solo admin/supervisor). */
export const upsertSalario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      salario_mensual: z.number().min(0).max(1000000),
      notas: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const { data: row, error } = await context.supabase
      .from("nomina_salarios")
      .upsert(
        {
          user_id: data.user_id,
          salario_mensual: data.salario_mensual,
          notas: data.notas ?? null,
          updated_by: context.userId,
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Elimina el salario registrado de un colaborador (solo admin/supervisor). */
export const eliminarSalario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const { error } = await context.supabase
      .from("nomina_salarios").delete().eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Cálculo de pago del período por colaborador, con horas ordinarias y extras
 * diurnas/nocturnas, días de descanso y feriados, según la normativa salvadoreña.
 */
export const calculoNomina = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ZRango.parse(d))
  .handler(async ({ context, data }) => {
    const {
      desglosarJornada, desgloseVacio, sumarDesglose, pagoDesglose,
      valorHoraOrdinaria, FACTORES_NOMINA, HORAS_JORNADA_ORDINARIA, DIAS_MES_NOMINA, r2,
    } = await import("@/lib/nomina");
    type TipoDia = import("@/lib/nomina").TipoDiaNomina;

    let q = context.supabase
      .from("jornadas_laborales")
      .select("*")
      .gte("fecha", data.desde)
      .lte("fecha", data.hasta)
      .order("fecha", { ascending: true });
    if (data.tecnico_id) q = q.eq("tecnico_id", data.tecnico_id);

    const [{ data: rows, error }, { data: feriados }, { data: salarios }] = await Promise.all([
      q,
      context.supabase.from("feriados").select("fecha, nombre, activo")
        .gte("fecha", data.desde).lte("fecha", data.hasta),
      context.supabase.from("nomina_salarios").select("user_id, salario_mensual"),
    ]);
    if (error) throw new Error(error.message);

    const mapaFeriados = new Map<string, string>(
      (feriados ?? []).filter((f: any) => f.activo).map((f: any) => [f.fecha as string, f.nombre as string]),
    );
    const mapaSalarios = new Map<string, number>(
      (salarios ?? []).map((s: any) => [s.user_id as string, Number(s.salario_mensual ?? 0)]),
    );

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.tecnico_id)));
    let perfiles = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, display_name").in("id", ids);
      perfiles = new Map((profs ?? []).map((p: any) => [p.id, p.display_name ?? "Colaborador"]));
    }

    const dias = (rows ?? []).map((r: any) => {
      const feriado = mapaFeriados.get(r.fecha) ?? null;
      const tipo_dia: TipoDia = feriado ? "feriado" : esDomingo(r.fecha) ? "descanso" : "habil";
      const desglose = desglosarJornada(r);
      const salario = mapaSalarios.get(r.tecnico_id) ?? 0;
      const valorHora = valorHoraOrdinaria(salario);
      const pago = pagoDesglose(desglose, tipo_dia, valorHora);
      const horas = r2(
        desglose.ord_diurna + desglose.ord_nocturna + desglose.extra_diurna + desglose.extra_nocturna,
      );
      return {
        id: r.id as string,
        fecha: r.fecha as string,
        tecnico_id: r.tecnico_id as string,
        colaborador: perfiles.get(r.tecnico_id) ?? "Colaborador",
        tipo_dia,
        motivo: feriado ? `Feriado: ${feriado}` : tipo_dia === "descanso" ? "Domingo" : null,
        horas_totales: horas,
        horas: desglose,
        pago,
        valor_hora: r2(valorHora),
        abierta: !r.hora_fin,
      };
    });

    type Acc = {
      tecnico_id: string; colaborador: string; salario_mensual: number;
      valor_hora: number; dias: number;
      habil: ReturnType<typeof desgloseVacio>;
      descanso: ReturnType<typeof desgloseVacio>;
      feriado: ReturnType<typeof desgloseVacio>;
      pago_ordinario: number; pago_extras: number; pago_descanso: number; pago_feriado: number;
      horas_totales: number; sin_salario: boolean;
    };
    const acc = new Map<string, Acc>();
    for (const d of dias) {
      const salario = mapaSalarios.get(d.tecnico_id) ?? 0;
      const a = acc.get(d.tecnico_id) ?? {
        tecnico_id: d.tecnico_id, colaborador: d.colaborador,
        salario_mensual: salario, valor_hora: r2(valorHoraOrdinaria(salario)), dias: 0,
        habil: desgloseVacio(), descanso: desgloseVacio(), feriado: desgloseVacio(),
        pago_ordinario: 0, pago_extras: 0, pago_descanso: 0, pago_feriado: 0,
        horas_totales: 0, sin_salario: salario <= 0,
      };
      a.dias += 1;
      a.horas_totales += d.horas_totales;
      a[d.tipo_dia] = sumarDesglose(a[d.tipo_dia], d.horas);
      const extras = d.pago.extra_diurna + d.pago.extra_nocturna;
      const ordinarias = d.pago.ord_diurna + d.pago.ord_nocturna;
      if (d.tipo_dia === "habil") {
        a.pago_ordinario += ordinarias;
        a.pago_extras += extras;
      } else if (d.tipo_dia === "descanso") {
        a.pago_descanso += ordinarias + extras;
      } else {
        a.pago_feriado += ordinarias + extras;
      }
      acc.set(d.tecnico_id, a);
    }

    const personal = Array.from(acc.values())
      .map((a) => {
        const total = a.pago_ordinario + a.pago_extras + a.pago_descanso + a.pago_feriado;
        return {
          tecnico_id: a.tecnico_id,
          colaborador: a.colaborador,
          salario_mensual: r2(a.salario_mensual),
          valor_hora: a.valor_hora,
          dias: a.dias,
          sin_salario: a.sin_salario,
          horas_totales: r2(a.horas_totales),
          horas_ord_diurnas: r2(a.habil.ord_diurna),
          horas_ord_nocturnas: r2(a.habil.ord_nocturna),
          horas_extra_diurnas: r2(a.habil.extra_diurna + a.descanso.extra_diurna + a.feriado.extra_diurna),
          horas_extra_nocturnas: r2(a.habil.extra_nocturna + a.descanso.extra_nocturna + a.feriado.extra_nocturna),
          horas_descanso: r2(a.descanso.ord_diurna + a.descanso.ord_nocturna + a.descanso.extra_diurna + a.descanso.extra_nocturna),
          horas_feriado: r2(a.feriado.ord_diurna + a.feriado.ord_nocturna + a.feriado.extra_diurna + a.feriado.extra_nocturna),
          pago_ordinario: r2(a.pago_ordinario),
          pago_extras: r2(a.pago_extras),
          pago_descanso: r2(a.pago_descanso),
          pago_feriado: r2(a.pago_feriado),
          total_a_pagar: r2(total),
        };
      })
      .sort((a, b) => b.total_a_pagar - a.total_a_pagar || a.colaborador.localeCompare(b.colaborador, "es"));

    return {
      desde: data.desde,
      hasta: data.hasta,
      limite_diario: HORAS_JORNADA_ORDINARIA,
      dias_mes: DIAS_MES_NOMINA,
      factores: FACTORES_NOMINA,
      dias,
      personal,
      totales: {
        horas_totales: r2(personal.reduce((s, p) => s + p.horas_totales, 0)),
        horas_extra_diurnas: r2(personal.reduce((s, p) => s + p.horas_extra_diurnas, 0)),
        horas_extra_nocturnas: r2(personal.reduce((s, p) => s + p.horas_extra_nocturnas, 0)),
        horas_descanso: r2(personal.reduce((s, p) => s + p.horas_descanso, 0)),
        horas_feriado: r2(personal.reduce((s, p) => s + p.horas_feriado, 0)),
        pago_ordinario: r2(personal.reduce((s, p) => s + p.pago_ordinario, 0)),
        pago_extras: r2(personal.reduce((s, p) => s + p.pago_extras, 0)),
        pago_descanso: r2(personal.reduce((s, p) => s + p.pago_descanso, 0)),
        pago_feriado: r2(personal.reduce((s, p) => s + p.pago_feriado, 0)),
        total_a_pagar: r2(personal.reduce((s, p) => s + p.total_a_pagar, 0)),
      },
      sin_salario: personal.filter((p) => p.sin_salario).map((p) => p.colaborador),
    };
  });
