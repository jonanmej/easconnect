import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "trabajos-evidencia";

const ZDiario = z.object({
  id: z.string().uuid().optional(),
  trabajo_id: z.string().uuid(),
  fecha: z.string().min(8), // YYYY-MM-DD
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
    const { data: row, error } = await context.supabase
      .from("trabajo_reportes_diarios")
      .upsert(payload, { onConflict: "trabajo_id,fecha,tecnico_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
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
    const { error } = await context.supabase
      .from("trabajo_reportes_diarios").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
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