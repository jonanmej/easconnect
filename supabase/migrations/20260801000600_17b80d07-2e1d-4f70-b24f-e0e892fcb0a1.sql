CREATE OR REPLACE FUNCTION public.dashboard_kpis_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/El_Salvador')::date;
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'trabajos_hoy', (
      SELECT count(*) FROM public.trabajos
      WHERE estado <> 'cancelado'
        AND (fecha_programada AT TIME ZONE 'America/El_Salvador')::date <= v_hoy
        AND ((fecha_programada AT TIME ZONE 'America/El_Salvador')::date
             + (GREATEST(COALESCE(duracion_dias,1),1) - 1)) >= v_hoy
    ),
    'trabajos_total', (SELECT count(*) FROM public.trabajos WHERE estado <> 'cancelado'),
    'equipos_total', (SELECT count(*) FROM public.equipos),
    'equipos_operativos', (SELECT count(*) FROM public.equipos WHERE estado = 'operativo'),
    'eficiencia', (
      SELECT COALESCE(round(avg(salud)::numeric, 1)::text, '--') FROM public.equipos WHERE salud IS NOT NULL
    ),
    'alertas', (
      SELECT count(*) FROM public.equipos WHERE estado IN ('mantenimiento','fuera_servicio')
    ),
    'inv_bajo_stock', (
      SELECT count(*) FROM public.inventario_items WHERE stock_actual < stock_minimo
    ),
    'reportes_borrador', (
      SELECT count(*) FROM public.reportes WHERE estado = 'borrador'
    ),
    'paneles_limpiados', (
      COALESCE((
        SELECT sum(COALESCE(p.paneles, 0))::int
        FROM public.trabajos t
        JOIN public.plantas p ON p.id = t.planta_id
        WHERE t.estado = 'completado' AND lower(t.servicio) LIKE '%limpieza%'
      ), 0)
      +
      COALESCE((
        SELECT sum(d.paneles_limpiados)::int
        FROM public.trabajo_reportes_diarios d
        JOIN public.trabajos t ON t.id = d.trabajo_id
        WHERE t.estado = 'en_progreso' AND lower(t.servicio) LIKE '%limpieza%'
      ), 0)
      +
      COALESCE((
        SELECT sum(r.paneles_limpiados)::int
        FROM public.trabajo_reportes r
        JOIN public.trabajos t ON t.id = r.trabajo_id
        WHERE t.estado = 'en_progreso' AND lower(t.servicio) LIKE '%limpieza%'
      ), 0)
    ),
    'paneles_parque', (
      SELECT COALESCE(sum(paneles), 0)::int FROM public.plantas
    ),
    'agua_galones', (
      SELECT COALESCE(round(
        COALESCE((SELECT sum(agua_galones) FROM public.trabajo_reportes), 0)
        +
        COALESCE((SELECT sum(agua_galones) FROM public.trabajo_reportes_diarios), 0)
      )::int, 0)
    ),
    'anomalias_detectadas', (
      SELECT count(*) FROM public.trabajo_evidencias WHERE categoria = 'anomalia'
    ),
    'reportes_diarios_total', (
      SELECT count(*) FROM public.trabajo_reportes_diarios
    ),
    'horas_trabajadas', (
      SELECT COALESCE(round(sum(horas_trabajadas)::numeric, 1)::text, '0')
      FROM public.trabajo_reportes_diarios
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;