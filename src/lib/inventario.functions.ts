import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Categoria = z.enum(["insumo", "repuesto", "herramienta", "epp"]);
const MovTipo = z.enum(["ingreso", "salida", "ajuste"]);

export const listInventario = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("inventario_items")
      .select("*")
      .order("sku");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertInventarioItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      sku: z.string().min(1),
      nombre: z.string().min(1),
      categoria: Categoria,
      ubicacion: z.string().nullable().optional(),
      unidad: z.string().min(1).default("un"),
      stock_minimo: z.coerce.number().min(0).default(0),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const q = id
      ? context.supabase.from("inventario_items").update(rest).eq("id", id).select().single()
      : context.supabase.from("inventario_items").insert(rest).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteInventarioItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("inventario_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const registrarMovimiento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      item_id: z.string().uuid(),
      tipo: MovTipo,
      cantidad: z.coerce.number().positive(),
      motivo: z.string().nullable().optional(),
      trabajo_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("inventario_movimientos").insert({
      ...data,
      realizado_por: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMovimientos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ item_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("inventario_movimientos")
      .select("*")
      .eq("item_id", data.item_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });