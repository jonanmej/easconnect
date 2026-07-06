import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_supabase";

export default defineTool({
  name: "list_trabajos",
  title: "Listar trabajos",
  description:
    "Lista trabajos (órdenes de servicio) visibles para el usuario autenticado, ordenados por fecha programada descendente. Respeta RLS.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).default(50).describe("Máximo de trabajos a devolver."),
    estado: z
      .enum(["pendiente", "en_curso", "completado", "cancelado"]) 
      .optional()
      .describe("Filtro opcional por estado del trabajo."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, estado }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("trabajos")
      .select("id,folio,servicio,estado,fecha_programada,fecha_completado,planta_id")
      .order("fecha_programada", { ascending: false })
      .limit(limit);
    if (estado) q = q.eq("estado", estado);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { trabajos: data ?? [] },
    };
  },
});