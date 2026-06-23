-- Restaurar EXECUTE en funciones usadas por políticas RLS.
-- Son SECURITY DEFINER con search_path fijo y sólo leen tablas de roles/perfiles,
-- por lo que es seguro que authenticated las invoque (de hecho RLS lo requiere).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_cliente_id() TO authenticated;