import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAuditoria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      entidad: z.string().optional(),
      accion: z.string().optional(),
      desde: z.string().optional(),
      hasta: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    // Defensa en profundidad: solo staff (admin/supervisor) puede leer auditoría.
    const [{ data: isAdmin }, { data: isSup }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" }),
    ]);
    if (!isAdmin && !isSup) throw new Error("No autorizado");

    let q = context.supabase
      .from("auditoria_log")
      .select("id, entidad, entidad_id, accion, antes, despues, actor, ts")
      .order("ts", { ascending: false })
      .limit(data.limit);
    if (data.entidad) q = q.eq("entidad", data.entidad);
    if (data.accion) q = q.eq("accion", data.accion);
    if (data.desde) q = q.gte("ts", data.desde);
    if (data.hasta) q = q.lte("ts", data.hasta);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const actores = Array.from(new Set((rows ?? []).map((r: any) => r.actor).filter(Boolean)));
    const actorMap = new Map<string, string>();
    if (actores.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, display_name").in("id", actores);
      (profs ?? []).forEach((p: any) => actorMap.set(p.id, p.display_name ?? p.id));
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      actor_nombre: r.actor ? (actorMap.get(r.actor) ?? "Sistema") : "Sistema",
    }));
  });