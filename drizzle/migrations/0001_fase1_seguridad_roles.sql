-- M1: funciones de trigger no deben ser invocables por usuarios
REVOKE EXECUTE ON FUNCTION public.apply_movimiento() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.autolink_trabajo_contrato() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_notificaciones_trabajo_resuelto() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_asignacion_trabajo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_role_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_contrato_capacitacion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_trabajo_capacitacion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_trabajo_evidencia() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_limpieza_un_cliente_por_dia() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_equipo_codigo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_inventario_sku() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_fecha_completado() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Firma por token: solo el servidor (service_role) las llama
REVOKE EXECUTE ON FUNCTION public.firmar_aprobacion(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_token_aprobacion(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.firmar_aprobacion(text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.validar_token_aprobacion(text) TO service_role;

-- Funciones de negocio: sin acceso anónimo
REVOKE EXECUTE ON FUNCTION public.cambiar_estado_oc(uuid, public.oc_estado, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.editar_recepcion_item_oc(uuid, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_recepcion_oc(uuid, jsonb, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_operational_data() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.contrato_cumplimiento(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_oc(uuid, public.oc_estado, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editar_recepcion_item_oc(uuid, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_recepcion_oc(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_operational_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.contrato_cumplimiento(integer) TO authenticated;

-- dashboard_kpis_v1: solo personal interno (datos globales de todos los clientes)
CREATE OR REPLACE FUNCTION public.dashboard_kpis_v1()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/El_Salvador')::date;
  v_result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico')) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT jsonb_build_object(
    'trabajos_hoy', (SELECT count(*) FROM public.trabajos WHERE estado <> 'cancelado'
        AND (fecha_programada AT TIME ZONE 'America/El_Salvador')::date <= v_hoy
        AND ((fecha_programada AT TIME ZONE 'America/El_Salvador')::date + (GREATEST(COALESCE(duracion_dias,1),1) - 1)) >= v_hoy),
    'trabajos_total', (SELECT count(*) FROM public.trabajos WHERE estado <> 'cancelado'),
    'equipos_total', (SELECT count(*) FROM public.equipos),
    'equipos_operativos', (SELECT count(*) FROM public.equipos WHERE estado = 'operativo'),
    'eficiencia', (SELECT COALESCE(round(avg(salud)::numeric, 1)::text, '--') FROM public.equipos WHERE salud IS NOT NULL),
    'alertas', (SELECT count(*) FROM public.equipos WHERE estado IN ('mantenimiento','fuera_servicio')),
    'inv_bajo_stock', (SELECT count(*) FROM public.inventario_items WHERE stock_actual < stock_minimo),
    'reportes_borrador', (SELECT count(*) FROM public.reportes WHERE estado = 'borrador'),
    'paneles_limpiados', (
      COALESCE((SELECT sum(COALESCE(p.paneles, 0))::int FROM public.trabajos t JOIN public.plantas p ON p.id = t.planta_id
        WHERE t.estado = 'completado' AND lower(t.servicio) LIKE '%limpieza%'), 0)
      + COALESCE((SELECT sum(d.paneles_limpiados)::int FROM public.trabajo_reportes_diarios d JOIN public.trabajos t ON t.id = d.trabajo_id
        WHERE t.estado = 'en_progreso' AND lower(t.servicio) LIKE '%limpieza%'), 0)
      + COALESCE((SELECT sum(r.paneles_limpiados)::int FROM public.trabajo_reportes r JOIN public.trabajos t ON t.id = r.trabajo_id
        WHERE t.estado = 'en_progreso' AND lower(t.servicio) LIKE '%limpieza%'), 0)),
    'paneles_parque', (SELECT COALESCE(sum(paneles), 0)::int FROM public.plantas),
    'agua_galones', (SELECT COALESCE(round(
        COALESCE((SELECT sum(agua_galones) FROM public.trabajo_reportes), 0)
        + COALESCE((SELECT sum(agua_galones) FROM public.trabajo_reportes_diarios), 0))::int, 0)),
    'anomalias_detectadas', (SELECT count(*) FROM public.trabajo_evidencias WHERE categoria = 'anomalia'),
    'reportes_diarios_total', (SELECT count(*) FROM public.trabajo_reportes_diarios),
    'horas_trabajadas', (SELECT COALESCE(round(sum(horas_trabajadas)::numeric, 1)::text, '0') FROM public.trabajo_reportes_diarios)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.dashboard_kpis_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_kpis_v1() TO authenticated;

-- verificar_conflicto_tecnico: solo personal interno (devuelve folios de cualquier cliente)
CREATE OR REPLACE FUNCTION public.verificar_conflicto_tecnico(_tecnico_id uuid, _fecha timestamp with time zone, _duracion_dias integer, _excluir_trabajo_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, folio text, fecha_programada timestamp with time zone, duracion_dias integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico')) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  RETURN QUERY
  SELECT t.id, t.folio, t.fecha_programada, t.duracion_dias
  FROM public.trabajos t
  WHERE t.tecnico_id = _tecnico_id
    AND t.estado <> 'cancelado'
    AND (_excluir_trabajo_id IS NULL OR t.id <> _excluir_trabajo_id)
    AND daterange((t.fecha_programada AT TIME ZONE 'UTC')::date,
          ((t.fecha_programada AT TIME ZONE 'UTC')::date + GREATEST(COALESCE(t.duracion_dias,1),1)), '[)')
     && daterange((_fecha AT TIME ZONE 'UTC')::date,
          ((_fecha AT TIME ZONE 'UTC')::date + GREATEST(COALESCE(_duracion_dias,1),1)), '[)');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.verificar_conflicto_tecnico(uuid, timestamptz, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_conflicto_tecnico(uuid, timestamptz, integer, uuid) TO authenticated;

-- M2: el cliente responde un reporte solo vía función
CREATE OR REPLACE FUNCTION public.responder_reporte_cliente(_reporte_id uuid, _aprobar boolean, _motivo text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rep RECORD;
  v_nuevo public.reporte_estado;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'cliente') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT id, cliente_id, estado, version INTO v_rep FROM public.reportes WHERE id = _reporte_id FOR UPDATE;
  IF v_rep.id IS NULL OR v_rep.cliente_id IS DISTINCT FROM public.current_cliente_id() THEN
    RAISE EXCEPTION 'No tienes permiso para aprobar o rechazar este reporte';
  END IF;
  IF v_rep.estado <> 'enviado' THEN
    RAISE EXCEPTION 'Solo reportes enviados pueden aprobarse o rechazarse';
  END IF;
  IF _aprobar THEN
    v_nuevo := 'aprobado';
    UPDATE public.reportes SET estado = v_nuevo, aprobado_at = now(), aprobado_por = v_uid WHERE id = _reporte_id;
  ELSE
    IF _motivo IS NULL OR length(btrim(_motivo)) < 4 THEN
      RAISE EXCEPTION 'Debes indicar el motivo del rechazo';
    END IF;
    v_nuevo := 'rechazado';
    UPDATE public.reportes SET estado = v_nuevo, rechazado_at = now(), rechazado_por = v_uid,
      motivo_rechazo = left(_motivo, 500) WHERE id = _reporte_id;
  END IF;
  INSERT INTO public.reporte_auditoria(reporte_id, accion, estado_anterior, estado_nuevo, version, comentario, actor)
  VALUES (_reporte_id, CASE WHEN _aprobar THEN 'aprobar' ELSE 'rechazar' END, 'enviado', v_nuevo::text,
          v_rep.version, CASE WHEN _aprobar THEN _motivo ELSE left(_motivo, 500) END, v_uid);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.responder_reporte_cliente(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.responder_reporte_cliente(uuid, boolean, text) TO authenticated;

DROP POLICY IF EXISTS "Cliente aprobar/rechazar reportes" ON public.reportes;

-- M5: supervisor solo lectura en jornadas
DROP POLICY IF EXISTS "tecnico o staff crea jornada" ON public.jornadas_laborales;
DROP POLICY IF EXISTS "tecnico actualiza su jornada" ON public.jornadas_laborales;
DROP POLICY IF EXISTS "admin o supervisor elimina jornada" ON public.jornadas_laborales;
CREATE POLICY "propia o admin crea jornada" ON public.jornadas_laborales FOR INSERT TO authenticated
  WITH CHECK (tecnico_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "propia o admin actualiza jornada" ON public.jornadas_laborales FOR UPDATE TO authenticated
  USING (tecnico_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tecnico_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin elimina jornada" ON public.jornadas_laborales FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- M5: unificación de cuentas como dato (solo admin)
CREATE TABLE public.colaborador_unificaciones (
  cuenta_secundaria uuid PRIMARY KEY,
  cuenta_principal uuid NOT NULL,
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cuenta_secundaria <> cuenta_principal)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaborador_unificaciones TO authenticated;
GRANT ALL ON public.colaborador_unificaciones TO service_role;
ALTER TABLE public.colaborador_unificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo admin gestiona unificaciones" ON public.colaborador_unificaciones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.colaborador_unificaciones(cuenta_secundaria, cuenta_principal, notas)
VALUES ('288113af-df67-4d57-8522-57cefae968c0', '7978a181-0542-4e32-98f6-be9872ddc2d0', 'Jonathan Antonio Mejía Membreño: cuenta técnico unificada con cuenta admin');