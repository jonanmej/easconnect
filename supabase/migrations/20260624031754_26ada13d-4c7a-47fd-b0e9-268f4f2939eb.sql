
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.current_cliente_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_cliente_id() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.dashboard_kpis_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_kpis_v1() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.validar_token_aprobacion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_token_aprobacion(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.firmar_aprobacion(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.firmar_aprobacion(text, text, text, text, text, text) TO service_role;
