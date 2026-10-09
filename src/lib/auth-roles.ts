/**
 * Verificación única de roles para funciones de servidor.
 * Siempre consulta la base de datos (tabla user_roles vía RLS del propio usuario);
 * nunca confía en datos enviados por la interfaz.
 */
import type { AppRole } from "@/lib/roles";

export async function rolesDelUsuario(supabase: any, userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("No se pudo verificar permisos");
  return (data ?? []).map((r: any) => r.role as AppRole);
}

/** Lanza error si el usuario no tiene ninguno de los roles permitidos. Devuelve sus roles. */
export async function requireRol(
  supabase: any,
  userId: string,
  permitidos: AppRole[],
  mensaje = "No autorizado",
): Promise<AppRole[]> {
  const roles = await rolesDelUsuario(supabase, userId);
  if (!roles.some((r) => permitidos.includes(r))) throw new Error(mensaje);
  return roles;
}

export const STAFF: AppRole[] = ["admin", "supervisor"];
export const INTERNO: AppRole[] = ["admin", "supervisor", "tecnico"];
