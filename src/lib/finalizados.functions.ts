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

    let desde = data.desde;
    let hasta = data.hasta;
    if (data.trimestre && data.anio) {
      const mesInicio = (data.trimestre - 1) * 3;
      const primer = new Date(Date.UTC(data.anio, mesInicio, 1));
      const ultimo = new Date(Date.UTC(data.anio, mesInicio + 3, 0));
      desde = primer.toISOString().slice(0, 10);
      hasta = ultimo.toISOString().slice(0, 10);
    }
    // El período se filtra por la fecha REAL de finalización (último día
    // reportado por el técnico), que puede caer días antes del instante en que
    // alguien marcó la OT como completada. Por eso la consulta usa un margen
    // amplio sobre `fecha_completado` y el recorte exacto se hace más abajo,
    // ya con `fecha_finalizacion` calculada.
    const MARGEN_DIAS = 60;
    function correrDias(fecha: string, dias: number) {
      const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + dias);
      return d.toISOString().slice(0, 10);
    }
    if (desde) q = q.gte("fecha_completado", `${correrDias(desde, -MARGEN_DIAS)}T00:00:00Z`);
    if (hasta) q = q.lte("fecha_completado", `${correrDias(hasta, MARGEN_DIAS)}T23:59:59Z`);

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

    // Fecha real de ejecución: último día reportado por el técnico en el
    // reporte diario. `fecha_completado` guarda el instante en que se marcó
    // como completado (puede ser otro día), por lo que solo sirve de respaldo.
    const ultimoDia = new Map<string, string>();
    const ids = lista.map((t) => t.id as string);
    if (ids.length > 0) {
      const { data: diarios } = await context.supabase
        .from("trabajo_reportes_diarios")
        .select("trabajo_id, fecha")
        .in("trabajo_id", ids);
      (diarios ?? []).forEach((r: any) => {
        const f = String(r.fecha).slice(0, 10);
        const prev = ultimoDia.get(r.trabajo_id);
        if (!prev || f > prev) ultimoDia.set(r.trabajo_id, f);
      });
    }

    function diaLocal(iso: string) {
      // Día calendario en El Salvador (UTC-6) del timestamp de cierre.
      const d = new Date(new Date(iso).getTime() - 6 * 3600000);
      return d.toISOString().slice(0, 10);
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
      // YYYY-MM-DD del día en que realmente se terminó el trabajo.
      fecha_finalizacion: ultimoDia.get(t.id as string) ?? diaLocal(t.fecha_completado as string),
      duracion_dias: (t.duracion_dias as number) ?? 1,
      firmado_at: (t.firmado_at as string) ?? null,
      firmado_por: (t.firmado_por as string) ?? null,
      tecnico: t.tecnico_id ? nombres.get(t.tecnico_id) ?? "—" : "—",
    }));
  });


export type TrabajoFinalizado = Awaited<ReturnType<typeof listTrabajosFinalizados>>[number];
