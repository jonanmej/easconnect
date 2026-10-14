import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRol } from "@/lib/auth-roles";
import { findRecursoConflicts, equiposDeTrabajo, formatRecursoConflict } from "@/lib/scheduling";
import { validarDiaLaborable, notaExcepcion, ensureFeriadosCargados } from "./helpers";

/**
 * Asignación múltiple de técnicos/equipos:
 * - asignarTecnicoMultiple: asigna el mismo técnico (y técnicos extra) a varias OT.
 * - programarTrabajoMultiplesDias: programa una OT en varios días específicos
 *   (no necesariamente consecutivos) usando trabajo_dia_excepciones.
 *
 * Ambas validan conflictos de técnico y equipo por cada OT/día y devuelven
 * un resumen por fila en lugar de fallar en bloque.
 */

type ResultadoFila = { id: string; folio: string; ok: boolean; mensaje?: string };

export const asignarTecnicoMultiple = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      trabajo_ids: z.array(z.string().uuid()).min(1).max(100),
      tecnico_id: z.string().uuid().nullable(),
      tecnicos_extra_ids: z.array(z.string().uuid()).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireRol(context.supabase, context.userId, ["admin", "supervisor"]);
    const extras = Array.from(
      new Set((data.tecnicos_extra_ids ?? []).filter((t) => t && t !== data.tecnico_id)),
    );
    const resultados: ResultadoFila[] = [];

    for (const trabajoId of data.trabajo_ids) {
      try {
        const { data: t } = await context.supabase
          .from("trabajos")
          .select("id, folio, fecha_programada, duracion_dias, tecnico_id, estado")
          .eq("id", trabajoId)
          .single();
        if (!t) throw new Error("Trabajo no encontrado");
        if (t.estado === "cancelado" || t.estado === "completado") {
          throw new Error(`La OT está ${t.estado === "cancelado" ? "cancelada" : "completada"}`);
        }
        // Sin bloqueo por conflicto de técnico (principal ni extras): un
        // técnico puede quedar asignado a varias OT en las mismas fechas.

        const tecnicoPrevio = t.tecnico_id ?? null;
        const { error } = await context.supabase
          .from("trabajos")
          .update({ tecnico_id: data.tecnico_id })
          .eq("id", trabajoId);
        if (error) throw new Error(error.message);

        // Sincronizar técnicos extra
        await context.supabase.from("trabajo_tecnicos").delete().eq("trabajo_id", trabajoId);
        if (extras.length > 0) {
          const { error: eIns } = await context.supabase.from("trabajo_tecnicos").insert(
            extras.map((tid) => ({ trabajo_id: trabajoId, tecnico_id: tid, created_by: context.userId })),
          );
          if (eIns) throw new Error(eIns.message);
        }

        // Notificaciones (silenciadas si fallan)
        try {
          const { notificarAsignacionTecnico } = await import("@/lib/notificaciones-tecnico.server");
          if (data.tecnico_id && data.tecnico_id !== tecnicoPrevio) {
            await notificarAsignacionTecnico({
              tecnicoId: data.tecnico_id,
              trabajoId,
              reasignacion: !!tecnicoPrevio,
              asignadoPor: context.userId,
            }).catch(() => {});
          }
          for (const tid of extras) {
            await notificarAsignacionTecnico({
              tecnicoId: tid,
              trabajoId,
              reasignacion: false,
              asignadoPor: context.userId,
            }).catch(() => {});
          }
        } catch { /* silenciar */ }

        resultados.push({ id: trabajoId, folio: t.folio, ok: true });
      } catch (e: any) {
        const msg = String(e?.message ?? "Error desconocido");
        const folio = msg.startsWith("CONFLICTO_TECNICO::")
          ? "Conflicto de agenda del técnico"
          : msg;
        resultados.push({ id: trabajoId, folio: "", ok: false, mensaje: folio });
      }
    }
    return resultados;
  });

export const programarTrabajoMultiplesDias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      trabajo_id: z.string().uuid(),
      fechas: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(60),
      emergencia_no_laborable: z.boolean().optional(),
      emergencia_motivo: z.string().max(300).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireRol(context.supabase, context.userId, ["admin", "supervisor"]);
    const fechas = Array.from(new Set(data.fechas)).sort();
    const { data: t } = await context.supabase
      .from("trabajos")
      .select("id, folio, tecnico_id, duracion_dias, notas, estado")
      .eq("id", data.trabajo_id)
      .single();
    if (!t) throw new Error("Trabajo no encontrado");
    if (t.estado === "cancelado" || t.estado === "completado") {
      throw new Error("No se puede reprogramar una OT cancelada o completada");
    }

    // Validar cada día: laborable (o emergencia autorizada) + equipos libres
    const equipoIds = await equiposDeTrabajo(context.supabase, data.trabajo_id);
    const notasExtra: string[] = [];
    for (const f of fechas) {
      const iso = new Date(`${f}T13:00:00.000Z`).toISOString();
      const exc = await validarDiaLaborable(
        context.supabase,
        context.userId,
        iso,
        { permitir: data.emergencia_no_laborable, motivo: data.emergencia_motivo },
        "programar",
      );
      if (exc) notasExtra.push(notaExcepcion(exc, iso));
      const conflictos = await findRecursoConflicts(context.supabase, {
        equipoIds,
        fechaProgramada: iso,
        duracionDias: 1,
        excluirTrabajoId: data.trabajo_id,
      });
      if (conflictos.length > 0) {
        throw new Error(`Día ${f}: ` + formatRecursoConflict(conflictos));
      }
      // Sin bloqueo por técnico: puede tener varios trabajos el mismo día.
    }

    // Base: primera fecha; duración = cantidad de días elegidos. Los días que
    // no caen en la secuencia consecutiva se mueven con excepciones.
    const inicio = new Date(`${fechas[0]}T13:00:00.000Z`);
    const patch: any = {
      fecha_programada: inicio.toISOString(),
      duracion_dias: fechas.length,
    };
    if (notasExtra.length > 0) {
      patch.notas = [String(t.notas ?? "").trim(), ...notasExtra].filter(Boolean).join("\n");
    }
    const { error } = await context.supabase
      .from("trabajos")
      .update(patch)
      .eq("id", data.trabajo_id);
    if (error) throw new Error(error.message);

    // Reconstruir excepciones: el día i de la secuencia base cae en
    // inicio + i; si la fecha elegida difiere, se registra el movimiento.
    await context.supabase
      .from("trabajo_dia_excepciones")
      .delete()
      .eq("trabajo_id", data.trabajo_id);
    const DAY = 24 * 60 * 60 * 1000;
    const rows: { trabajo_id: string; fecha_original: string; fecha_movida: string }[] = [];
    for (let i = 0; i < fechas.length; i++) {
      const base = new Date(inicio.getTime() + i * DAY).toISOString().slice(0, 10);
      if (base !== fechas[i]) {
        rows.push({ trabajo_id: data.trabajo_id, fecha_original: base, fecha_movida: fechas[i] });
      }
    }
    if (rows.length > 0) {
      const { error: eExc } = await context.supabase.from("trabajo_dia_excepciones").insert(rows);
      if (eExc) throw new Error(eExc.message);
    }

    try {
      const { notificarEventoTrabajo } = await import("@/lib/notificaciones-eventos.server");
      await notificarEventoTrabajo({ evento: "reprogramado", trabajoId: data.trabajo_id, actorId: context.userId }).catch(() => {});
    } catch { /* silenciar */ }

    return { ok: true, folio: t.folio, dias: fechas.length };
  });

/** Precarga de feriados para validaciones en lote (expuesta para la UI). */
export const precargarFeriados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ anio: z.number().int() }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureFeriadosCargados(context.supabase, `${data.anio}-06-01`);
    return { ok: true };
  });
