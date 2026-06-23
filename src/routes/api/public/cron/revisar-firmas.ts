import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint disparado por pg_cron una vez al día.
 * Busca trabajos completados hace ≥3 días con aprobación pendiente
 * y registra un recordatorio en `notificaciones_log` para que el panel
 * de notificaciones lo pueda accionar.
 *
 * Autenticación: header `apikey` con SUPABASE_PUBLISHABLE_KEY.
 */
export const Route = createFileRoute("/api/public/cron/revisar-firmas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apikey || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const tresDiasAtras = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

        // Buscar aprobaciones vigentes no firmadas para trabajos completados hace 3+ días
        const { data: pendientes, error } = await supabaseAdmin
          .from("trabajo_aprobaciones")
          .select("id, trabajo_id, expira_at, created_at, trabajos!inner(folio, planta_id, plantas!inner(nombre, email_notificaciones, cliente_id))")
          .is("firmado_at", null)
          .lte("created_at", tresDiasAtras)
          .gt("expira_at", new Date().toISOString());
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        let registrados = 0;
        for (const a of (pendientes ?? []) as any[]) {
          const planta = a.trabajos?.plantas;
          const dest = planta?.email_notificaciones;
          if (!dest) continue;

          // ¿ya hay un recordatorio en las últimas 72h?
          const limite = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
          const { count } = await supabaseAdmin
            .from("notificaciones_log")
            .select("id", { count: "exact", head: true })
            .eq("trabajo_id", a.trabajo_id)
            .eq("tipo", "manual")
            .like("asunto", "Recordatorio firma%")
            .gte("created_at", limite);
          if ((count ?? 0) > 0) continue;

          await supabaseAdmin.from("notificaciones_log").insert({
            trabajo_id: a.trabajo_id,
            planta_id: planta?.id ?? null,
            cliente_id: planta?.cliente_id ?? null,
            destinatario: dest,
            asunto: `Recordatorio firma ${a.trabajos.folio}`,
            tipo: "manual",
            estado: "enviado",
            error_mensaje: null,
            gmail_message_id: null,
            enviado_por: null,
          });
          registrados++;
        }
        return Response.json({ ok: true, registrados });
      },
    },
  },
});