
CREATE OR REPLACE FUNCTION public.dashboard_kpis_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today_start TIMESTAMPTZ := date_trunc('day', now());
  v_today_end   TIMESTAMPTZ := v_today_start + interval '1 day';
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'trabajos_hoy', (
      SELECT count(*) FROM public.trabajos
      WHERE fecha_programada >= v_today_start AND fecha_programada < v_today_end
    ),
    'trabajos_total', (SELECT count(*) FROM public.trabajos),
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
      SELECT COALESCE(
        (SELECT sum(paneles_limpiados) FROM public.trabajo_reportes), 0
      )::int
      +
      COALESCE(
        (SELECT sum(paneles_limpiados) FROM public.trabajo_reportes_diarios), 0
      )::int
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
