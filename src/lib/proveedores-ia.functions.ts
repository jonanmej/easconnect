import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const buscarProveedoresIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        texto: z.string().max(160).optional(),
        imagen_base64: z.string().optional(),
        imagen_mime: z.string().optional(),
        pais: z.string().max(40).optional(),
        moneda: z.string().max(6).optional(),
        impuesto_pct: z.coerce.number().min(0).max(100).optional(),
      })
      .refine((v) => (v.texto && v.texto.trim().length >= 2) || v.imagen_base64, {
        message: "Escribe qué buscar o adjunta una foto del producto",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { describirProductoDesdeImagen, buscarEnWeb, extraerProveedores } = await import(
      "@/lib/proveedores-ia.server"
    );

    let termino = (data.texto ?? "").trim();
    let desdeImagen = false;
    if (!termino && data.imagen_base64) {
      termino = await describirProductoDesdeImagen(data.imagen_base64, data.imagen_mime || "image/jpeg");
      desdeImagen = true;
    }
    if (!termino) return { termino: "", desde_imagen: false, resultados: [] as any[], fuentes: 0 };

    const pais = (data.pais ?? "El Salvador").trim();
    const moneda = (data.moneda ?? "USD").trim().toUpperCase() || "USD";
    const impuestoPct = Number(data.impuesto_pct ?? 0);
    try {
      const fuentes = await buscarEnWeb(termino, pais);
      const resultados = await extraerProveedores(termino, fuentes, { moneda, impuestoPct });
      if (resultados.length > 0) {
        await context.supabase.from("busquedas_ia_proveedores" as any).insert({
          termino,
          pais,
          moneda,
          impuesto_pct: impuestoPct,
          desde_imagen: desdeImagen,
          fuentes: fuentes.length,
          resultados: resultados as any,
          creado_por: context.userId,
        } as any);
      }
      return { termino, desde_imagen: desdeImagen, resultados, fuentes: fuentes.length };
    } catch (e: any) {
      return {
        termino,
        desde_imagen: desdeImagen,
        resultados: [] as any[],
        fuentes: 0,
        error: String(e?.message ?? "No se pudo completar la búsqueda web"),
      };
    }
  });

/* ===================== HISTORIAL DE BÚSQUEDAS ===================== */

export const listHistorialIA = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("busquedas_ia_proveedores" as any)
      .select("id, termino, pais, moneda, impuesto_pct, desde_imagen, fuentes, resultados, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

export const eliminarHistorialIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("busquedas_ia_proveedores" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
