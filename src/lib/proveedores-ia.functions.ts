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
      })
      .refine((v) => (v.texto && v.texto.trim().length >= 2) || v.imagen_base64, {
        message: "Escribe qué buscar o adjunta una foto del producto",
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { describirProductoDesdeImagen, buscarEnWeb, extraerProveedores } = await import(
      "@/lib/proveedores-ia.server"
    );

    let termino = (data.texto ?? "").trim();
    let desdeImagen = false;
    if (!termino && data.imagen_base64) {
      termino = await describirProductoDesdeImagen(data.imagen_base64, data.imagen_mime || "image/jpeg");
      desdeImagen = true;
    }
    if (!termino) return { termino: "", desde_imagen: false, resultados: [], fuentes: 0 };

    const pais = (data.pais ?? "El Salvador").trim();
    try {
      const fuentes = await buscarEnWeb(termino, pais);
      const resultados = await extraerProveedores(termino, fuentes);
      return { termino, desde_imagen: desdeImagen, resultados, fuentes: fuentes.length };
    } catch (e: any) {
      return {
        termino,
        desde_imagen: desdeImagen,
        resultados: [],
        fuentes: 0,
        error: String(e?.message ?? "No se pudo completar la búsqueda web"),
      };
    }
  });
