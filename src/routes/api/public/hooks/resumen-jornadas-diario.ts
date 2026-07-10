import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/resumen-jornadas-diario")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_API_SECRET ?? "";
        if (!expected) return new Response("Server misconfiguration", { status: 500 });
        const auth = request.headers.get("authorization") ?? "";
        const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        const alt = request.headers.get("x-cron-secret") ?? "";
        const provided = bearer || alt;
        if (!provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { enviarResumenDiarioJornadas } = await import("@/lib/jornadas.server");
          const r = await enviarResumenDiarioJornadas();
          return Response.json(r);
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: String(e.message ?? e) }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});