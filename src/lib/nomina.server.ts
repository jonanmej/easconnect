/**
 * Cálculo de nómina (solo servidor): cruza las marcaciones de jornada con los
 * feriados, los salarios registrados y aplica la normativa salvadoreña de
 * horas extras, domingos y feriados, más los descuentos de ley (ISSS, AFP, renta).
 */
import {
  desglosarJornada,
  desgloseVacio,
  sumarDesglose,
  pagoDesglose,
  valorHoraOrdinaria,
  FACTORES_NOMINA,
  HORAS_JORNADA_ORDINARIA,
  DIAS_MES_NOMINA,
  r2,
  type TipoDiaNomina,
} from "@/lib/nomina";
import { calcularDescuentos } from "@/lib/nomina-descuentos";

function esDomingo(fechaISO: string): boolean {
  const d = new Date(`${fechaISO}T12:00:00-06:00`);
  return d.getUTCDay() === 0;
}

export type RangoNomina = { desde: string; hasta: string; tecnico_id?: string };

export async function calcularNominaRango(supabase: any, rango: RangoNomina) {
  let q = supabase
    .from("jornadas_laborales")
    .select("*")
    .gte("fecha", rango.desde)
    .lte("fecha", rango.hasta)
    .order("fecha", { ascending: true });
  if (rango.tecnico_id) q = q.eq("tecnico_id", rango.tecnico_id);

  const [{ data: rows, error }, { data: feriados }, { data: salarios }] = await Promise.all([
    q,
    supabase.from("feriados").select("fecha, nombre, activo").gte("fecha", rango.desde).lte("fecha", rango.hasta),
    supabase.from("nomina_salarios").select("user_id, salario_mensual"),
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
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    perfiles = new Map((profs ?? []).map((p: any) => [p.id, p.display_name ?? "Colaborador"]));
  }

  const dias = (rows ?? []).map((r: any) => {
    const feriado = mapaFeriados.get(r.fecha) ?? null;
    const tipo_dia: TipoDiaNomina = feriado ? "feriado" : esDomingo(r.fecha) ? "descanso" : "habil";
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
      const bruto = a.pago_ordinario + a.pago_extras + a.pago_descanso + a.pago_feriado;
      const desc = calcularDescuentos(bruto);
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
        total_a_pagar: desc.total_bruto,
        total_bruto: desc.total_bruto,
        isss: desc.isss,
        afp: desc.afp,
        renta_gravable: desc.renta_gravable,
        renta: desc.renta,
        otros_descuentos: 0,
        total_descuentos: desc.total_descuentos,
        total_neto: desc.total_neto,
      };
    })
    .sort((a, b) => b.total_bruto - a.total_bruto || a.colaborador.localeCompare(b.colaborador, "es"));

  const suma = (fn: (p: (typeof personal)[number]) => number) => r2(personal.reduce((s, p) => s + fn(p), 0));

  return {
    desde: rango.desde,
    hasta: rango.hasta,
    limite_diario: HORAS_JORNADA_ORDINARIA,
    dias_mes: DIAS_MES_NOMINA,
    factores: FACTORES_NOMINA,
    dias,
    personal,
    totales: {
      horas_totales: suma((p) => p.horas_totales),
      horas_extra_diurnas: suma((p) => p.horas_extra_diurnas),
      horas_extra_nocturnas: suma((p) => p.horas_extra_nocturnas),
      horas_descanso: suma((p) => p.horas_descanso),
      horas_feriado: suma((p) => p.horas_feriado),
      pago_ordinario: suma((p) => p.pago_ordinario),
      pago_extras: suma((p) => p.pago_extras),
      pago_descanso: suma((p) => p.pago_descanso),
      pago_feriado: suma((p) => p.pago_feriado),
      total_a_pagar: suma((p) => p.total_bruto),
      total_bruto: suma((p) => p.total_bruto),
      isss: suma((p) => p.isss),
      afp: suma((p) => p.afp),
      renta: suma((p) => p.renta),
      otros_descuentos: suma((p) => p.otros_descuentos),
      total_descuentos: suma((p) => p.total_descuentos),
      total_neto: suma((p) => p.total_neto),
    },
    sin_salario: personal.filter((p) => p.sin_salario).map((p) => p.colaborador),
  };
}

export type NominaCalculo = Awaited<ReturnType<typeof calcularNominaRango>>;
