import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "trabajos-evidencia";

const CATEGORIAS = ["antes", "durante", "despues", "anomalia", "mediciones"] as const;

export const listEvidencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      trabajo_id: z.string().uuid(),
      reporte_diario_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("trabajo_evidencias")
      .select("id, trabajo_id, reporte_diario_id, storage_path, descripcion, categoria, subido_por, created_at")
      .eq("trabajo_id", data.trabajo_id)
      .order("created_at", { ascending: false });
    if (data.reporte_diario_id !== undefined) {
      q = data.reporte_diario_id === null
        ? q.is("reporte_diario_id", null)
        : q.eq("reporte_diario_id", data.reporte_diario_id);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows?.length) return [];
    const { data: signed, error: sErr } = await context.supabase
      .storage.from(BUCKET)
      .createSignedUrls(rows.map((r) => r.storage_path), 3600);
    if (sErr) throw new Error(sErr.message);
    const urlByPath = new Map((signed ?? []).map((s) => [s.path!, s.signedUrl]));
    return rows.map((r) => ({ ...r, url: urlByPath.get(r.storage_path) ?? null }));
  });

export const recordEvidencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      trabajo_id: z.string().uuid(),
      storage_path: z.string().min(1),
      descripcion: z.string().nullable().optional(),
      categoria: z.enum(CATEGORIAS).optional(),
      reporte_diario_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Defensa: el storage_path debe estar bajo trabajos/<trabajo_id>/
    const prefix = `trabajos/${data.trabajo_id}/`;
    if (!data.storage_path.startsWith(prefix)) {
      throw new Error("storage_path no corresponde al trabajo indicado");
    }
    // Defensa: si se vincula a un reporte diario, debe pertenecer al mismo trabajo
    if (data.reporte_diario_id) {
      // Se valida con el cliente administrativo: un técnico no puede leer los
      // reportes diarios de otro técnico (RLS), pero sí puede adjuntar fotos a
      // un reporte del mismo trabajo cuando son varios técnicos asignados.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rd, error: rdErr } = await supabaseAdmin
        .from("trabajo_reportes_diarios")
        .select("id, trabajo_id")
        .eq("id", data.reporte_diario_id)
        .maybeSingle();
      if (rdErr) throw new Error(rdErr.message);
      if (!rd) {
        throw new Error("El reporte diario indicado ya no existe");
      }
      if (rd.trabajo_id !== data.trabajo_id) {
        throw new Error("El reporte diario no pertenece al trabajo");
      }
    }
    const { data: row, error } = await context.supabase
      .from("trabajo_evidencias")
      .insert({
        trabajo_id: data.trabajo_id,
        storage_path: data.storage_path,
        descripcion: data.descripcion ?? null,
        categoria: data.categoria ?? "durante",
        reporte_diario_id: data.reporte_diario_id ?? null,
        subido_por: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEvidencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error: fErr } = await context.supabase
      .from("trabajo_evidencias").select("storage_path").eq("id", data.id).single();
    if (fErr) throw new Error(fErr.message);
    await context.supabase.storage.from(BUCKET).remove([row.storage_path]);
    const { error } = await context.supabase.from("trabajo_evidencias").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });