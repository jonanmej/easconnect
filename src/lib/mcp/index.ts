import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPlantasTool from "./tools/list-plantas";
import listTrabajosTool from "./tools/list-trabajos";

// The OAuth issuer MUST be the direct Supabase host. On publish, SUPABASE_URL
// is rewritten to the `.lovable.cloud` proxy, which mcp-js rejects.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "ea-service-connect-mcp",
  title: "EA Service Connect",
  version: "0.1.0",
  instructions:
    "Herramientas para consultar plantas solares y órdenes de trabajo (trabajos) de EA Service Connect como el usuario autenticado. Todas las lecturas respetan los permisos por rol (admin, supervisor, técnico, cliente).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listPlantasTool, listTrabajosTool],
});