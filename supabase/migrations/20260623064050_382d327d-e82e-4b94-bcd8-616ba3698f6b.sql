-- Vista con permisos del invocador (respeta RLS de trabajos/plantas)
ALTER VIEW public.trabajos_sla SET (security_invoker = true);

-- Revocar EXECUTE de funciones-trigger; solo el sistema las invoca
REVOKE EXECUTE ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_fecha_completado() FROM PUBLIC, anon, authenticated;
