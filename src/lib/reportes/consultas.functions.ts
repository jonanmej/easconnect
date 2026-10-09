import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listReportes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("reportes")
      .select("id, cliente_id, planta_id, periodo, titulo, insight_resumen, estado, model_used, created_at, desde, hasta, version, fecha_emision, codigo_documento, version_label, revision_ia_pendiente, revision_ia_detalle, clientes(nombre), plantas(nombre)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...r,
      cliente_nombre: r.clientes?.nombre ?? "—",
      planta_nombre: r.plantas?.nombre ?? null,
    }));
  });

export const getReporte = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("reportes")
      .select("*, clientes(nombre), plantas(nombre)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const marcarReporteEnviado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      enviado_a: z.string().email().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const patch: any = { estado: "enviado", enviado_at: new Date().toISOString() };
    if (data.enviado_a) patch.enviado_a = data.enviado_a;
    const { error } = await context.supabase
      .from("reportes")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const eliminarReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data: isSup } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" });
    if (!isAdmin && !isSup) throw new Error("Solo administradores o supervisores pueden eliminar reportes");
    const { data: rep } = await context.supabase.from("reportes").select("estado").eq("id", data.id).maybeSingle();
    if (rep && ["enviado", "aprobado"].includes(String((rep).estado))) {
      throw new Error(`Este reporte ya fue emitido (${(rep).estado}) y no se puede eliminar. Solo se eliminan borradores o rechazados; para corregirlo crea una nueva versión.`);
    }
    const { error } = await context.supabase.from("reportes").delete().eq("id", data.id);
    if (error) {
      if (error.message.includes("REPORTE_EMITIDO_NO_ELIMINABLE"))
        throw new Error("Este reporte ya fue emitido y no se puede eliminar. Solo se eliminan borradores o rechazados; para corregirlo crea una nueva versión.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const resetDatosOperacionales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores pueden reiniciar los datos");
    const email = String((context.claims)?.email ?? "").toLowerCase();
    if (email !== "proyectos@easervice.app") {
      throw new Error("Forbidden: acción restringida al propietario");
    }
    const { error } = await context.supabase.rpc("reset_operational_data");
    if (error) throw new Error(error.message);
    // Vaciar storage buckets
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (const bucket of ["trabajos-evidencia", "firmas-clientes"]) {
        const { data: files } = await supabaseAdmin.storage.from(bucket).list("", { limit: 1000 });
        if (files?.length) {
          await supabaseAdmin.storage.from(bucket).remove(files.map((f: any) => f.name));
        }
      }
    } catch { /* ignore storage cleanup errors */ }
    return { ok: true };
  });


export const getResponsableReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reporte_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rep } = await context.supabase
      .from("reportes").select("generado_por").eq("id", data.reporte_id).single();
    const uid = (rep)?.generado_por ?? context.userId;
    const { data: p } = await context.supabase
      .from("profiles").select("display_name, nombres, apellidos, cargo")
      .eq("id", uid).maybeSingle();
    const nombre = p?.nombres && p?.apellidos
      ? `${p.nombres} ${p.apellidos}`.trim()
      : p?.display_name ?? "Equipo EA Service and Consulting";
    return { nombre, cargo: p?.cargo ?? "Responsable Operativo" };
  });

/**
 * Genera el reporte ejecutivo final de un trabajo a partir de los reportes
 * diarios cargados por los técnicos + PDFs subidos (caso st.solar).
 * Solo admin/supervisor.
 */
