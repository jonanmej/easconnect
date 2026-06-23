
-- Revoke broad EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_cliente_id() FROM PUBLIC, anon;

-- Trigger-only functions: revoke all execute access (triggers run as table owner)
REVOKE EXECUTE ON FUNCTION public.log_role_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_movimiento() FROM PUBLIC, anon, authenticated;

-- Ensure authenticated users (and service_role) can still call helpers used in RLS policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_cliente_id() TO authenticated, service_role;
