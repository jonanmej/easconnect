import { z } from "zod";
import { findRecursoConflicts, formatRecursoConflict } from "@/lib/scheduling";

/**
 * Verifica que los equipos seleccionados no estén comprometidos en otro
 * trabajo que se solape en fechas. Se permite programar varios clientes el
 * mismo día siempre que no se repitan equipos ni técnicos.
 */
export async function validarEquiposDisponibles(
  supabase: any,
  args: {
    equipoIds: (string | null | undefined)[];
    fechaProgramada: string;
    duracionDias?: number | null;
    excluirTrabajoId?: string | null;
  },
) {
  const conflictos = await findRecursoConflicts(supabase, {
    equipoIds: args.equipoIds,
    fechaProgramada: args.fechaProgramada,
    duracionDias: args.duracionDias,
    excluirTrabajoId: args.excluirTrabajoId ?? null,
  });
  if (conflictos.length === 0) return;
  const ids = Array.from(new Set(conflictos.flatMap((c) => c.equipos)));
  const { data: equipos } = await supabase.from("equipos").select("id, nombre, codigo").in("id", ids);
  const nombreById = new Map<string, string>(
    (equipos ?? []).map((e: any) => [e.id as string, `${e.nombre}${e.codigo ? ` (${e.codigo})` : ""}`]),
  );
  throw new Error(formatRecursoConflict(conflictos, (id) => nombreById.get(id) ?? id));
}

/**
 * Precarga los feriados personalizados del año correspondiente a `fechaISO`
 * en el caché sincrónico de `dias-habiles`, de modo que las validaciones
 * subsiguientes (`motivoNoLaborableSV`) tengan en cuenta lo configurado por
 * los administradores en el módulo de Configuración.
 */
export async function ensureFeriadosCargados(supabase: any, fechaISO: string) {
  try {
    const anio = new Date(fechaISO).getUTCFullYear();
    const { setFeriadosCache } = await import("@/lib/dias-habiles");
    // Nota: no usamos `hasFeriadosCache` aquí — el caché vive en memoria del
    // worker y quedaría desactualizado cuando un admin agrega/quita feriados
    // personalizados. Consultamos siempre para validar contra la lista actual.
    const { data } = await supabase
      .from("feriados")
      .select("fecha")
      .eq("anio", anio)
      .eq("activo", true);
    setFeriadosCache(anio, new Set(((data ?? []) as Array<{ fecha: string }>).map((r) => r.fecha)));
  } catch {
    /* si falla la consulta, se aplican los feriados por defecto */
  }
}

// ============ Clientes ============

/**
 * Valida que la fecha sea un día laborable. Si no lo es, permite la excepción
 * únicamente cuando quien programa es admin o supervisor, marca explícitamente
 * la autorización de emergencia y entrega una justificación. Devuelve el
 * detalle de la excepción para dejar traza en las notas de la OT.
 */
export async function validarDiaLaborable(
  supabase: any,
  userId: string,
  fechaISO: string,
  emergencia: { permitir?: boolean | undefined; motivo?: string | null | undefined } | undefined,
  accion: string,
): Promise<{ motivo: string; justificacion: string } | null> {
  await ensureFeriadosCargados(supabase, fechaISO);
  const { motivoNoLaborableSV } = await import("@/lib/dias-habiles");
  const motivo = motivoNoLaborableSV(fechaISO);
  if (!motivo) return null;
  const etiqueta = motivo === "feriado" ? "un día feriado" : `un ${motivo}`;
  if (!emergencia?.permitir) {
    throw new Error(
      `No se puede ${accion} en ${etiqueta}. Si se trata de una emergencia, activa la autorización de día no laborable e indica la justificación.`,
    );
  }
  const [{ data: esAdmin }, { data: esSupervisor }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "supervisor" }),
  ]);
  if (!esAdmin && !esSupervisor) {
    throw new Error("Solo un administrador o supervisor puede autorizar trabajo en días no laborables.");
  }
  const justificacion = String(emergencia.motivo ?? "").trim();
  if (justificacion.length < 5) {
    throw new Error("Indica la justificación de la emergencia (mínimo 5 caracteres).");
  }
  return { motivo, justificacion };
}

export function notaExcepcion(exc: { motivo: string; justificacion: string }, fechaISO: string) {
  const fecha = fechaISO.slice(0, 10);
  return `⚠ Excepción autorizada para trabajar en ${exc.motivo} (${fecha}): ${exc.justificacion}`;
}

export const ClienteEstado = z.enum(["activo", "revision", "pausado"]);
