import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Trabajos finalizados por cliente / planta, con la fecha y hora exacta de
 * finalización. Alimenta el PDF "Trabajos finalizados" (filtrable).
 */
export const listTrabajosFinalizados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: z.string().uuid().optional(),
        planta_id: z.string().uuid().optional(),
        servicio: z.string().optional(),
        desde: z.string().optional(),
        hasta: z.string().optional(),
        trimestre: z.number().int().min(1).max(4).optional(),
        anio: z.number().int().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("trabajos")
      .select(
        "id, folio, servicio, estado, fecha_programada, fecha_completado, duracion_dias, firmado_at, firmado_por, tecnico_id, planta_id, plantas(id, nombre, ubicacion, cliente_id, clientes(id, nombre))",
      )
      .eq("estado", "completado")
      .not("fecha_completado", "is", null)
      .order("fecha_completado", { ascending: false });

    if (data.planta_id) q = q.eq("planta_id", data.planta_id);
    if (data.servicio) q = q.eq("servicio", data.servicio);
    if (data.desde) q = q.gte("fecha_completado", `${data.desde.slice(0, 10)}T00:00:00Z`);
    if (data.hasta) q = q.lte("fecha_completado", `${data.hasta.slice(0, 10)}T23:59:59Z`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let lista = (rows ?? []) as any[];
    if (data.cliente_id) lista = lista.filter((t) => t.plantas?.cliente_id === data.cliente_id);

    // Nombres de técnicos (perfil) para la columna responsable.
    const tecnicoIds = Array.from(new Set(lista.map((t) => t.tecnico_id).filter(Boolean)));
    const nombres = new Map<string, string>();
    if (tecnicoIds.length > 0) {
      const { data: perfiles } = await context.supabase
        .from("profiles")
        .select("id, display_name, nombres, apellidos")
        .in("id", tecnicoIds as string[]);
      (perfiles ?? []).forEach((p: any) => {
        const nombre =
          p.display_name?.trim() ||
          [p.nombres, p.apellidos].filter(Boolean).join(" ").trim() ||
          "—";
        nombres.set(p.id, nombre);
      });
    }

    return lista.map((t) => ({
      id: t.id as string,
      folio: t.folio as string,
      servicio: t.servicio as string,
      planta_id: t.planta_id as string,
      planta_nombre: (t.plantas?.nombre as string) ?? "—",
      planta_ubicacion: (t.plantas?.ubicacion as string) ?? null,
      cliente_id: (t.plantas?.cliente_id as string) ?? null,
      cliente_nombre: (t.plantas?.clientes?.nombre as string) ?? "—",
      fecha_programada: t.fecha_programada as string,
      fecha_completado: t.fecha_completado as string,
      duracion_dias: (t.duracion_dias as number) ?? 1,
      firmado_at: (t.firmado_at as string) ?? null,
      firmado_por: (t.firmado_por as string) ?? null,
      tecnico: t.tecnico_id ? nombres.get(t.tecnico_id) ?? "—" : "—",
    }));
  });

export type TrabajoFinalizado = Awaited<ReturnType<typeof listTrabajosFinalizados>>[number];
