import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "trabajos-evidencia";

const ZDiario = z.object({
  id: z.string().uuid().optional(),
  trabajo_id: z.string().uuid(),
  fecha: z.string().min(8), // YYYY-MM-DD
  fase: z.enum(["diagnostico", "intervencion", "cierre"]).default("intervencion"),
  avance_pct: z.number().int().min(0).max(100).nullable().optional(),
  paneles_limpiados: z.number().int().min(0).nullable().optional(),
  agua_galones: z.number().min(0).nullable().optional(),
  watts_panel: z.number().min(0).nullable().optional(),
  tds_ppm: z.number().min(0).nullable().optional(),
  angulo_inclinacion: z.number().nullable().optional(),
  presion_agua_psi: z.number().min(0).nullable().optional(),
  horas_trabajadas: z.number().min(0).nullable().optional(),
  clima: z.string().nullable().optional(),
  trabajo_realizado: z.string().nullable().optional(),
  hallazgos: z.string().nullable().optional(),
  bloqueos: z.string().nullable().optional(),
  observaciones: z.string().nullable().optional(),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  hora_fin: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
});

export const listReportesDiarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trabajo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("trabajo_reportes_diarios")
      .select("*")
      .eq("trabajo_id", data.trabajo_id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.tecnico_id)));
    let perfiles = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, display_name").in("id", ids);
      perfiles = new Map((profs ?? []).map((p: any) => [p.id, p.display_name ?? "—"]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, tecnico_nombre: perfiles.get(r.tecnico_id) ?? "Técnico" }));
  });

export const upsertReporteDiario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ZDiario.parse(d))
  .handler(async ({ context, data }) => {
    const payload: any = { ...data, tecnico_id: context.userId };
    if (!payload.id) delete payload.id;
    if (payload.id) {
      // Solo el autor (o admin/supervisor) puede editar un reporte diario.
      const { data: prev } = await context.supabase
        .from("trabajo_reportes_diarios")
        .select("tecnico_id")
        .eq("id", payload.id)
        .maybeSingle();
      if (prev && (prev as any).tecnico_id !== context.userId) {
        const [{ data: esAdmin }, { data: esSup }] = await Promise.all([
          context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
          context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" }),
        ]);
        if (!esAdmin && !esSup) {
          throw new Error("Solo puedes editar tus propios reportes diarios.");
        }
        // El staff edita conservando la autoría original (no mezcla datos).
        payload.tecnico_id = (prev as any).tecnico_id;
      }
    }
    // Con id existente se hace UPDATE directo: el upsert dispararía la
    // validación de inserción (que exige tecnico_id = usuario actual) y el
    // staff sería rechazado al editar el reporte de otro técnico.
    const q = payload.id
      ? context.supabase
          .from("trabajo_reportes_diarios")
          .update(payload)
          .eq("id", payload.id)
          .select()
          .single()
      : context.supabase
          .from("trabajo_reportes_diarios")
          .upsert(payload, { onConflict: "trabajo_id,fecha,tecnico_id,fase" })
          .select()
          .single();
    const { data: row, error } = await q;
    if (error) {
      if (/row-level security/i.test(error.message)) {
        throw new Error(
          "Tu cuenta no tiene permisos para registrar reportes diarios. Pide al administrador que te asigne el rol de técnico.",
        );
      }
      throw new Error(error.message);
    }

    try {
      const { data: trab } = await context.supabase
        .from("trabajos").select("folio, servicio").eq("id", data.trabajo_id).single();
      const { notificarStaff } = await import("@/lib/notificaciones-staff.server");
      const folio = (trab as any)?.folio ?? data.trabajo_id.slice(0, 8);
      await notificarStaff({
        tipo: "reporte_diario",
        titulo: `Reporte diario · ${folio}`,
        mensaje: `Se registró un reporte diario del ${data.fecha} en el trabajo ${folio}.`,
        trabajo_id: data.trabajo_id,
        excluirUserId: context.userId,
      });
    } catch { /* silenciar */ }
    return row;
  });

export const eliminarReporteDiario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: prev } = await context.supabase
      .from("trabajo_reportes_diarios")
      .select("id, trabajo_id, fecha, tecnico_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!prev) throw new Error("El reporte diario ya no existe.");
    if ((prev as any).tecnico_id !== context.userId) {
      const [{ data: esAdmin }, { data: esSup }] = await Promise.all([
        context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
        context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" }),
      ]);
      if (!esAdmin && !esSup) throw new Error("Solo puedes borrar tus propios reportes diarios.");
    }
    const { error } = await context.supabase
      .from("trabajo_reportes_diarios").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    // El consolidado se recalcula desde las filas vigentes, así que al borrar
    // este aporte el ejecutivo del día/rango queda actualizado sin duplicar.
    return {
      ok: true,
      trabajo_id: (prev as any).trabajo_id as string,
      fecha: (prev as any).fecha as string,
    };
  });

/** PDFs subidos (caso st.solar@easervice.app) */
export const listReportesPDF = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trabajo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("trabajo_reportes_pdf")
      .select("*")
      .eq("trabajo_id", data.trabajo_id)
      .order("fecha", { ascending: false });
    if (error) throw new Error(error.message);
    if (!rows?.length) return [];
    const { data: signed } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUrls(rows.map((r: any) => r.storage_path), 3600);
    const urlByPath = new Map((signed ?? []).map((s: any) => [s.path!, s.signedUrl]));
    return rows.map((r: any) => ({ ...r, url: urlByPath.get(r.storage_path) ?? null }));
  });

export const registrarReportePDF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      trabajo_id: z.string().uuid(),
      fecha: z.string().min(8),
      storage_path: z.string().min(1),
      nombre_original: z.string().nullable().optional(),
      tamanio_bytes: z.number().int().nullable().optional(),
      notas: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("trabajo_reportes_pdf")
      .insert({ ...data, subido_por: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    try {
      const { data: trab } = await context.supabase
        .from("trabajos").select("folio").eq("id", data.trabajo_id).single();
      const { notificarStaff } = await import("@/lib/notificaciones-staff.server");
      const folio = (trab as any)?.folio ?? data.trabajo_id.slice(0, 8);
      await notificarStaff({
        tipo: "reporte_diario",
        titulo: `Reporte PDF · ${folio}`,
        mensaje: `Se subió un reporte en PDF (${data.fecha}) al trabajo ${folio}.`,
        trabajo_id: data.trabajo_id,
        excluirUserId: context.userId,
      });
    } catch { /* silenciar */ }
    return row;
  });

export const eliminarReportePDF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error: fErr } = await context.supabase
      .from("trabajo_reportes_pdf").select("storage_path").eq("id", data.id).single();
    if (fErr) throw new Error(fErr.message);
    if (row?.storage_path) {
      await context.supabase.storage.from(BUCKET).remove([row.storage_path]);
    }
    const { error } = await context.supabase.from("trabajo_reportes_pdf").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Extrae el contenido textual de un PDF externo subido por el técnico y
 * devuelve la metadata asociada (folio, planta, cliente, fecha). Se usa
 * para regenerar el mismo contenido con el formato institucional EA/ISO
 * sin alterar la información original.
 */
export const getPdfExternoParaFormato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("trabajo_reportes_pdf")
      .select("id, fecha, nombre_original, storage_path, notas, trabajo_id")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error(error?.message ?? "PDF no encontrado");
    const r: any = row;
    const { data: trab } = await context.supabase
      .from("trabajos")
      .select("folio, servicio, planta_id, plantas(nombre, clientes(nombre))")
      .eq("id", r.trabajo_id)
      .single();
    const t: any = trab ?? {};
    // Descargar el PDF con el cliente RLS del usuario
    const { data: file, error: dErr } = await context.supabase.storage
      .from(BUCKET)
      .download(r.storage_path);
    if (dErr || !file) throw new Error(dErr?.message ?? "No se pudo leer el PDF");
    const buf = new Uint8Array(await file.arrayBuffer());
    // Codifica a base64 sin usar Buffer para evitar depender de node en el worker.
    let bin = "";
    for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i]);
    const base64 = btoa(bin);
    return {
      id: r.id,
      fecha: r.fecha,
      nombre_original: r.nombre_original ?? "Reporte externo",
      notas: r.notas ?? null,
      folio: t?.folio ?? null,
      servicio: t?.servicio ?? null,
      planta: t?.plantas?.nombre ?? null,
      cliente: t?.plantas?.clientes?.nombre ?? null,
      pdf_base64: base64,
    };
  });
/**
 * Avance consolidado de una OT calculado a partir de los reportes diarios
 * realmente cargados por los técnicos: horas, paneles, meta diaria y zonas
 * marcadas en el mapa satelital. Se recalcula en cada consulta, así que al
 * guardar un reporte diario el avance de la OT queda actualizado solo.
 */
export const getAvanceTrabajo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trabajo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const { data: trab, error: e1 } = await sb
      .from("trabajos")
      .select("id, folio, estado, duracion_dias, planta_id, plantas(nombre, paneles)")
      .eq("id", data.trabajo_id)
      .single();
    if (e1) throw new Error(e1.message);

    const [{ data: diarios }, { data: zonas }, { data: marcas }] = await Promise.all([
      sb.from("trabajo_reportes_diarios")
        .select("id, fecha, avance_pct, paneles_limpiados, horas_trabajadas, hora_inicio, hora_fin")
        .eq("trabajo_id", data.trabajo_id)
        .order("fecha", { ascending: true }),
      sb.from("planta_zonas")
        .select("id, nombre, paneles_estimados, orden")
        .eq("planta_id", (trab as any).planta_id)
        .eq("activo", true)
        .order("orden", { ascending: true }),
      sb.from("reporte_diario_zonas")
        .select("zona_id, estado")
        .eq("trabajo_id", data.trabajo_id),
    ]);

    const filas = (diarios ?? []) as any[];
    const num = (v: any) => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);
    const paneles = filas.reduce((s, d) => s + num(d.paneles_limpiados), 0);
    const horas = Number(filas.reduce((s, d) => s + num(d.horas_trabajadas), 0).toFixed(1));
    const dias = new Set(filas.map((d) => String(d.fecha))).size;
    const metaMax = filas.length
      ? Math.max(...filas.map((d) => num(d.avance_pct)))
      : null;
    const ultimo = filas.length ? filas[filas.length - 1] : null;

    // Estado consolidado por zona: "completada" gana sobre "en_proceso".
    const estadoZona = new Map<string, "en_proceso" | "completada">();
    for (const m of ((marcas ?? []) as any[])) {
      const prev = estadoZona.get(m.zona_id);
      if (prev === "completada") continue;
      estadoZona.set(m.zona_id, m.estado === "completada" ? "completada" : "en_proceso");
    }
    const zonasArr = (zonas ?? []) as any[];
    const completadas = zonasArr.filter((z) => estadoZona.get(z.id) === "completada").length;
    const enProceso = zonasArr.filter((z) => estadoZona.get(z.id) === "en_proceso").length;

    const panelesPlanta = num((trab as any).plantas?.paneles);
    const avanceZonas = zonasArr.length
      ? Math.round((completadas / zonasArr.length) * 100)
      : null;
    const avancePaneles = panelesPlanta > 0
      ? Math.min(100, Math.round((paneles / panelesPlanta) * 100))
      : null;
    // Una OT cerrada está 100% ejecutada; si sigue abierta se toma la evidencia
    // más avanzada (zonas marcadas en el mapa o paneles intervenidos) y, si no
    // hay ninguna, la meta diaria reportada. Igual criterio que el reporte
    // ejecutivo, para que ambos muestren el mismo porcentaje.
    const avance = (trab as any).estado === "completado"
      ? 100
      : avanceZonas !== null || avancePaneles !== null
        ? Math.max(avanceZonas ?? 0, avancePaneles ?? 0)
        : metaMax;

    return {
      trabajo_id: (trab as any).id as string,
      folio: (trab as any).folio as string,
      estado: (trab as any).estado as string,
      planta: (trab as any).plantas?.nombre ?? null,
      paneles_planta: panelesPlanta || null,
      avance_pct: avance,
      avance_zonas_pct: avanceZonas,
      avance_paneles_pct: avancePaneles,
      meta_diaria_max: metaMax,
      fuente: zonasArr.length
        ? ("zonas" as const)
        : panelesPlanta > 0
          ? ("paneles" as const)
          : ("meta" as const),
      paneles_limpiados: paneles,
      horas_trabajadas: horas,
      dias_reportados: dias,
      duracion_dias: num((trab as any).duracion_dias) || null,
      ultima_fecha: ultimo ? String(ultimo.fecha) : null,
      ultima_jornada: ultimo
        ? { hora_inicio: ultimo.hora_inicio ?? null, hora_fin: ultimo.hora_fin ?? null }
        : null,
      zonas_total: zonasArr.length,
      zonas_completadas: completadas,
      zonas_en_proceso: enProceso,
      zonas: zonasArr.map((z) => ({
        id: z.id as string,
        nombre: z.nombre as string,
        estado: (estadoZona.get(z.id) ?? null) as "en_proceso" | "completada" | null,
      })),
    };
  });
