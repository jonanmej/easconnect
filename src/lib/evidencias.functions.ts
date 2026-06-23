import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "trabajos-evidencia";

const CATEGORIAS = ["antes", "durante", "despues", "anomalia"] as const;

export const listEvidencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trabajo_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("trabajo_evidencias")
      .select("id, trabajo_id, storage_path, descripcion, categoria, subido_por, created_at")
      .eq("trabajo_id", data.trabajo_id)
      .order("created_at", { ascending: false });
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
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("trabajo_evidencias")
      .insert({
        trabajo_id: data.trabajo_id,
        storage_path: data.storage_path,
        descripcion: data.descripcion ?? null,
        categoria: data.categoria ?? "durante",
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