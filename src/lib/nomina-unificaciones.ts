/**
 * Cuentas distintas que pertenecen a la misma persona (trabaja con varios roles).
 * Para nómina, las marcaciones de la cuenta secundaria se suman a la principal.
 * Los datos viven en la tabla `colaborador_unificaciones` (solo administradores).
 */
export type Unificaciones = {
  colaboradorPrincipal: (id: string) => string;
  cuentasDe: (principal: string) => string[];
};

export async function cargarUnificaciones(supabase: any): Promise<Unificaciones> {
  const { data, error } = await supabase
    .from("colaborador_unificaciones")
    .select("cuenta_secundaria, cuenta_principal");
  if (error) throw new Error(`No se pudieron leer las cuentas unificadas: ${error.message}`);
  const mapa: Record<string, string> = {};
  for (const r of data ?? []) mapa[r.cuenta_secundaria as string] = r.cuenta_principal as string;
  return {
    colaboradorPrincipal: (id) => mapa[id] ?? id,
    cuentasDe: (principal) => [
      principal,
      ...Object.entries(mapa).filter(([, p]) => p === principal).map(([s]) => s),
    ],
  };
}
