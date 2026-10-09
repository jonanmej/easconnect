import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findRecursoConflicts, equiposDeTrabajo } from "@/lib/scheduling";
import { validarEquiposDisponibles, ensureFeriadosCargados, validarDiaLaborable, notaExcepcion } from "./helpers";

export const reprogramarTrabajo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      fecha_programada: z.string().min(1),
      tecnico_id: z.string().uuid().nullable().optional(),
      emergencia_no_laborable: z.boolean().optional(),
      emergencia_motivo: z.string().max(300).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: any = { fecha_programada: new Date(data.fecha_programada).toISOString() };
    if (data.tecnico_id !== undefined) patch.tecnico_id = data.tecnico_id || null;
    const excepcion = await validarDiaLaborable(
      context.supabase,
      context.userId,
      patch.fecha_programada,
      { permitir: data.emergencia_no_laborable, motivo: data.emergencia_motivo },
      "reprogramar",
    );
    // Validar conflicto si hay técnico (existente o nuevo)
    const { data: trabajoActual } = await context.supabase
      .from("trabajos").select("tecnico_id, duracion_dias, planta_id, servicio, notas").eq("id", data.id).single();
    if (excepcion) {
      const nota = notaExcepcion(excepcion, patch.fecha_programada);
      patch.notas = [String((trabajoActual)?.notas ?? "").trim(), nota].filter(Boolean).join("\n");
    }
    await validarEquiposDisponibles(context.supabase, {
      equipoIds: await equiposDeTrabajo(context.supabase, data.id),
      fechaProgramada: patch.fecha_programada,
      duracionDias: (trabajoActual)?.duracion_dias ?? 1,
      excluirTrabajoId: data.id,
    });
    const tecnicoFinal = data.tecnico_id !== undefined
      ? (data.tecnico_id || null)
      : ((trabajoActual)?.tecnico_id ?? null);
    if (tecnicoFinal) {
      const dur = Math.max(1, Number((trabajoActual)?.duracion_dias ?? 1));
      const { data: conflictos } = await context.supabase.rpc("verificar_conflicto_tecnico", {
        _tecnico_id: tecnicoFinal,
        _fecha: patch.fecha_programada,
        _duracion_dias: dur,
        _excluir_trabajo_id: data.id,
      });
      if ((conflictos ?? []).length > 0) {
        throw new Error("CONFLICTO_TECNICO::" + JSON.stringify(conflictos));
      }
    }
    const { data: row, error } = await context.supabase
      .from("trabajos").update(patch).eq("id", data.id).select().single();
    if (error) throw new Error(error.message);
    // Notificar si hubo cambio de técnico
    const tecnicoPrev = (trabajoActual)?.tecnico_id ?? null;
    if (tecnicoFinal && tecnicoFinal !== tecnicoPrev) {
      try {
        const { notificarAsignacionTecnico } = await import("@/lib/notificaciones-tecnico.server");
        await notificarAsignacionTecnico({
          tecnicoId: tecnicoFinal,
          trabajoId: data.id,
          reasignacion: !!tecnicoPrev,
          asignadoPor: context.userId,
        }).catch(() => {});
      } catch { /* silenciar */ }
    }
    try {
      const { notificarEventoTrabajo } = await import("@/lib/notificaciones-eventos.server");
      await notificarEventoTrabajo({ evento: "reprogramado", trabajoId: data.id, actorId: context.userId }).catch(() => {});
    } catch { /* silenciar */ }
    if (excepcion) {
      try {
        const { notificarExcepcionNoLaborable } = await import("@/lib/emergencias.server");
        await notificarExcepcionNoLaborable({
          trabajoId: data.id,
          accion: "reprogramar",
          motivo: excepcion.motivo,
          justificacion: excepcion.justificacion,
          fechaISO: patch.fecha_programada,
          actorId: context.userId,
        });
      } catch { /* silenciar */ }
    }
    return row;
  });

// ---------------------------------------------------------------------------
// Reubicación automática: busca la siguiente jornada laborable disponible
// para el técnico asignado (o el que se pase por parámetro) y mueve la OT
// a esa fecha. Se usa cuando el usuario recibe un conflicto de agenda al
// arrastrar/reprogramar un trabajo y quiere continuar la programación sin
// interrupciones.
// ---------------------------------------------------------------------------
export const reubicarTrabajoDisponible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      desde: z.string().min(1),
      tecnico_id: z.string().uuid().nullable().optional(),
      max_dias: z.number().int().positive().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: trabajo } = await context.supabase
      .from("trabajos")
      .select("tecnico_id, duracion_dias, planta_id, servicio")
      .eq("id", data.id).single();
    const tecnicoFinal = data.tecnico_id !== undefined
      ? (data.tecnico_id || null)
      : ((trabajo)?.tecnico_id ?? null);
    const dur = Math.max(1, Number((trabajo)?.duracion_dias ?? 1));
    const { motivoNoLaborableSV } = await import("@/lib/dias-habiles");
    await ensureFeriadosCargados(context.supabase, data.desde);
    const cursor = new Date(data.desde);
    cursor.setUTCHours(13, 0, 0, 0); // ~07:00 SV
    const limite = data.max_dias ?? 60;
    for (let i = 0; i < limite; i++) {
      const fechaISO = cursor.toISOString();
      if (!motivoNoLaborableSV(fechaISO)) {
        // 1) Conflictos por equipos asignados
        const cf = await findRecursoConflicts(context.supabase, {
          equipoIds: await equiposDeTrabajo(context.supabase, data.id),
          fechaProgramada: fechaISO,
          duracionDias: dur,
          excluirTrabajoId: data.id,
        });
        // 2) Conflictos por técnico
        let sinTecnicoConflict = true;
        if (tecnicoFinal) {
          const { data: cts } = await context.supabase.rpc("verificar_conflicto_tecnico", {
            _tecnico_id: tecnicoFinal,
            _fecha: fechaISO,
            _duracion_dias: dur,
            _excluir_trabajo_id: data.id,
          });
          sinTecnicoConflict = (cts ?? []).length === 0;
        }
        if (cf.length === 0 && sinTecnicoConflict) {
          const patch: any = { fecha_programada: fechaISO };
          if (data.tecnico_id !== undefined) patch.tecnico_id = data.tecnico_id || null;
          const { data: row, error } = await context.supabase
            .from("trabajos").update(patch).eq("id", data.id).select().single();
          if (error) throw new Error(error.message);
          try {
            const { notificarEventoTrabajo } = await import("@/lib/notificaciones-eventos.server");
            await notificarEventoTrabajo({ evento: "reprogramado", trabajoId: data.id, actorId: context.userId }).catch(() => {});
          } catch { /* silenciar */ }
          return row;
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    throw new Error("No se encontró un día laborable disponible en los próximos " + limite + " días.");
  });

// ---------------------------------------------------------------------------
// Mover UN SOLO día de una OT multi-día hacia otra fecha, sin afectar los
// demás días. Se registra como excepción en `trabajo_dia_excepciones`.
// - fecha_original: la fecha (YYYY-MM-DD) del día del trabajo que se mueve
//   (una de las N fechas hábiles que ocupa la OT desde `fecha_programada`).
// - fecha_destino:  la nueva fecha (YYYY-MM-DD) a la que se traslada ese día.
// Si `fecha_destino === fecha_original` se elimina la excepción existente
// (equivale a devolver ese día a su ubicación base).
// ---------------------------------------------------------------------------
export const moverDiaTrabajo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      trabajo_id: z.string().uuid(),
      fecha_original: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fecha_destino: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      emergencia_no_laborable: z.boolean().optional(),
      emergencia_motivo: z.string().max(300).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { trabajo_id, fecha_original, fecha_destino } = data;

    // Validar día laborable en destino
    const destinoISO = new Date(`${fecha_destino}T13:00:00.000Z`).toISOString();
    const excepcion = fecha_original === fecha_destino
      ? null
      : await validarDiaLaborable(
          context.supabase,
          context.userId,
          destinoISO,
          { permitir: data.emergencia_no_laborable, motivo: data.emergencia_motivo },
          "mover el día",
        );

    // Si vuelve a su fecha original, borrar la excepción.
    if (fecha_original === fecha_destino) {
      await context.supabase
        .from("trabajo_dia_excepciones")
        .delete()
        .eq("trabajo_id", trabajo_id)
        .eq("fecha_original", fecha_original);
      return { trabajo_id, fecha_original, fecha_movida: null };
    }

    // Validar que los equipos de la OT estén libres en el día destino.
    await validarEquiposDisponibles(context.supabase, {
      equipoIds: await equiposDeTrabajo(context.supabase, trabajo_id),
      fechaProgramada: destinoISO,
      duracionDias: 1,
      excluirTrabajoId: trabajo_id,
    });

    if (excepcion) {
      const { data: actual } = await context.supabase
        .from("trabajos").select("notas").eq("id", trabajo_id).single();
      const nota = notaExcepcion(excepcion, destinoISO);
      await context.supabase
        .from("trabajos")
        .update({ notas: [String((actual)?.notas ?? "").trim(), nota].filter(Boolean).join("\n") })
        .eq("id", trabajo_id);
    }

    const { data: row, error } = await context.supabase
      .from("trabajo_dia_excepciones")
      .upsert(
        { trabajo_id, fecha_original, fecha_movida: fecha_destino },
        { onConflict: "trabajo_id,fecha_original" },
      )
      .select("trabajo_id, fecha_original, fecha_movida")
      .single();
    if (error) throw new Error(error.message);
    if (excepcion) {
      try {
        const { notificarExcepcionNoLaborable } = await import("@/lib/emergencias.server");
        await notificarExcepcionNoLaborable({
          trabajoId: trabajo_id,
          accion: "mover_dia",
          motivo: excepcion.motivo,
          justificacion: excepcion.justificacion,
          fechaISO: destinoISO,
          actorId: context.userId,
        });
      } catch { /* silenciar */ }
    }
    return row;
  });

// ============ Dashboard KPIs ============

// ============ Técnicos extra por trabajo ============

export const listTrabajoTecnicosExtra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trabajo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("trabajo_tecnicos")
      .select("tecnico_id, rol")
      .eq("trabajo_id", data.trabajo_id);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
