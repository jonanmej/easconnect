import type { ComponentType } from "react";

export type AppRole = "admin" | "supervisor" | "tecnico" | "cliente";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  tecnico: "Técnico / Operador",
  cliente: "Cliente",
};

/** Routes each role is allowed to access. */
export const ROLE_ACCESS: Record<AppRole, string[]> = {
  admin: [
    "/", "/completar-perfil", "/programacion", "/trabajos", "/clientes", "/plantas",
    "/equipos", "/inventario", "/ordenes-compra", "/mantenimientos", "/reportes", "/usuarios",
    "/solicitudes", "/notificaciones", "/auditoria", "/configuracion", "/terreno", "/rutas", "/contratos", "/mapa",
  ],
  // "/search-console": panel interno de métricas SEO (solo admin y supervisor).
  supervisor: [
    "/", "/completar-perfil", "/programacion", "/trabajos", "/clientes", "/plantas",
    "/equipos", "/inventario", "/ordenes-compra", "/mantenimientos", "/reportes",
    "/solicitudes", "/notificaciones", "/configuracion", "/terreno", "/rutas", "/contratos", "/mapa",
  ],
  tecnico: [
    "/", "/completar-perfil", "/programacion", "/trabajos", "/equipos",
    "/inventario", "/ordenes-compra", "/mantenimientos", "/configuracion", "/terreno", "/rutas", "/mapa",
  ],
  cliente: [
    "/", "/completar-perfil", "/plantas", "/trabajos", "/reportes", "/programacion",
    "/solicitudes", "/configuracion", "/mis-trabajos", "/contratos",
  ],
};

export function canAccess(roles: AppRole[], path: string): boolean {
  if (!roles.length) return false;
  return roles.some((r) => ROLE_ACCESS[r]?.includes(path));
}

export function highestRole(roles: AppRole[]): AppRole | null {
  const order: AppRole[] = ["admin", "supervisor", "tecnico", "cliente"];
  return order.find((r) => roles.includes(r)) ?? null;
}