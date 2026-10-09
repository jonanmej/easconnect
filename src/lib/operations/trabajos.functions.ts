import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRol, INTERNO } from "@/lib/auth-roles";
import { validarEquiposDisponibles, validarDiaLaborable, notaExcepcion } from "./helpers";

const TrabajoEstado = z.enum(["programado", "en_progreso", "completado", "cancelado"]);

export const listTrabajos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trabajos")
      .select(
        "id, folio, servicio, fecha_programada, fecha_completado, estado, notas, planta_id, equipo_id, tecnico_id, firmado_at, firmado_por, auto_generado, contrato_id, ciclo_numero, duracion_dias, plantas(nombre, cliente_id, clientes(nombre))",
      )
      .order("fecha_programada", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((t: any) => t.id);
    const excepcionesPorTrabajo: Record<string, Array<{ fecha_original: string; fecha_movida: string }>> = {};
    const tecnicosPorTrabajo: Record<string, string[]> = {};
    if (ids.length > 0) {
      const { data: excs } = await context.supabase
        .from("trabajo_dia_excepciones")
        .select("trabajo_id, fecha_original, fecha_movida")
        .in("trabajo_id", ids);
      (excs ?? []).forEach((e: any) => {
        (excepcionesPorTrabajo[e.trabajo_id] ??= []).push({
          fecha_original: e.fecha_original,
          fecha_movida: e.fecha_movida,
        });
      });
      const { data: tts } = await context.supabase
        .from("trabajo_tecnicos")
        .select("trabajo_id, tecnico_id")
        .in("trabajo_id", ids);
      (tts ?? []).forEach((r: any) => {
        (tecnicosPorTrabajo[r.trabajo_id] ??= []).push(r.tecnico_id);
      });
    }
    return (data ?? []).map((t: any) => ({
      ...t,
      planta_nombre: t.plantas?.nombre ?? "—",
      cliente_nombre: t.plantas?.clientes?.nombre ?? "—",
      cliente_id: t.plantas?.cliente_id ?? null,
      excepciones_dia: excepcionesPorTrabajo[t.id] ?? [],
      tecnicos_ids: Array.from(
        new Set([...(t.tecnico_id ? [t.tecnico_id] : []), ...(tecnicosPorTrabajo[t.id] ?? [])]),
      ),
    }));
  });

export const upsertTrabajo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      planta_id: z.string().uuid(),
      equipo_id: z.string().uuid().nullable().optional(),
      equipo_ids: z.array(z.string().uuid()).optional(),
      servicio: z.string().min(1),
      fecha_programada: z.string(),
      estado: TrabajoEstado,
      tecnico_id: z.string().uuid().nullable().optional(),
      tecnicos_extra_ids: z.array(z.string().uuid()).optional(),
      notas: z.string().nullable().optional(),
      duracion_dias: z.coerce.number().int().min(1).max(60).optional(),
      origen: z.enum(["staff", "cliente"]).optional(),
      emergencia_no_laborable: z.boolean().optional(),
      emergencia_motivo: z.string().max(300).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const {
      id, equipo_ids, tecnicos_extra_ids,
      emergencia_no_laborable, emergencia_motivo,
      ...rest
    } = data;
    const payload = {
      ...rest,
      equipo_id: rest.equipo_id || (equipo_ids && equipo_ids[0]) || null,
      tecnico_id: rest.tecnico_id || null,
      fecha_programada: new Date(rest.fecha_programada).toISOString(),
    };
    let estadoPrevio: string | null = null;
    let tecnicoPrevio: string | null = null;
    let fechaPrevia: string | null = null;
    if (id) {
      const { data: prev } = await context.supabase
        .from("trabajos").select("estado, tecnico_id, fecha_programada").eq("id", id).single();
      estadoPrevio = (prev as any)?.estado ?? null;
      tecnicoPrevio = (prev as any)?.tecnico_id ?? null;
      fechaPrevia = (prev as any)?.fecha_programada ?? null;
    }
    // Solo se exige la autorización de día no laborable cuando la fecha cambia
    // (o al crear la OT). Si la OT ya estaba autorizada en ese día, cualquier
    // otra edición —iniciar, completar, asignar técnico— no vuelve a pedirla.
    const { diaKeyTZ: diaKeyExc } = await import("@/lib/hoy-config");
    const fechaCambio =
      !id ||
      !fechaPrevia ||
      diaKeyExc(new Date(fechaPrevia)) !== diaKeyExc(new Date(payload.fecha_programada));
    const excepcion = fechaCambio
      ? await validarDiaLaborable(
          context.supabase,
          context.userId,
          payload.fecha_programada,
          { permitir: emergencia_no_laborable, motivo: emergencia_motivo },
          "programar trabajos",
        )
      : null;
    if (excepcion) {
      const nota = notaExcepcion(excepcion, payload.fecha_programada);
      payload.notas = [payload.notas?.trim(), nota].filter(Boolean).join("\n");
    }
    // Varios clientes pueden programarse el mismo día o semana; solo se valida
    // que no se repitan los equipos seleccionados.
    await validarEquiposDisponibles(context.supabase, {
      equipoIds: [payload.equipo_id, ...(equipo_ids ?? [])],
      fechaProgramada: payload.fecha_programada,
      duracionDias: rest.duracion_dias ?? 1,
      excluirTrabajoId: id ?? null,
    });
    // Validar conflicto de técnico (no permitir solapamientos con otros trabajos del mismo técnico)
    if (payload.tecnico_id) {
      const dur = Math.max(1, Number(rest.duracion_dias ?? 1));
      const { data: conflictos, error: cErr } = await context.supabase.rpc("verificar_conflicto_tecnico" as any, {
        _tecnico_id: payload.tecnico_id,
        _fecha: payload.fecha_programada,
        _duracion_dias: dur,
        _excluir_trabajo_id: id ?? null,
      });
      if (cErr) throw new Error(cErr.message);
      if ((conflictos ?? []).length > 0) {
        throw new Error("CONFLICTO_TECNICO::" + JSON.stringify(conflictos));
      }
    }
    const q = id
      ? context.supabase.from("trabajos").update(payload).eq("id", id).select().single()
      : context.supabase.from("trabajos").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    // Sincronizar asignaciones múltiples (trabajo_equipos)
    if (equipo_ids) {
      const trabajoId = (row as any).id;
      await context.supabase.from("trabajo_equipos").delete().eq("trabajo_id", trabajoId);
      if (equipo_ids.length > 0) {
        const rows = equipo_ids.map((eid) => ({ trabajo_id: trabajoId, equipo_id: eid }));
        const { error: errIns } = await context.supabase.from("trabajo_equipos").insert(rows);
        if (errIns) throw new Error(errIns.message);
      }
    }
    // Sincronizar técnicos adicionales (trabajo_tecnicos)
    if (tecnicos_extra_ids) {
      const trabajoId = (row as any).id;
      // Validar conflictos de cada técnico extra
      const dur = Math.max(1, Number(rest.duracion_dias ?? 1));
      for (const tid of tecnicos_extra_ids) {
        if (!tid || tid === payload.tecnico_id) continue;
        const { data: cfx, error: cfxErr } = await context.supabase.rpc("verificar_conflicto_tecnico" as any, {
          _tecnico_id: tid,
          _fecha: payload.fecha_programada,
          _duracion_dias: dur,
          _excluir_trabajo_id: trabajoId,
        });
        if (cfxErr) throw new Error(cfxErr.message);
        if ((cfx ?? []).length > 0) {
          throw new Error("CONFLICTO_TECNICO::" + JSON.stringify(cfx));
        }
      }
      await context.supabase.from("trabajo_tecnicos").delete().eq("trabajo_id", trabajoId);
      const limpios = Array.from(new Set(tecnicos_extra_ids.filter((t) => t && t !== payload.tecnico_id)));
      if (limpios.length > 0) {
        const rows = limpios.map((tid) => ({ trabajo_id: trabajoId, tecnico_id: tid, created_by: context.userId }));
        const { error: errInsT } = await context.supabase.from("trabajo_tecnicos").insert(rows);
        if (errInsT) throw new Error(errInsT.message);
        // Notificar a cada técnico extra nuevo
        try {
          const { notificarAsignacionTecnico } = await import("@/lib/notificaciones-tecnico.server");
          for (const tid of limpios) {
            await notificarAsignacionTecnico({
              tecnicoId: tid,
              trabajoId,
              reasignacion: false,
              asignadoPor: context.userId,
            }).catch(() => {});
          }
        } catch { /* silenciar */ }
      }
    }
    // Aviso a admins/supervisores cuando se autorizó un día no laborable
    if (excepcion) {
      try {
        const { notificarExcepcionNoLaborable } = await import("@/lib/emergencias.server");
        await notificarExcepcionNoLaborable({
          trabajoId: (row as any).id,
          accion: id ? "reprogramar" : "programar",
          motivo: excepcion.motivo,
          justificacion: excepcion.justificacion,
          fechaISO: payload.fecha_programada,
          actorId: context.userId,
        });
      } catch { /* silenciar */ }
    }
    // Aviso a admins/supervisores cuando el técnico inicia el trabajo
    if (id && rest.estado === "en_progreso" && estadoPrevio !== "en_progreso") {
      try {
        const { notificarStaff } = await import("@/lib/notificaciones-staff.server");
        const folio = (row as any)?.folio ?? id.slice(0, 8);
        await notificarStaff({
          tipo: "trabajo_iniciado",
          titulo: `Trabajo ${folio} iniciado`,
          mensaje: `El técnico inició el trabajo ${folio} (${rest.servicio ?? ""}).`,
          trabajo_id: id,
          excluirUserId: null,
        });
      } catch { /* silenciar */ }
    }
    // Notificación automática al cliente cuando un trabajo pasa a "completado"
    if (id && rest.estado === "completado" && estadoPrevio !== "completado") {
      try {
        const { data: planta } = await context.supabase
          .from("plantas").select("notificaciones_completado, email_notificaciones")
          .eq("id", rest.planta_id).single();
        if ((planta as any)?.notificaciones_completado && (planta as any)?.email_notificaciones) {
          const { enviarNotificacionTrabajo } = await import("@/lib/notificaciones.functions");
          await enviarNotificacionTrabajo({ data: { trabajo_id: id } } as any).catch(() => {});
        }
      } catch {/* silenciar errores de notificación para no bloquear el guardado */}
      // Notificar a admins/supervisores que el trabajo fue completado
      try {
        const { notificarStaff } = await import("@/lib/notificaciones-staff.server");
        const folio = (row as any)?.folio ?? id.slice(0, 8);
        await notificarStaff({
          tipo: "trabajo_completado",
          titulo: `Trabajo ${folio} completado`,
          mensaje: `El técnico finalizó el trabajo ${folio} (${rest.servicio ?? ""}).`,
          trabajo_id: id,
          excluirUserId: null,
        });
      } catch { /* silenciar */ }
    }
    // Notificación al técnico cuando se le asigna o reasigna un trabajo
    if (payload.tecnico_id && payload.tecnico_id !== tecnicoPrevio) {
      try {
        const { notificarAsignacionTecnico } = await import("@/lib/notificaciones-tecnico.server");
        await notificarAsignacionTecnico({
          tecnicoId: payload.tecnico_id,
          trabajoId: (row as any).id,
          reasignacion: !!tecnicoPrevio,
          asignadoPor: context.userId,
        }).catch(() => {});
      } catch { /* silenciar */ }
    }
    // Notificar evento de trabajo (creado / reprogramado / cancelado).
    // Regla: los técnicos solo reciben aviso cuando el trabajo se crea, se
    // cancela o cambia su fecha de inicio. Otras ediciones (agregar o quitar
    // técnicos, cambio de estado, notas) NO generan correo.
    const cancelado = !!id && rest.estado === "cancelado" && estadoPrevio !== "cancelado";
    const evento: "creado" | "cancelado" | "reprogramado" | null = !id
      ? "creado"
      : cancelado
        ? "cancelado"
        : fechaCambio
          ? "reprogramado"
          : null;
    if (evento) {
      try {
        const { notificarEventoTrabajo } = await import("@/lib/notificaciones-eventos.server");
        await notificarEventoTrabajo({ evento, trabajoId: (row as any).id as string, actorId: context.userId }).catch(() => {});
      } catch { /* silenciar */ }
    }
    return row;
  });

export const deleteTrabajo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    try {
      const { notificarEventoTrabajo } = await import("@/lib/notificaciones-eventos.server");
      await notificarEventoTrabajo({ evento: "cancelado", trabajoId: data.id, actorId: context.userId }).catch(() => {});
    } catch { /* silenciar */ }
    const { error } = await context.supabase.from("trabajos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Registro de trabajos históricos (ejecutados antes de existir la app).
// Solo admin/supervisor. Inserta directamente como completado, sin verificación
// de conflicto de técnico ni notificaciones automáticas.
export const crearTrabajoHistorico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      planta_id: z.string().uuid(),
      servicio: z.string().min(1),
      fecha: z.string().min(1),
      notas: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Autorizar: admin o supervisor
    const [{ data: isAdmin }, { data: isSup }] = await Promise.all([
      context.supabase.rpc("has_role" as any, { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role" as any, { _user_id: context.userId, _role: "supervisor" }),
    ]);
    if (!isAdmin && !isSup) throw new Error("No autorizado");

    // Interpretar la fecha como local (mediodía) para evitar el corrimiento
    // de un día que ocurre al parsear "YYYY-MM-DD" como UTC medianoche
    // y luego mostrarlo en zonas al oeste de UTC (p. ej. UTC-6).
    const raw = String(data.fecha);
    const local = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T12:00:00`)
      : new Date(raw);
    const fechaIso = local.toISOString();
    const notasFinal = `[HISTÓRICO] ${data.notas ?? ""}`.trim();
    const { data: row, error } = await context.supabase
      .from("trabajos")
      .insert({
        planta_id: data.planta_id,
        servicio: data.servicio,
        fecha_programada: fechaIso,
        fecha_completado: fechaIso,
        estado: "completado",
        notas: notasFinal,
        duracion_dias: 1,
        auto_generado: false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Vincular al contrato activo del año que coincida con planta + servicio,
    // si existe y aún tiene ciclos disponibles. Esto asegura que los trabajos
    // históricos cuenten en el cumplimiento anual y desplacen el inicio del
    // contrato a la primera fecha ejecutada.
    try {
      const anio = new Date(fechaIso).getUTCFullYear();
      const { data: contrato } = await context.supabase
        .from("contratos_servicio")
        .select("id, cantidad_anual")
        .eq("planta_id", data.planta_id)
        .eq("servicio", data.servicio)
        .eq("activo", true)
        .eq("anio", anio)
        .maybeSingle();
      if (contrato) {
        const { data: vinculados } = await context.supabase
          .from("trabajos")
          .select("ciclo_numero")
          .eq("contrato_id", (contrato as any).id);
        const ocupados = new Set<number>(
          (vinculados ?? []).map((r: any) => r.ciclo_numero).filter((n: any) => n != null),
        );
        let ciclo = 1;
        while (ocupados.has(ciclo) && ciclo <= (contrato as any).cantidad_anual) ciclo++;
        if (ciclo <= (contrato as any).cantidad_anual) {
          await context.supabase
            .from("trabajos")
            .update({ contrato_id: (contrato as any).id, ciclo_numero: ciclo })
            .eq("id", (row as any).id);
          const { recalcularFechaInicioContrato } = await import("@/lib/contratos.functions");
          await recalcularFechaInicioContrato(context.supabase, (contrato as any).id);
        }
      }
    } catch (e) {
      console.error("[historico] vinculación a contrato falló", e);
    }

    return row;
  });

export const listTecnicos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Solo personal interno: un cliente no necesita la lista de técnicos.
    const misRoles = await requireRol(context.supabase, context.userId, ["admin", "supervisor", "tecnico", "cliente"]);
    if (!misRoles.some((r) => INTERNO.includes(r))) return [];
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["tecnico", "supervisor"]);
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (userIds.length === 0) return [];
    // Cross-check contra auth.users para excluir cuentas desvinculadas (orphan roles).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const validIds = new Set((authList?.users ?? []).map((u: any) => u.id));
    const activeIds = userIds.filter((id) => validIds.has(id));
    if (activeIds.length === 0) return [];
    const { data: profs, error: pErr } = await context.supabase
      .from("profiles")
      .select("id, display_name, nombres, apellidos")
      .in("id", activeIds);
    if (pErr) throw new Error(pErr.message);
    const profMap = new Map<string, any>();
    (profs ?? []).forEach((p: any) => profMap.set(p.id, p));
    const out: { id: string; nombre: string }[] = activeIds.map((id) => {
      const p = profMap.get(id);
      const full = p ? [p.nombres, p.apellidos].filter(Boolean).join(" ").trim() : "";
      return { id, nombre: full || p?.display_name || id.slice(0, 8) };
    });
    return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

/** Verifica si un técnico tiene conflicto en un rango. Devuelve [] si está libre. */
export const verificarConflictoTecnico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tecnico_id: z.string().uuid(),
      fecha: z.string().min(1),
      duracion_dias: z.coerce.number().int().min(1).max(60).default(1),
      excluir_trabajo_id: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase.rpc("verificar_conflicto_tecnico" as any, {
      _tecnico_id: data.tecnico_id,
      _fecha: new Date(data.fecha).toISOString(),
      _duracion_dias: data.duracion_dias,
      _excluir_trabajo_id: data.excluir_trabajo_id ?? null,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as { id: string; folio: string; fecha_programada: string; duracion_dias: number }[];
  });

/** Historial de reasignaciones de un trabajo. */
export const listAsignacionesLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trabajo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("trabajo_asignaciones_log")
      .select("id, tecnico_anterior, tecnico_nuevo, asignado_por, motivo, created_at")
      .eq("trabajo_id", data.trabajo_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = new Set<string>();
    (rows ?? []).forEach((r: any) => {
      if (r.tecnico_anterior) ids.add(r.tecnico_anterior);
      if (r.tecnico_nuevo) ids.add(r.tecnico_nuevo);
      if (r.asignado_por) ids.add(r.asignado_por);
    });
    const nameMap: Record<string, string> = {};
    if (ids.size) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, display_name, nombres, apellidos")
        .in("id", Array.from(ids));
      (profs ?? []).forEach((p: any) => {
        const full = [p.nombres, p.apellidos].filter(Boolean).join(" ").trim();
        nameMap[p.id] = full || p.display_name || p.id.slice(0, 8);
      });
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      tecnico_anterior_nombre: r.tecnico_anterior ? (nameMap[r.tecnico_anterior] ?? "—") : null,
      tecnico_nuevo_nombre: r.tecnico_nuevo ? (nameMap[r.tecnico_nuevo] ?? "—") : "Sin asignar",
      asignado_por_nombre: r.asignado_por ? (nameMap[r.asignado_por] ?? "—") : "Sistema",
    }));
  });
