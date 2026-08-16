import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    // Solo las navegaciones de documento reciben la página de error HTML.
    // Las llamadas a server functions / API deben devolver el mensaje real
    // para que la UI pueda mostrarlo (antes se veía "error desconocido").
    const accept = request?.headers?.get("accept") ?? "";
    const url = request ? new URL(request.url) : null;
    const esDocumento = accept.includes("text/html")
      && !(url?.pathname.startsWith("/_serverFn") || url?.searchParams.has("createServerFn"));
    if (!esDocumento) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
