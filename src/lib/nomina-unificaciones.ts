/**
 * Cuentas distintas que pertenecen a la misma persona (trabaja con varios roles).
 * Para nómina, las marcaciones de la cuenta secundaria se suman a la principal.
 * clave = cuenta secundaria, valor = cuenta principal.
 */
export const UNIFICACION_COLABORADORES: Record<string, string> = {
  // Jonathan Antonio Mejía Membreño: cuenta admin → cuenta técnico
  "288113af-df67-4d57-8522-57cefae968c0": "7978a181-0542-4e32-98f6-be9872ddc2d0",
};

export const colaboradorPrincipal = (id: string) => UNIFICACION_COLABORADORES[id] ?? id;

export const cuentasDe = (principal: string) => [
  principal,
  ...Object.entries(UNIFICACION_COLABORADORES)
    .filter(([, p]) => p === principal)
    .map(([s]) => s),
];
