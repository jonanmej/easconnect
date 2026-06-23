import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Tipo = z.enum(["preventivo", "correctivo", "predictivo"]);
const Estado = z.enum(["programado", "pendiente", "completado", "cancelado"]);

export const listMantenimientos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("mantenimientos")
      .select("id, equipo_id, tipo, fecha, fecha_inicio, fecha_fin, horas, tecnico_id, estado, notas, created_at, equipos(codigo, nombre)")
      .order("fecha_inicio", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((m: any) => ({
      ...m,
      equipo_label: m.equipos ? `${m.equipos.codigo} · ${m.equipos.nombre}` : "—",
    }));
  });

export const upsertMantenimiento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      equipo_id: z.string().uuid(),
      tipo: Tipo,
      fecha: z.string().min(1),
      fecha_inicio: z.string().nullable().optional(),
      fecha_fin: z.string().nullable().optional(),
      horas: z.coerce.number().min(0).default(0),
      tecnico_id: z.string().uuid().nullable().optional(),
      estado: Estado,
      notas: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    // Default inicio/fin a `fecha` cuando no se especifican (compatibilidad)
    if (!rest.fecha_inicio) rest.fecha_inicio = rest.fecha;
    if (!rest.fecha_fin) rest.fecha_fin = rest.fecha_inicio;
    const q = id
      ? context.supabase.from("mantenimientos").update(rest).eq("id", id).select().single()
      : context.supabase.from("mantenimientos").insert(rest).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMantenimiento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("mantenimientos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });