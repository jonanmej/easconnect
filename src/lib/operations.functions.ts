import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findCleaningClientConflicts, formatCleaningClientConflict } from "@/lib/scheduling";

/**
 * Precarga los feriados personalizados del año correspondiente a `fechaISO`
 * en el caché sincrónico de `dias-habiles`, de modo que las validaciones
 * subsiguientes (`motivoNoLaborableSV`) tengan en cuenta lo configurado por
 * los administradores en el módulo de Configuración.
 */
async function ensureFeriadosCargados(supabase: any, fechaISO: string) {
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

const ClienteEstado = z.enum(["activo", "revision", "pausado"]);

export const listClientes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clientes")
      .select("id, nombre, contacto, email, telefono, capacidad, estado, contrato_om, solo_capacitacion, cuota_preventivos, cuota_correctivos, cuota_menores, cuota_medios, cuota_mayores, cuota_limpiezas, color_acento, created_at")
      .order("nombre");
    if (error) throw new Error(error.message);
    // include planta count
    const { data: plantas } = await context.supabase
      .from("plantas")
      .select("cliente_id");
    const counts = new Map<string, number>();
    (plantas ?? []).forEach((p) => counts.set(p.cliente_id, (counts.get(p.cliente_id) ?? 0) + 1));
    return (data ?? []).map((c) => ({ ...c, plantas_count: counts.get(c.id) ?? 0 }));
  });

export const upsertCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      nombre: z.string().min(1),
      rut: z.string().nullable().optional(),
      contacto: z.string().nullable().optional(),
      email: z.string().email().nullable().optional().or(z.literal("")),
      telefono: z.string().nullable().optional(),
      capacidad: z.string().nullable().optional(),
      estado: ClienteEstado,
      contrato_om: z.coerce.boolean().optional(),
      solo_capacitacion: z.coerce.boolean().optional(),
      cuota_preventivos: z.coerce.number().int().min(0).optional(),
      cuota_correctivos: z.coerce.number().int().min(0).optional(),
      cuota_menores: z.coerce.number().int().min(0).optional(),
      cuota_medios: z.coerce.number().int().min(0).optional(),
      cuota_mayores: z.coerce.number().int().min(0).optional(),
      cuota_limpiezas: z.coerce.number().int().min(0).optional(),
      color_acento: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal("")),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, email, color_acento, ...rest } = data;
    const payload: any = { ...rest, email: email || null, color_acento: color_acento || null };
    const q = id
      ? context.supabase.from("clientes").update(payload).eq("id", id).select().single()
      : context.supabase.from("clientes").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("clientes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Plantas ============

export const listPlantas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("plantas")
      .select("id, nombre, ubicacion, paneles, capacidad, eficiencia, ultima_limpieza, cliente_id, notificaciones_completado, email_notificaciones, sla_horas_respuesta, sla_horas_resolucion, latitud, longitud, clientes(nombre)")
      .order("nombre");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      ...p,
      cliente_nombre: p.clientes?.nombre ?? "—",
    }));
  });

export const upsertPlanta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      nombre: z.string().min(1),
      cliente_id: z.string().uuid(),
      ubicacion: z.string().nullable().optional(),
      paneles: z.coerce.number().int().min(0).default(0),
      capacidad: z.string().nullable().optional(),
      eficiencia: z.coerce.number().min(0).max(100).nullable().optional(),
      notificaciones_completado: z.coerce.boolean().optional(),
      email_notificaciones: z.string().email().nullable().optional().or(z.literal("")),
      sla_horas_respuesta: z.coerce.number().int().min(0).nullable().optional(),
      sla_horas_resolucion: z.coerce.number().int().min(0).nullable().optional(),
      latitud: z.coerce.number().min(-90).max(90).nullable().optional(),
      longitud: z.coerce.number().min(-180).max(180).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, email_notificaciones, ...rest } = data;
    const payload: any = { ...rest };
    if (email_notificaciones !== undefined) payload.email_notificaciones = email_notificaciones || null;
    const q = id
      ? context.supabase.from("plantas").update(payload).eq("id", id).select().single()
      : context.supabase.from("plantas").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePlanta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("plantas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Importación masiva de plantas (CSV) ============

const PlantaImportRow = z.object({
  cliente: z.string().trim().min(1, "cliente requerido").max(200),
  planta: z.string().trim().min(1, "planta requerida").max(200),
  ubicacion: z.string().trim().max(300).optional().nullable(),
  paneles: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  capacidad: z.string().trim().max(50).optional().nullable(),
  email_notificaciones: z
    .string()
    .trim()
    .email("email inválido")
    .max(255)
    .optional()
    .nullable()
    .or(z.literal("")),
});

export const importPlantasCSV = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Solo staff (admin / supervisor) puede importar
    const [{ data: isAdmin }, { data: isSup }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" }),
    ]);
    if (!isAdmin && !isSup) throw new Error("Solo admin o supervisor pueden importar plantas");

    const { data: clientes, error: ec } = await context.supabase
      .from("clientes")
      .select("id, nombre");
    if (ec) throw new Error(ec.message);
    const clientesByName = new Map<string, string>();
    (clientes ?? []).forEach((c) => clientesByName.set(c.nombre.trim().toLowerCase(), c.id));

    const { data: plantasExist, error: ep } = await context.supabase
      .from("plantas")
      .select("id, nombre, cliente_id");
    if (ep) throw new Error(ep.message);
    const plantaKey = (cliente_id: string, nombre: string) =>
      `${cliente_id}::${nombre.trim().toLowerCase()}`;
    const plantasMap = new Map<string, string>();
    (plantasExist ?? []).forEach((p: any) =>
      plantasMap.set(plantaKey(p.cliente_id, p.nombre), p.id),
    );

    const errores: { fila: number; error: string }[] = [];
    const insertar: any[] = [];
    const actualizar: { id: string; payload: any }[] = [];

    data.rows.forEach((raw, idx) => {
      const fila = idx + 2; // +1 header, +1 base-1
      // Normaliza claves (case-insensitive, sin acentos)
      const norm: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        norm[k.trim().toLowerCase()] = typeof v === "string" ? v.trim() : v;
      }
      const parsed = PlantaImportRow.safeParse({
        cliente: norm["cliente"],
        planta: norm["planta"],
        ubicacion: norm["ubicacion"] || null,
        paneles: norm["paneles"] === "" || norm["paneles"] == null ? null : norm["paneles"],
        capacidad: norm["capacidad"] || null,
        email_notificaciones: norm["email_notificaciones"] || norm["email"] || null,
      });
      if (!parsed.success) {
        errores.push({ fila, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
        return;
      }
      const row = parsed.data;
      const cliId = clientesByName.get(row.cliente.toLowerCase());
      if (!cliId) {
        errores.push({ fila, error: `Cliente no encontrado: "${row.cliente}"` });
        return;
      }
      const existId = plantasMap.get(plantaKey(cliId, row.planta));
      const payload: any = {
        nombre: row.planta,
        cliente_id: cliId,
        ubicacion: row.ubicacion || null,
        paneles: row.paneles ?? 0,
        capacidad: row.capacidad || null,
        email_notificaciones: row.email_notificaciones || null,
      };
      if (existId) {
        actualizar.push({ id: existId, payload });
      } else {
        insertar.push(payload);
      }
    });

    let creadas = 0;
    let actualizadas = 0;

    if (insertar.length) {
      const { error: ei, data: ins } = await context.supabase
        .from("plantas")
        .insert(insertar)
        .select("id");
      if (ei) throw new Error(`Error al insertar: ${ei.message}`);
      creadas = ins?.length ?? insertar.length;
    }
    for (const u of actualizar) {
      const { error: eu } = await context.supabase
        .from("plantas")
        .update(u.payload)
        .eq("id", u.id);
      if (eu) {
        errores.push({ fila: 0, error: `Update ${u.id}: ${eu.message}` });
      } else {
        actualizadas++;
      }
    }

    return {
      total: data.rows.length,
      creadas,
      actualizadas,
      errores,
    };
  });

// ============ Equipos ============

const EquipoEstado = z.enum(["operativo", "mantenimiento", "disponible", "fuera_servicio"]);

export const listEquipos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("equipos")
      .select("id, codigo, nombre, tipo, estado, salud, ubicacion, planta_id, plantas(nombre)")
      .order("codigo");
    if (error) throw new Error(error.message);
    return (data ?? []).map((e: any) => ({
      ...e,
      planta_nombre: e.plantas?.nombre ?? null,
    }));
  });

export const upsertEquipo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      codigo: z.string().nullable().optional(),
      nombre: z.string().min(1),
      tipo: z.string().min(1),
      estado: EquipoEstado,
      salud: z.coerce.number().int().min(0).max(100).nullable().optional(),
      planta_id: z.string().uuid().nullable().optional(),
      ubicacion: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const payload: any = { ...rest, planta_id: rest.planta_id || null };
    if (!id && (!payload.codigo || payload.codigo === "")) {
      delete payload.codigo; // dejar que el trigger lo autogenere
    }
    if (id && !payload.codigo) delete payload.codigo;
    const q = id
      ? context.supabase.from("equipos").update(payload).eq("id", id).select().single()
      : context.supabase.from("equipos").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEquipo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("equipos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Trabajos ============

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
    return (data ?? []).map((t: any) => ({
      ...t,
      planta_nombre: t.plantas?.nombre ?? "—",
      cliente_nombre: t.plantas?.clientes?.nombre ?? "—",
      cliente_id: t.plantas?.cliente_id ?? null,
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
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, equipo_ids, tecnicos_extra_ids, ...rest } = data;
    const payload = {
      ...rest,
      equipo_id: rest.equipo_id || (equipo_ids && equipo_ids[0]) || null,
      tecnico_id: rest.tecnico_id || null,
      fecha_programada: new Date(rest.fecha_programada).toISOString(),
    };
    {
      await ensureFeriadosCargados(context.supabase, payload.fecha_programada);
      const { motivoNoLaborableSV } = await import("@/lib/dias-habiles");
      const motivo = motivoNoLaborableSV(payload.fecha_programada);
      if (motivo) {
        throw new Error(
          motivo === "feriado"
            ? "No se pueden programar trabajos en un día feriado."
            : "No se pueden programar trabajos en sábado o domingo.",
        );
      }
    }
    let estadoPrevio: string | null = null;
    let tecnicoPrevio: string | null = null;
    if (id) {
      const { data: prev } = await context.supabase
        .from("trabajos").select("estado, tecnico_id").eq("id", id).single();
      estadoPrevio = (prev as any)?.estado ?? null;
      tecnicoPrevio = (prev as any)?.tecnico_id ?? null;
    }
    const conflictosLimpieza = await findCleaningClientConflicts(context.supabase, {
      plantaId: rest.planta_id,
      servicio: rest.servicio,
      fechaProgramada: payload.fecha_programada,
      duracionDias: rest.duracion_dias ?? 1,
      excluirTrabajoId: id ?? null,
    });
    if (conflictosLimpieza.length > 0) {
      throw new Error(formatCleaningClientConflict(conflictosLimpieza));
    }
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
          excluirUserId: context.userId,
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
    // Notificar evento de trabajo (creado / reprogramado / cancelado)
    try {
      const { notificarEventoTrabajo } = await import("@/lib/notificaciones-eventos.server");
      const trabajoId = (row as any).id as string;
      const evento = !id
        ? "creado"
        : (rest.estado === "cancelado" && estadoPrevio !== "cancelado")
          ? "cancelado"
          : "reprogramado";
      // Emitimos "reprogramado" solo si realmente cambió la fecha o hubo edición relevante.
      // Para simplificar, notificamos siempre en updates: reduce ruido dedupe in-app en cliente.
      await notificarEventoTrabajo({ evento, trabajoId, actorId: context.userId }).catch(() => {});
    } catch { /* silenciar */ }
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
          const { recalcularFechaInicioContrato } = await import("./contratos.functions");
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
    let nameMap: Record<string, string> = {};
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

export const reprogramarTrabajo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      fecha_programada: z.string().min(1),
      tecnico_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: any = { fecha_programada: new Date(data.fecha_programada).toISOString() };
    if (data.tecnico_id !== undefined) patch.tecnico_id = data.tecnico_id || null;
    await ensureFeriadosCargados(context.supabase, patch.fecha_programada);
    const { motivoNoLaborableSV } = await import("@/lib/dias-habiles");
    const motivo = motivoNoLaborableSV(patch.fecha_programada);
    if (motivo) {
      throw new Error(
        motivo === "feriado"
          ? "No se puede reprogramar a un día feriado."
          : "No se puede reprogramar a sábado o domingo.",
      );
    }
    // Validar conflicto si hay técnico (existente o nuevo)
    const { data: trabajoActual } = await context.supabase
      .from("trabajos").select("tecnico_id, duracion_dias, planta_id, servicio").eq("id", data.id).single();
    const conflictosLimpieza = await findCleaningClientConflicts(context.supabase, {
      plantaId: (trabajoActual as any)?.planta_id,
      servicio: (trabajoActual as any)?.servicio,
      fechaProgramada: patch.fecha_programada,
      duracionDias: (trabajoActual as any)?.duracion_dias ?? 1,
      excluirTrabajoId: data.id,
    });
    if (conflictosLimpieza.length > 0) {
      throw new Error(formatCleaningClientConflict(conflictosLimpieza));
    }
    const tecnicoFinal = data.tecnico_id !== undefined
      ? (data.tecnico_id || null)
      : ((trabajoActual as any)?.tecnico_id ?? null);
    if (tecnicoFinal) {
      const dur = Math.max(1, Number((trabajoActual as any)?.duracion_dias ?? 1));
      const { data: conflictos } = await context.supabase.rpc("verificar_conflicto_tecnico" as any, {
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
    const tecnicoPrev = (trabajoActual as any)?.tecnico_id ?? null;
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
      : ((trabajo as any)?.tecnico_id ?? null);
    const dur = Math.max(1, Number((trabajo as any)?.duracion_dias ?? 1));
    const { motivoNoLaborableSV } = await import("@/lib/dias-habiles");
    await ensureFeriadosCargados(context.supabase, data.desde);
    const cursor = new Date(data.desde);
    cursor.setUTCHours(13, 0, 0, 0); // ~07:00 SV
    const limite = data.max_dias ?? 60;
    for (let i = 0; i < limite; i++) {
      const fechaISO = cursor.toISOString();
      if (!motivoNoLaborableSV(fechaISO)) {
        // 1) Conflictos por cliente/servicio (limpieza mismo día, otro cliente)
        const cf = await findCleaningClientConflicts(context.supabase, {
          plantaId: (trabajo as any)?.planta_id,
          servicio: (trabajo as any)?.servicio,
          fechaProgramada: fechaISO,
          duracionDias: dur,
          excluirTrabajoId: data.id,
        });
        // 2) Conflictos por técnico
        let sinTecnicoConflict = true;
        if (tecnicoFinal) {
          const { data: cts } = await context.supabase.rpc("verificar_conflicto_tecnico" as any, {
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

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Una sola ida y vuelta a la base de datos (RPC agregada) — mucho más rápido cuando hay muchas OTs.
    const { data, error } = await context.supabase.rpc("dashboard_kpis_v1" as any);
    if (error) throw new Error(error.message);
    const k: any = data ?? {};
    const paneles_parque = Number(k.paneles_parque ?? 0);
    const paneles_limpiados = Number(k.paneles_limpiados ?? 0);

    // ---- Ajustes de negocio ----
    // Días hábiles SV: si hoy es sábado, domingo o feriado, "Trabajos hoy"
    // se pausa y se comunica el próximo día hábil.
    const { ahoraSV, esNoLaborableSV, siguienteDiaHabilSV, formatearDiaHabilSV } =
      await import("@/lib/dias-habiles");
    const nowSv = ahoraSV();
    const hoySv = new Date(nowSv); hoySv.setHours(0, 0, 0, 0);
    const dia_no_laborable = esNoLaborableSV(hoySv);
    let trabajos_hoy = 0;
    let siguiente_dia_habil: string | null = null;
    if (dia_no_laborable) {
      const proximo = siguienteDiaHabilSV(hoySv, false);
      siguiente_dia_habil = formatearDiaHabilSV(proximo);
    } else {
      const refStart = hoySv.getTime();
      const refEnd = refStart + 86400000;
      const { data: trabajosRef } = await context.supabase
        .from("trabajos")
        .select("id, fecha_programada, duracion_dias, estado")
        .neq("estado", "cancelado");
      trabajos_hoy = (trabajosRef ?? []).filter((t: any) => {
        const start = new Date(t.fecha_programada).getTime();
        const dur = Math.max(1, Number(t.duracion_dias ?? 1));
        const end = start + dur * 86400000;
        return start < refEnd && end > refStart;
      }).length;
    }

    // "Avance de limpieza" = paneles limpiados acumulados / total de paneles
    // instalados en las plantas que tienen una OT de limpieza EN PROGRESO.
    const { data: trabProg } = await context.supabase
      .from("trabajos")
      .select("id, planta_id, servicio")
      .eq("estado", "en_progreso")
      .ilike("servicio", "%limpieza%");
    const plantasEnProgreso = new Set<string>();
    const trabajosProgresoIds = new Set<string>();
    for (const t of (trabProg ?? []) as any[]) {
      if (t.planta_id) plantasEnProgreso.add(t.planta_id);
      trabajosProgresoIds.add(t.id);
    }
    let limpiadosProgreso = 0;
    let parqueProgreso = 0;
    if (trabajosProgresoIds.size > 0) {
      const ids = Array.from(trabajosProgresoIds);
      const [{ data: repDiarios }, { data: repBase }, { data: plantasRows }] = await Promise.all([
        context.supabase
          .from("trabajo_reportes_diarios")
          .select("paneles_limpiados, trabajo_id")
          .in("trabajo_id", ids)
          .not("paneles_limpiados", "is", null),
        context.supabase
          .from("trabajo_reportes")
          .select("paneles_limpiados, trabajo_id")
          .in("trabajo_id", ids)
          .not("paneles_limpiados", "is", null),
        context.supabase
          .from("plantas")
          .select("id, paneles")
          .in("id", Array.from(plantasEnProgreso)),
      ]);
      for (const r of [...(repDiarios ?? []), ...(repBase ?? [])] as any[]) {
        limpiadosProgreso += Number(r.paneles_limpiados ?? 0);
      }
      parqueProgreso = (plantasRows ?? []).reduce((s: number, p: any) => s + Number(p.paneles ?? 0), 0);
    }
    const avance_limpieza = parqueProgreso > 0
      ? Math.min(100, Math.round((limpiadosProgreso / parqueProgreso) * 100))
      : 0;

    return {
      trabajos_hoy,
      dia_no_laborable,
      siguiente_dia_habil,
      equipos_operativos: Number(k.equipos_operativos ?? 0),
      equipos_total: Number(k.equipos_total ?? 0),
      eficiencia: String(k.eficiencia ?? "--"),
      alertas: Number(k.alertas ?? 0),
      trabajos_total: Number(k.trabajos_total ?? 0),
      inv_bajo_stock: Number(k.inv_bajo_stock ?? 0),
      reportes_borrador: Number(k.reportes_borrador ?? 0),
      paneles_limpiados,
      paneles_parque,
      avance_limpieza,
      avance_limpiados: limpiadosProgreso,
      avance_parque: parqueProgreso,
      agua_galones: Number(k.agua_galones ?? 0),
      anomalias_detectadas: Number(k.anomalias_detectadas ?? 0),
    };
  });