import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findCleaningClientConflicts, formatCleaningClientConflict, isCleaningService } from "@/lib/scheduling";

const SERVICIOS_NO_CONTRATABLES = new Set(["Falla", "Emergencia", "Inspección"]);

function toIsoStartOfDay(dateStr: string) {
  // dateStr YYYY-MM-DD
  const d = new Date(dateStr + "T08:00:00Z");
  return d.toISOString();
}

function addDaysDate(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Lista contratos visibles para el usuario (RLS). */
export const listContratos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const anio = new Date().getFullYear();
    const { data, error } = await context.supabase
      .from("contratos_servicio")
      .select("id, planta_id, servicio, cantidad_anual, anio, fecha_inicio, duracion_dias_default, activo, plantas(nombre, clientes(nombre))")
      .eq("anio", anio);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((r: any) => ({
        ...r,
        planta_nombre: r.plantas?.nombre ?? "—",
        cliente_nombre: r.plantas?.clientes?.nombre ?? "—",
      }))
      .sort((a: any, b: any) =>
        String(a.cliente_nombre).localeCompare(String(b.cliente_nombre), "es", { sensitivity: "base" }) ||
        String(a.planta_nombre).localeCompare(String(b.planta_nombre), "es", { sensitivity: "base" }) ||
        String(a.servicio).localeCompare(String(b.servicio), "es", { sensitivity: "base" }),
      );
  });

/** Crea o actualiza un contrato (staff). */
export const upsertContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      planta_id: z.string().uuid(),
      servicio: z.string().min(1).max(120),
      cantidad_anual: z.coerce.number().int().min(1).max(365),
      anio: z.coerce.number().int().min(2020).max(2100).optional(),
      fecha_inicio: z.string().min(1),
      duracion_dias_default: z.coerce.number().int().min(1).max(60).optional(),
      activo: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (SERVICIOS_NO_CONTRATABLES.has(data.servicio.trim())) {
      throw new Error(
        `El servicio "${data.servicio}" no puede registrarse como contrato (es un evento puntual, no recurrente).`,
      );
    }
    const payload = {
      planta_id: data.planta_id,
      servicio: data.servicio,
      cantidad_anual: data.cantidad_anual,
      anio: data.anio ?? new Date().getFullYear(),
      fecha_inicio: data.fecha_inicio,
      duracion_dias_default: data.duracion_dias_default ?? 1,
      activo: data.activo ?? true,
    };
    const q = data.id
      ? context.supabase.from("contratos_servicio").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("contratos_servicio").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);

    // Si se actualizó un contrato existente, propagar la nueva duración a los
    // trabajos aún no ejecutados (programados) de ese contrato. Sin esto, la
    // vista de programación seguiría mostrando la duración antigua.
    if (data.id) {
      const { error: upErr } = await context.supabase
        .from("trabajos")
        .update({ duracion_dias: payload.duracion_dias_default })
        .eq("contrato_id", data.id)
        .eq("estado", "programado");
      if (upErr) console.error("[contratos] Error propagando duración a trabajos", upErr);
    }

    // Continuidad histórica: vincular trabajos completados previos (sin contrato)
    // de la misma planta + servicio dentro del año del contrato, ocupando los
    // primeros ciclos. Esto permite que el cumplimiento anual y la programación
    // automática los reconozcan como ya ejecutados.
    const contratoRow = row as any;
    const vinculados = await vincularHistoricosAContrato(context.supabase, contratoRow);
    return { ...contratoRow, historicos_vinculados: vinculados };
  });

async function vincularHistoricosAContrato(supabase: any, contrato: any) {
  // Trabajos candidatos: completados, sin contrato, misma planta y servicio.
  // Se incluyen también los ejecutados antes del año del contrato (históricos
  // previos) para que cuenten como ciclos ya ejecutados. Se ordenan por fecha
  // ascendente para asignarlos a los ciclos 1..N en orden cronológico.
  const { data: candidatos, error } = await supabase
    .from("trabajos")
    .select("id, fecha_programada, ciclo_numero")
    .eq("planta_id", contrato.planta_id)
    .eq("servicio", contrato.servicio)
    .eq("estado", "completado")
    .is("contrato_id", null)
    .order("fecha_programada", { ascending: true });
  if (error) return 0;

  // Ciclos ya ocupados por trabajos vinculados al contrato.
  const { data: yaVinculados } = await supabase
    .from("trabajos")
    .select("ciclo_numero")
    .eq("contrato_id", contrato.id);
  const ocupados = new Set<number>(
    (yaVinculados ?? []).map((r: any) => r.ciclo_numero).filter((n: any) => n != null),
  );

  let proximoCiclo = 1;
  let vinculados = 0;
  let minFecha: string | null = null;
  for (const t of candidatos ?? []) {
    if (vinculados + ocupados.size >= contrato.cantidad_anual) break;
    while (ocupados.has(proximoCiclo) && proximoCiclo <= contrato.cantidad_anual) {
      proximoCiclo++;
    }
    if (proximoCiclo > contrato.cantidad_anual) break;
    const { error: uErr } = await supabase
      .from("trabajos")
      .update({ contrato_id: contrato.id, ciclo_numero: proximoCiclo })
      .eq("id", (t as any).id);
    if (!uErr) {
      ocupados.add(proximoCiclo);
      proximoCiclo++;
      vinculados++;
      const f = (t as any).fecha_programada as string;
      if (!minFecha || f < minFecha) minFecha = f;
    }
  }

  // Inicio del contrato = primera fecha ejecutada de un servicio vinculado.
  await recalcularFechaInicioContrato(supabase, contrato.id);
  return vinculados;
}

/**
 * Ajusta `fecha_inicio` del contrato a la fecha del primer trabajo vinculado
 * (sea histórico o ejecutado). Si no hay trabajos vinculados, no toca nada.
 */
async function recalcularFechaInicioContrato(supabase: any, contratoId: string) {
  const { data } = await supabase
    .from("trabajos")
    .select("fecha_programada")
    .eq("contrato_id", contratoId)
    .order("fecha_programada", { ascending: true })
    .limit(1);
  const primera = (data ?? [])[0]?.fecha_programada as string | undefined;
  if (!primera) return;
  const iso = new Date(primera).toISOString().slice(0, 10);
  await supabase
    .from("contratos_servicio")
    .update({ fecha_inicio: iso })
    .eq("id", contratoId);
}

export { recalcularFechaInicioContrato };

export const eliminarContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("contratos_servicio").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Devuelve los días ocupados globalmente (todas las plantas) en un rango. */
async function diasOcupadosGlobales(supabase: any, desde: Date, hasta: Date, excluirTrabajoId?: string) {
  const { data, error } = await supabase
    .from("trabajos")
    .select("id, fecha_programada, duracion_dias")
    .gte("fecha_programada", desde.toISOString())
    .lte("fecha_programada", addDaysDate(hasta, 1).toISOString())
    .neq("estado", "cancelado");
  if (error) throw new Error(error.message);
  const ocupados = new Set<string>();
  (data ?? []).forEach((t: any) => {
    if (excluirTrabajoId && t.id === excluirTrabajoId) return;
    const start = new Date(t.fecha_programada);
    const dur = Math.max(1, Number(t.duracion_dias ?? 1));
    for (let i = 0; i < dur; i++) {
      const day = new Date(start);
      day.setUTCHours(0, 0, 0, 0);
      day.setUTCDate(day.getUTCDate() + i);
      ocupados.add(day.toISOString().slice(0, 10));
    }
  });
  return ocupados;
}

function siguienteLibre(fechaIso: string, durDias: number, ocupados: Set<string>, limiteDias = 365): string {
  const base = new Date(fechaIso);
  for (let offset = 0; offset < limiteDias; offset++) {
    const cand = new Date(base);
    cand.setUTCDate(cand.getUTCDate() + offset);
    // Saltar fines de semana: la fecha de inicio debe ser día hábil (Lun-Vie)
    const dow = cand.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    let libre = true;
    for (let i = 0; i < durDias; i++) {
      const d = new Date(cand);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() + i);
      const ddow = d.getUTCDay();
      if (ddow === 0 || ddow === 6) { libre = false; break; }
      if (ocupados.has(d.toISOString().slice(0, 10))) { libre = false; break; }
    }
    if (libre) return cand.toISOString().slice(0, 10);
  }
  return fechaIso.slice(0, 10);
}

/** Genera la programación anual de un contrato (staff). Idempotente. */
export const generarProgramacionAnual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      contrato_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase;
    const { data: contrato, error: cErr } = await supabase
      .from("contratos_servicio")
      .select("id, planta_id, servicio, cantidad_anual, anio, fecha_inicio, duracion_dias_default")
      .eq("id", data.contrato_id)
      .single();
    if (cErr || !contrato) throw new Error(cErr?.message ?? "Contrato no encontrado");
    const c = contrato as any;

    const { data: existentes } = await supabase
      .from("trabajos")
      .select("ciclo_numero")
      .eq("contrato_id", c.id);
    const ciclosExistentes = new Set<number>((existentes ?? []).map((r: any) => r.ciclo_numero).filter((n: any) => n != null));

    const paso = Math.max(1, Math.round(365 / c.cantidad_anual));
    const inicio = new Date(c.fecha_inicio + "T08:00:00Z");
    const finAnio = new Date(c.anio + 1 + "-01-01T00:00:00Z");

    // Cargar ocupación global del año una sola vez (para distribuir generaciones)
    const ocupados = await diasOcupadosGlobales(supabase, inicio, finAnio);
    const dur = Math.max(1, Number(c.duracion_dias_default ?? 1));

    const nuevos: any[] = [];
    for (let i = 0; i < c.cantidad_anual; i++) {
      const ciclo = i + 1;
      if (ciclosExistentes.has(ciclo)) continue;
      let fechaIdeal = addDaysDate(inicio, i * paso);
      let fechaLibre = siguienteLibre(fechaIdeal.toISOString(), dur, ocupados);
      if (isCleaningService(c.servicio)) {
        for (let intento = 0; intento < 365; intento++) {
          const conflictos = await findCleaningClientConflicts(supabase, {
            plantaId: c.planta_id,
            servicio: c.servicio,
            fechaProgramada: toIsoStartOfDay(fechaLibre),
            duracionDias: dur,
          });
          if (conflictos.length === 0) break;
          for (const cf of conflictos as any[]) {
            for (const dia of cf.dias ?? []) ocupados.add(dia);
          }
          fechaIdeal = addDaysDate(new Date(fechaLibre + "T00:00:00Z"), 1);
          fechaLibre = siguienteLibre(fechaIdeal.toISOString(), dur, ocupados);
        }
      }
      // marcar esta fecha como ocupada para el resto del bucle
      for (let k = 0; k < dur; k++) {
        const dx = new Date(fechaLibre + "T00:00:00Z");
        dx.setUTCDate(dx.getUTCDate() + k);
        ocupados.add(dx.toISOString().slice(0, 10));
      }
      const folio = "T-" + Math.floor(100000 + Math.random() * 900000);
      nuevos.push({
        folio,
        planta_id: c.planta_id,
        servicio: c.servicio,
        fecha_programada: toIsoStartOfDay(fechaLibre),
        duracion_dias: dur,
        estado: "programado",
        origen: "staff",
        contrato_id: c.id,
        ciclo_numero: ciclo,
        auto_generado: true,
        notas: `Auto-programado (ciclo ${ciclo}/${c.cantidad_anual})`,
      });
    }

    if (nuevos.length > 0) {
      const { error: iErr } = await supabase.from("trabajos").insert(nuevos);
      if (iErr) throw new Error(iErr.message);
    }

    // Notificar al cliente (no bloqueante)
    if (nuevos.length > 0) {
      try {
        const { data: planta } = await supabase
          .from("plantas")
          .select("nombre, clientes(nombre, email)")
          .eq("id", c.planta_id)
          .single();
        const cliente = (planta as any)?.clientes;
        if (cliente?.email) {
          const { sendGmail, formatFechaEs, emailLayout } = await import("./notifications.server");
          const fechas = nuevos
            .slice()
            .sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada))
            .map((n) => {
              const ini = new Date(n.fecha_programada);
              const fin = addDaysDate(ini, dur - 1);
              return `<li style="margin:4px 0;">Ciclo ${n.ciclo_numero}/${c.cantidad_anual}: <strong>${formatFechaEs(ini)}</strong>${dur > 1 ? ` → ${formatFechaEs(fin)}` : ""}</li>`;
            })
            .join("");
          const html = emailLayout(
            `Programación anual de ${c.servicio}`,
            `<p>Hola ${cliente.nombre},</p>
             <p>Se ha generado la programación automática del servicio <strong>${c.servicio}</strong> para la planta <strong>${(planta as any).nombre}</strong> durante ${c.anio}.</p>
             <p><strong>${nuevos.length}</strong> visita${nuevos.length === 1 ? "" : "s"} programada${nuevos.length === 1 ? "" : "s"} (${c.cantidad_anual} contratada${c.cantidad_anual === 1 ? "" : "s"} al año):</p>
             <ul style="padding-left:20px;">${fechas}</ul>
             <p>Puedes solicitar reprogramación de cualquier visita desde tu panel.</p>`,
          );
          await sendGmail({
            to: cliente.email,
            subject: `[EA Service Connect] Programación ${c.servicio} ${c.anio} - ${(planta as any).nombre}`,
            html,
          });
        }
      } catch (e) {
        console.error("[contratos] Error notificando programación", e);
      }
    }

    return { creados: nuevos.length, ciclos_existentes: ciclosExistentes.size };
  });

/** Reprogramación de un trabajo auto-generado por parte del cliente. */
export const reprogramarTrabajoCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      trabajo_id: z.string().uuid(),
      nueva_fecha: z.string().min(1), // YYYY-MM-DD
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const supabase = context.supabase;
    const { data: trabajo, error: tErr } = await supabase
      .from("trabajos")
      .select("id, planta_id, servicio, contrato_id, ciclo_numero, auto_generado, estado, duracion_dias")
      .eq("id", data.trabajo_id)
      .single();
    if (tErr || !trabajo) throw new Error(tErr?.message ?? "Trabajo no encontrado");
    const t = trabajo as any;
    if (!t.auto_generado || !t.contrato_id) throw new Error("Solo se pueden reprogramar trabajos auto-generados");
    if (t.estado !== "programado") throw new Error("Solo trabajos en estado 'programado' se pueden reprogramar");

    const { data: contrato, error: cErr } = await supabase
      .from("contratos_servicio")
      .select("cantidad_anual, fecha_inicio, anio")
      .eq("id", t.contrato_id)
      .single();
    if (cErr || !contrato) throw new Error("Contrato no encontrado");
    const c = contrato as any;

    // Ventana del ciclo
    const paso = Math.max(1, Math.round(365 / c.cantidad_anual));
    const inicio = new Date(c.fecha_inicio + "T00:00:00Z");
    const inicioCiclo = addDaysDate(inicio, (t.ciclo_numero - 1) * paso);
    const finCiclo = addDaysDate(inicioCiclo, paso - 1);
    const nueva = new Date(data.nueva_fecha + "T00:00:00Z");
    if (nueva < inicioCiclo || nueva > finCiclo) {
      throw new Error(
        `La fecha debe estar entre ${inicioCiclo.toISOString().slice(0, 10)} y ${finCiclo.toISOString().slice(0, 10)} (ciclo ${t.ciclo_numero}/${c.cantidad_anual}).`,
      );
    }

    // Verificar disponibilidad global
    const dur = Math.max(1, Number(t.duracion_dias ?? 1));
    const ocupados = await diasOcupadosGlobales(supabase, addDaysDate(nueva, -1), addDaysDate(nueva, dur + 1), t.id);
    for (let i = 0; i < dur; i++) {
      const d = new Date(nueva);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() + i);
      if (ocupados.has(d.toISOString().slice(0, 10))) {
        throw new Error("La fecha seleccionada ya está ocupada por otro trabajo. Elige un día libre.");
      }
    }
    const conflictosLimpieza = await findCleaningClientConflicts(supabase, {
      plantaId: t.planta_id,
      servicio: t.servicio,
      fechaProgramada: toIsoStartOfDay(data.nueva_fecha),
      duracionDias: dur,
      excluirTrabajoId: t.id,
    });
    if (conflictosLimpieza.length > 0) {
      throw new Error(formatCleaningClientConflict(conflictosLimpieza));
    }

    const { error: uErr } = await supabase
      .from("trabajos")
      .update({ fecha_programada: toIsoStartOfDay(data.nueva_fecha) })
      .eq("id", t.id);
    if (uErr) throw new Error(uErr.message);

    // Notificar al cliente la nueva fecha (no bloqueante)
    try {
      const { data: planta } = await supabase
        .from("plantas")
        .select("nombre, clientes(nombre, email)")
        .eq("id", t.planta_id)
        .single();
      const cliente = (planta as any)?.clientes;
      if (cliente?.email) {
        const { sendGmail, formatFechaEs, emailLayout } = await import("./notifications.server");
        const ini = new Date(data.nueva_fecha + "T00:00:00Z");
        const fin = addDaysDate(ini, dur - 1);
        const html = emailLayout(
          "Reprogramación confirmada",
          `<p>Hola ${cliente.nombre},</p>
           <p>Se ha reprogramado correctamente la visita del ciclo <strong>${t.ciclo_numero}/${c.cantidad_anual}</strong> en la planta <strong>${(planta as any).nombre}</strong>.</p>
           <p style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px 16px;margin:16px 0;">
             <strong>Nueva fecha:</strong> ${formatFechaEs(ini)}${dur > 1 ? ` → ${formatFechaEs(fin)}` : ""}<br/>
             <strong>Servicio:</strong> visita programada según contrato anual.
           </p>
           <p>Si necesitas otro ajuste, contacta a tu supervisor o solicítalo nuevamente desde tu panel.</p>`,
        );
        await sendGmail({
          to: cliente.email,
          subject: `[EA Service Connect] Reprogramación confirmada - ${(planta as any).nombre}`,
          html,
        });
      }
    } catch (e) {
      console.error("[contratos] Error notificando reprogramación", e);
    }

    return { ok: true };
  });

/** Disponibilidad global por día en un rango (para el calendario del cliente). */
export const disponibilidadGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ desde: z.string(), hasta: z.string(), excluir_trabajo_id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const desde = new Date(data.desde + "T00:00:00Z");
    const hasta = new Date(data.hasta + "T00:00:00Z");
    const ocupados = await diasOcupadosGlobales(context.supabase, desde, hasta, data.excluir_trabajo_id);
    return Array.from(ocupados.values());
  });

/** Cumplimiento anual de contratos (filtrado por RLS de plantas). */
export const cumplimientoAnual = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const anio = new Date().getFullYear();
    const { data, error } = await context.supabase.rpc("contrato_cumplimiento" as any, { _anio: anio });
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as any[];
    const total_contratado = filas.reduce((s, r) => s + (r.cantidad_anual ?? 0), 0);
    const total_completado = filas.reduce((s, r) => s + (r.completados ?? 0), 0);
    const total_programado = filas.reduce((s, r) => s + (r.programados ?? 0), 0);
    const pct = total_contratado > 0 ? Math.round((total_completado / total_contratado) * 1000) / 10 : 0;
    return { anio, filas, total_contratado, total_completado, total_programado, cumplimiento_pct: pct };
  });