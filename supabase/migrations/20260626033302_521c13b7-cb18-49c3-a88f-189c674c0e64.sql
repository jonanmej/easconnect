
-- 1) Restaurar perfiles faltantes para usuarios ya registrados
INSERT INTO public.profiles (id, display_name, perfil_completado, debe_cambiar_password)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', u.email),
       false,
       false
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 2) Ajustar la función de reinicio para preservar perfiles
CREATE OR REPLACE FUNCTION public.reset_operational_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo administradores pueden reiniciar los datos';
  END IF;

  -- Desvincular perfiles de clientes para que TRUNCATE ... CASCADE
  -- sobre clientes no arrastre la tabla profiles.
  UPDATE public.profiles SET cliente_id = NULL WHERE cliente_id IS NOT NULL;

  TRUNCATE TABLE
    public.trabajo_evidencias,
    public.trabajo_recursos,
    public.trabajo_reportes,
    public.trabajo_equipos,
    public.trabajo_aprobaciones,
    public.trabajo_asignaciones_log,
    public.mantenimientos,
    public.trabajos,
    public.contratos_servicio,
    public.equipos,
    public.inventario_movimientos,
    public.inventario_items,
    public.reportes,
    public.notificaciones_log,
    public.notificaciones_usuario,
    public.password_reset_solicitudes,
    public.solicitudes_visita,
    public.plantas,
    public.clientes,
    public.auditoria_log
  RESTART IDENTITY CASCADE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reset_operational_data() FROM anon, PUBLIC;
