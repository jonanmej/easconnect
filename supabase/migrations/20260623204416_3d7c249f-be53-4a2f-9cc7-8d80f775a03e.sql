-- Revocar EXECUTE de PUBLIC y anon en funciones SECURITY DEFINER expuestas vía PostgREST.
-- Mantener authenticated solo donde RLS lo requiere (has_role, current_cliente_id).

REVOKE EXECUTE ON FUNCTION public.validar_token_aprobacion(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.firmar_aprobacion(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_cliente_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_role_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_equipo_codigo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_fecha_completado() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_movimiento() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_inventario_sku() FROM PUBLIC, anon, authenticated;

-- Garantizar acceso explícito a las helpers usadas por RLS para usuarios autenticados.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_cliente_id() TO authenticated;