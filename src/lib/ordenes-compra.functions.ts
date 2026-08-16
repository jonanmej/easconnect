import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OCEstado = z.enum(["borrador", "enviada", "parcial", "recibida", "cancelada"]);

const ProveedorSchema = z.object({
  nombre: z.string().min(1),
  cotizacion_folio: z.string().nullable().optional(),
  cotizacion_fecha: z.string().nullable().optional(),
  cotizacion_monto: z.coerce.number().nullable().optional(),
  cotizacion_storage_path: z.string().nullable().optional(),
});

const ItemSchema = z.object({
  id: z.string().uuid().optional(),
  item_id: z.string().uuid().nullable().optional(),
  sku_texto: z.string().nullable().optional(),
  nombre: z.string().min(1),
  categoria: z.string().nullable().optional(),
  unidad: z.string().min(1).default("un"),
  cantidad_pedida: z.coerce.number().positive(),
  precio_unitario: z.coerce.number().nullable().optional(),
  proveedor: z.string().nullable().optional(),
  oferta_ia: z
    .object({
      proveedor: z.string().optional(),
      producto: z.string().optional(),
      precio: z.number().nullable().optional(),
      moneda: z.string().optional(),
      precio_con_impuesto: z.number().nullable().optional(),
      precio_por_unidad: z.number().nullable().optional(),
      unidades_por_empaque: z.number().optional(),
      empaque: z.string().optional(),
      tiempo_entrega: z.string().optional(),
      disponibilidad: z.string().optional(),
      notas: z.string().optional(),
      url: z.string().optional(),
      pais: z.string().optional(),
      impuesto_pct: z.number().optional(),
      fecha: z.string().optional(),
    })
    .nullable()
    .optional(),
});

function genFolio() {
  return `OC-${Date.now().toString().slice(-8)}`;
}

/* ============================== LISTA ============================== */

export const listOrdenesCompra = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ordenes_compra")
      .select(
        "id, folio, estado, fecha_emision, solicitante, notas, proveedores, fecha_enviada, fecha_recibida, fecha_cancelada, created_at, orden_compra_items(id, cantidad_pedida, cantidad_recibida)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((o: any) => {
      const pedido = (o.orden_compra_items ?? []).reduce((a: number, x: any) => a + Number(x.cantidad_pedida || 0), 0);
      const recibido = (o.orden_compra_items ?? []).reduce((a: number, x: any) => a + Number(x.cantidad_recibida || 0), 0);
      return {
        ...o,
        total_lineas: (o.orden_compra_items ?? []).length,
        total_pedido: pedido,
        total_recibido: recibido,
      };
    });
  });

/* ============================ DETALLE ============================ */

export const getOrdenCompra = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: oc, error } = await context.supabase
      .from("ordenes_compra")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const [items, receps, log] = await Promise.all([
      context.supabase
        .from("orden_compra_items")
        .select("*, inventario_items(id, sku, nombre, stock_actual, costo_promedio, unidad)")
        .eq("orden_id", data.id)
        .order("created_at"),
      context.supabase
        .from("orden_compra_recepciones")
        .select("*, orden_compra_recepcion_items(*, inventario_items(sku, nombre))")
        .eq("orden_id", data.id)
        .order("recibido_at", { ascending: false }),
      context.supabase
        .from("orden_compra_estados_log")
        .select("*")
        .eq("orden_id", data.id)
        .order("changed_at"),
    ]);
    if (items.error) throw new Error(items.error.message);
    if (receps.error) throw new Error(receps.error.message);
    if (log.error) throw new Error(log.error.message);

    // Firmar URLs de cotizaciones
    const proveedores: any[] = Array.isArray(oc.proveedores) ? oc.proveedores : [];
    const provsFirmados = await Promise.all(
      proveedores.map(async (p: any) => {
        if (!p?.cotizacion_storage_path) return p;
        const { data: signed } = await context.supabase.storage
          .from("cotizaciones-oc")
          .createSignedUrl(p.cotizacion_storage_path, 3600);
        return { ...p, cotizacion_url: signed?.signedUrl ?? null };
      }),
    );

    return {
      orden: { ...oc, proveedores: provsFirmados },
      items: items.data ?? [],
      recepciones: receps.data ?? [],
      estados_log: log.data ?? [],
    };
  });

/* ============================ CREAR/EDITAR ============================ */

export const guardarOrdenCompra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().nullable().optional(),
      solicitante: z.string().default(""),
      notas: z.string().nullable().optional(),
      proveedores: z.array(ProveedorSchema).default([]),
      items: z.array(ItemSchema).min(1),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, items, ...header } = data;
    let ordenId = id ?? null;

    if (!ordenId) {
      const { data: inserted, error } = await context.supabase
        .from("ordenes_compra")
        .insert({
          folio: genFolio(),
          solicitante: header.solicitante || "",
          notas: header.notas ?? null,
          proveedores: header.proveedores as any,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      ordenId = inserted.id;
      await context.supabase.from("orden_compra_estados_log").insert({
        orden_id: ordenId,
        estado_nuevo: "borrador",
        changed_by: context.userId,
        notas: "Creación",
      });
    } else {
      // Sólo permite editar si sigue en borrador
      const { data: cur } = await context.supabase
        .from("ordenes_compra")
        .select("estado")
        .eq("id", ordenId)
        .single();
      if (cur && cur.estado !== "borrador") throw new Error("Solo se puede editar en estado Borrador");

      const { error } = await context.supabase
        .from("ordenes_compra")
        .update({
          solicitante: header.solicitante,
          notas: header.notas ?? null,
          proveedores: header.proveedores as any,
        })
        .eq("id", ordenId);
      if (error) throw new Error(error.message);

      await context.supabase.from("orden_compra_items").delete().eq("orden_id", ordenId);
    }

    const filas = items.map((it) => ({
      orden_id: ordenId!,
      item_id: it.item_id ?? null,
      sku_texto: it.sku_texto ?? null,
      nombre: it.nombre.trim(),
      categoria: it.categoria ?? null,
      unidad: it.unidad || "un",
      cantidad_pedida: it.cantidad_pedida,
      precio_unitario: it.precio_unitario ?? null,
      proveedor: it.proveedor?.trim() || null,
      oferta_ia: (it.oferta_ia ?? null) as any,
    }));
    const { error: itemsErr } = await context.supabase.from("orden_compra_items").insert(filas);
    if (itemsErr) throw new Error(itemsErr.message);

    return { id: ordenId! };
  });

/* ============================ ESTADOS ============================ */

export const cambiarEstadoOC = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      nuevo_estado: OCEstado,
      notas: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("cambiar_estado_oc", {
      _orden_id: data.id,
      _nuevo_estado: data.nuevo_estado,
      _notas: data.notas ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const eliminarOrdenCompra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("ordenes_compra").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ========================= RECEPCIONES ========================= */

export const registrarRecepcionOC = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orden_id: z.string().uuid(),
      lineas: z
        .array(
          z.object({
            orden_item_id: z.string().uuid(),
            cantidad: z.coerce.number().positive(),
            costo_unitario: z.coerce.number().min(0).default(0),
            item_id_override: z.string().uuid().nullable().optional(),
            moneda: z.string().min(1).max(8).optional(),
            impuesto_pct: z.coerce.number().min(0).max(100).optional(),
            precio_esperado: z.coerce.number().min(0).nullable().optional(),
            variacion_motivo: z.string().nullable().optional(),
          }),
        )
        .min(1),
      notas: z.string().nullable().optional(),
      recibido_por_nombre: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: rec, error } = await context.supabase.rpc("registrar_recepcion_oc", {
      _orden_id: data.orden_id,
      _lineas: data.lineas as any,
      _notas: data.notas ?? undefined,
      _recibido_por_nombre: data.recibido_por_nombre ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { recepcion_id: rec as string };
  });

/* =================== EDITAR LÍNEA DE RECEPCIÓN =================== */

export const editarRecepcionItemOC = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      recepcion_item_id: z.string().uuid(),
      nueva_cantidad: z.coerce.number().positive(),
      nuevo_costo: z.coerce.number().min(0),
      motivo: z.string().min(3, "Motivo requerido"),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("editar_recepcion_item_oc", {
      _recepcion_item_id: data.recepcion_item_id,
      _nueva_cantidad: data.nueva_cantidad,
      _nuevo_costo: data.nuevo_costo,
      _motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listVariacionesOC = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orden_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("orden_compra_variaciones")
      .select("*")
      .eq("orden_id", data.orden_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ========================= COTIZACIONES ========================= */

export const subirCotizacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orden_id: z.string().uuid(),
      filename: z.string().min(1),
      content_type: z.string().default("application/octet-stream"),
      base64: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const safe = data.filename.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${data.orden_id}/${Date.now()}-${safe}`;
    const { error } = await context.supabase.storage
      .from("cotizaciones-oc")
      .upload(path, bin, { contentType: data.content_type, upsert: false });
    if (error) throw new Error(error.message);
    return { path };
  });

export const firmarUrlCotizacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("cotizaciones-oc")
      .createSignedUrl(data.path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

/* =========================== HISTORIAL =========================== */

export const historialItemOC = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      item_id: z.string().uuid().nullable().optional(),
      nombre: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("orden_compra_items")
      .select(
        "id, orden_id, nombre, sku_texto, unidad, cantidad_pedida, cantidad_recibida, precio_unitario, proveedor, ordenes_compra!inner(folio, estado, fecha_emision, fecha_recibida)",
      )
      .order("created_at", { ascending: false });
    if (data.item_id) q = q.eq("item_id", data.item_id);
    else if (data.nombre) q = q.ilike("nombre", data.nombre);
    else return [];
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });