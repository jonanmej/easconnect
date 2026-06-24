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
    "/equipos", "/inventario", "/mantenimientos", "/reportes", "/usuarios",
    "/solicitudes", "/notificaciones", "/auditoria", "/configuracion", "/terreno", "/rutas",
  ],
  supervisor: [
    "/", "/completar-perfil", "/programacion", "/trabajos", "/clientes", "/plantas",
    "/equipos", "/inventario", "/mantenimientos", "/reportes",
    "/solicitudes", "/notificaciones", "/configuracion", "/terreno", "/rutas",
  ],
  tecnico: [
    "/", "/completar-perfil", "/programacion", "/trabajos", "/equipos",
    "/inventario", "/mantenimientos", "/notificaciones", "/configuracion", "/terreno", "/rutas",
  ],
  cliente: ["/", "/completar-perfil", "/plantas", "/trabajos", "/reportes", "/programacion", "/solicitudes", "/notificaciones", "/configuracion", "/mis-trabajos"],
};

export function canAccess(roles: AppRole[], path: string): boolean {
  if (!roles.length) return false;
  return roles.some((r) => ROLE_ACCESS[r]?.includes(path));
}

export function highestRole(roles: AppRole[]): AppRole | null {
  const order: AppRole[] = ["admin", "supervisor", "tecnico", "cliente"];
  return order.find((r) => roles.includes(r)) ?? null;
}