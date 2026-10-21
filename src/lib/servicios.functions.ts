import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRol } from "@/lib/auth-roles";

export type ServicioCatalogo = {
  id: string;
  nombre: string;
  categoria: string;
  contratable: boolean;
  activo: boolean;
  orden: number;
};

/** Categorías del catálogo de servicios, en orden de presentación. */
export const CATEGORIAS_SERVICIO = [
  "Fotovoltaica",
  "Motores HFO",
  "GPS",
  "PVSTOP",
  "ChemitekSolar",
] as const;

/** Catálogo de servicios visible para todo el personal autenticado. */
export const listServiciosCatalogo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ServicioCatalogo[]> => {
    const { data, error } = await context.supabase
      .from("servicios_catalogo")
      .select("id, nombre, categoria, contratable, activo, orden")
      .eq("activo", true)
      .order("orden", { ascending: true })
      .order("nombre", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ServicioCatalogo[];
  });

/** Agrega un servicio nuevo al catálogo (solo admin). */
export const agregarServicioCatalogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      nombre: z.string().trim().min(3).max(120),
      categoria: z.string().trim().min(2).max(60).optional(),
      contratable: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }): Promise<ServicioCatalogo> => {
    await requireRol(context.supabase, context.userId, ["admin"]);
    const { data: row, error } = await context.supabase
      .from("servicios_catalogo")
      .upsert(
        {
          nombre: data.nombre,
          categoria: data.categoria ?? "Fotovoltaica",
          contratable: data.contratable ?? false,
        },
        { onConflict: "nombre" },
      )
      .select("id, nombre, categoria, contratable, activo, orden")
      .single();
    if (error) throw new Error(error.message);
    return row as ServicioCatalogo;
  });
