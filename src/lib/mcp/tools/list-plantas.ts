import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "./_supabase";

export default defineTool({
  name: "list_plantas",
  title: "Listar plantas",
  description:
    "Devuelve las plantas solares visibles para el usuario autenticado (respeta RLS por rol/cliente).",
  inputSchema: {
    limit: z.number().int().min(1).max(200).default(50).describe("Máximo de plantas a devolver."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("plantas")
      .select("id,nombre,ubicacion,capacidad,paneles,ultima_limpieza")
      .order("nombre")
      .limit(limit);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { plantas: data ?? [] },
    };
  },
});