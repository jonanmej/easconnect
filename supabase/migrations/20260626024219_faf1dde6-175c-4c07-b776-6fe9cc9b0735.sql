
CREATE OR REPLACE FUNCTION public.reset_operational_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo administradores pueden reiniciar los datos';
  END IF;

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
    public.auditoria_log,
    public.role_audit_log
  RESTART IDENTITY CASCADE;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_operational_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_operational_data() TO authenticated;
