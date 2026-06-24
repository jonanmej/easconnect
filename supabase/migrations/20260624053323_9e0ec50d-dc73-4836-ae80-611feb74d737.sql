-- Revocar EXECUTE público sobre la función de trigger interna
REVOKE EXECUTE ON FUNCTION public.log_asignacion_trabajo() FROM PUBLIC, anon;

-- Revocar EXECUTE de anon en la validación de conflicto (uso interno autenticado)
REVOKE EXECUTE ON FUNCTION public.verificar_conflicto_tecnico(uuid, timestamptz, integer, uuid) FROM PUBLIC, anon;