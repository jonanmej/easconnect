import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const globalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ context, data }) => {
    const q = data.q.trim();
    const like = `%${q}%`;
    const [plantas, clientes, equipos, trabajos, solicitudes] = await Promise.all([
      context.supabase.from("plantas").select("id, nombre, ubicacion").ilike("nombre", like).limit(5),
      context.supabase.from("clientes").select("id, nombre").ilike("nombre", like).limit(5),
      context.supabase.from("equipos").select("id, codigo, nombre").or(`nombre.ilike.${like},codigo.ilike.${like}`).limit(5),
      context.supabase.from("trabajos").select("id, folio, servicio").or(`folio.ilike.${like},servicio.ilike.${like}`).limit(5),
      context.supabase.from("solicitudes_visita").select("id, tipo, descripcion").or(`tipo.ilike.${like},descripcion.ilike.${like}`).limit(5),
    ]);
    return {
      plantas: plantas.data ?? [],
      clientes: clientes.data ?? [],
      equipos: equipos.data ?? [],
      trabajos: trabajos.data ?? [],
      solicitudes: solicitudes.data ?? [],
    };
  });