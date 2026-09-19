import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireStaff(context: any) {
  const { data: esAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId, _role: "admin",
  });
  if (!esAdmin) throw new Error("Solo los administradores pueden usar el módulo de nómina.");
}

const ZMes = z.object({
  anio: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
  tecnico_id: z.string().uuid().optional(),
});

/** Rango de fechas del mes (hora de El Salvador, formato YYYY-MM-DD). */
export function rangoMes(anio: number, mes: number) {
  const mm = String(mes).padStart(2, "0");
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Cálculo del mes con horas, pagos y descuentos de ley (no lo guarda). */
export const calcularNominaMes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ZMes.parse(d))
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const { calcularNominaRango } = await import("@/lib/nomina.server");
    const { cortesDelMes } = await import("@/lib/nomina-cortes");
    const { desde, hasta } = rangoMes(data.anio, data.mes);

    const definiciones = cortesDelMes(data.anio, data.mes);
    const [calc, { data: periodos }, ...porCorte] = await Promise.all([
      calcularNominaRango(context.supabase, { desde, hasta, tecnico_id: data.tecnico_id }),
      context.supabase.from("nomina_periodos").select("*").eq("anio", data.anio).eq("mes", data.mes),
      ...definiciones.map((c) =>
        calcularNominaRango(context.supabase, { desde: c.desde, hasta: c.hasta }),
      ),
    ]);

    const mapaPeriodos = new Map<string, any>(
      (periodos ?? []).map((p: any) => [p.corte_clave ?? "mes", p]),
    );

    const cortes = definiciones.map((c, i) => {
      const personal = (porCorte[i]?.personal ?? []).filter((p: any) =>
        c.modalidades.includes((p.modalidad ?? "mensual") as any),
      );
      const suma = (fn: (p: any) => number) => r2(personal.reduce((s: number, p: any) => s + fn(p), 0));
      const p = mapaPeriodos.get(c.clave);
      return {
        ...c,
        colaboradores: personal.length,
        dias: personal.reduce((s: number, x: any) => s + x.dias, 0),
        total_bruto: suma((x) => x.total_bruto),
        total_descuentos: suma((x) => x.isss + x.afp + x.renta),
        total_neto: suma((x) => x.total_neto),
        personal,
        periodo: p ? { id: p.id as string, estado: p.estado as string } : null,
      };
    });

    const periodo = mapaPeriodos.get("mes") ?? null;
    let guardado: any[] = [];
    if (periodo?.id) {
      const { data: det } = await context.supabase
        .from("nomina_periodo_detalle")
        .select("*")
        .eq("periodo_id", periodo.id);
      guardado = det ?? [];
    }
    return { ...calc, anio: data.anio, mes: data.mes, periodo, guardado, cortes };
  });

/**
 * Guarda (o vuelve a calcular) la planilla de un corte de pago del mes:
 * mes completo, quincena (personal con salario mensual) o semana de pago
 * (personal con pago por día, lunes a viernes). Recalcula siempre en el
 * servidor a partir de las marcaciones; solo los "otros descuentos" vienen del
 * formulario. Si `cerrar` es verdadero, el período queda cerrado.
 */
export const guardarNominaMes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      anio: z.number().int().min(2020).max(2100),
      mes: z.number().int().min(1).max(12),
      corte_clave: z.string().min(1).max(40).optional(),
      notas: z.string().max(2000).nullable().optional(),
      cerrar: z.boolean().optional(),
      ajustes: z
        .array(
          z.object({
            user_id: z.string().uuid(),
            otros_descuentos: z.number().min(0).max(1000000).optional(),
            notas: z.string().max(500).nullable().optional(),
          }),
        )
        .optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const { calcularNominaRango } = await import("@/lib/nomina.server");
    const { calcularDescuentos } = await import("@/lib/nomina-descuentos");
    const { resolverCorte } = await import("@/lib/nomina-cortes");
    const corte = resolverCorte(data.anio, data.mes, data.corte_clave ?? "mes");
    const { desde, hasta } = corte;

    const { data: existente } = await context.supabase
      .from("nomina_periodos").select("id, estado")
      .eq("anio", data.anio).eq("mes", data.mes).eq("corte_clave", corte.clave).maybeSingle();
    if (existente?.estado === "cerrado") {
      throw new Error("El período ya está cerrado. Reábralo antes de volver a calcularlo.");
    }

    const bruta = await calcularNominaRango(context.supabase, { desde, hasta });
    const calc = {
      ...bruta,
      personal: bruta.personal.filter((p) =>
        corte.modalidades.includes((p.modalidad ?? "mensual") as any),
      ),
    };
    const ajustes = new Map(
      (data.ajustes ?? []).map((a) => [a.user_id, a]),
    );

    const filas = calc.personal.map((p) => {
      const aj = ajustes.get(p.tecnico_id);
      const desc = calcularDescuentos(p.total_bruto, aj?.otros_descuentos ?? 0);
      return {
        user_id: p.tecnico_id,
        colaborador: p.colaborador,
        salario_mensual: p.salario_mensual,
        valor_hora: p.valor_hora,
        dias: p.dias,
        horas_totales: p.horas_totales,
        horas_ord_diurnas: p.horas_ord_diurnas,
        horas_ord_nocturnas: p.horas_ord_nocturnas,
        horas_extra_diurnas: p.horas_extra_diurnas,
        horas_extra_nocturnas: p.horas_extra_nocturnas,
        horas_descanso: p.horas_descanso,
        horas_feriado: p.horas_feriado,
        pago_ordinario: p.pago_ordinario,
        pago_extras: p.pago_extras,
        pago_descanso: p.pago_descanso,
        pago_feriado: p.pago_feriado,
        total_bruto: desc.total_bruto,
        isss: desc.isss,
        afp: desc.afp,
        renta: desc.renta,
        otros_descuentos: desc.otros_descuentos,
        total_neto: desc.total_neto,
        notas: aj?.notas ?? null,
      };
    });

    const sum = (fn: (f: (typeof filas)[number]) => number) =>
      Math.round(filas.reduce((s, f) => s + fn(f), 0) * 100) / 100;

    const payloadPeriodo = {
      anio: data.anio,
      mes: data.mes,
      tipo: corte.tipo,
      corte_clave: corte.clave,
      corte_label: corte.label,
      desde,
      hasta,
      notas: data.notas ?? null,
      total_bruto: sum((f) => f.total_bruto),
      total_isss: sum((f) => f.isss),
      total_afp: sum((f) => f.afp),
      total_renta: sum((f) => f.renta),
      total_otros: sum((f) => f.otros_descuentos),
      total_neto: sum((f) => f.total_neto),
      estado: data.cerrar ? "cerrado" : "borrador",
      cerrado_por: data.cerrar ? context.userId : null,
      cerrado_at: data.cerrar ? new Date().toISOString() : null,
      created_by: context.userId,
    };

    const { data: periodo, error: errP } = await context.supabase
      .from("nomina_periodos")
      .upsert(payloadPeriodo, { onConflict: "anio,mes" })
      .select()
      .single();
    if (errP) throw new Error(errP.message);

    const { error: errDel } = await context.supabase
      .from("nomina_periodo_detalle").delete().eq("periodo_id", periodo.id);
    if (errDel) throw new Error(errDel.message);

    if (filas.length) {
      const { error: errIns } = await context.supabase
        .from("nomina_periodo_detalle")
        .insert(filas.map((f) => ({ ...f, periodo_id: periodo.id })));
      if (errIns) throw new Error(errIns.message);
    }

    return { periodo, lineas: filas.length };
  });

/** Reabre un período cerrado para volver a calcularlo. */
export const reabrirNominaMes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ periodo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const { error } = await context.supabase
      .from("nomina_periodos")
      .update({ estado: "borrador", cerrado_at: null, cerrado_por: null })
      .eq("id", data.periodo_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Elimina un período guardado y su detalle. */
export const eliminarNominaMes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ periodo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const { error } = await context.supabase
      .from("nomina_periodos").delete().eq("id", data.periodo_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Historial de planillas guardadas (más recientes primero). */
export const listPeriodosNomina = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { data, error } = await context.supabase
      .from("nomina_periodos")
      .select("*")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      ...p,
      total_bruto: Number(p.total_bruto ?? 0),
      total_isss: Number(p.total_isss ?? 0),
      total_afp: Number(p.total_afp ?? 0),
      total_renta: Number(p.total_renta ?? 0),
      total_otros: Number(p.total_otros ?? 0),
      total_neto: Number(p.total_neto ?? 0),
    }));
  });

const numerizar = (r: any) => {
  const out: any = { ...r };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "string" && /^-?\d+(\.\d+)?$/.test(out[k]) && k !== "colaborador") {
      out[k] = Number(out[k]);
    }
  }
  return out;
};

/** Detalle guardado de un período. */
export const getDetalleNomina = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ periodo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const [{ data: periodo }, { data: lineas, error }] = await Promise.all([
      context.supabase.from("nomina_periodos").select("*").eq("id", data.periodo_id).maybeSingle(),
      context.supabase
        .from("nomina_periodo_detalle")
        .select("*")
        .eq("periodo_id", data.periodo_id)
        .order("colaborador", { ascending: true }),
    ]);
    if (error) throw new Error(error.message);
    return { periodo, lineas: (lineas ?? []).map(numerizar) };
  });

/** Historial de pagos mensuales de un colaborador. */
export const historialColaborador = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const { data: lineas, error } = await context.supabase
      .from("nomina_periodo_detalle")
      .select("*, nomina_periodos!inner(anio, mes, desde, hasta, estado)")
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return (lineas ?? [])
      .map((l: any) => {
        const p = l.nomina_periodos ?? {};
        const { nomina_periodos: _omit, ...resto } = l;
        return { ...numerizar(resto), anio: p.anio, mes: p.mes, desde: p.desde, hasta: p.hasta, estado: p.estado };
      })
      .sort((a: any, b: any) => b.anio - a.anio || b.mes - a.mes);
  });
