
DROP FUNCTION IF EXISTS public.contrato_cumplimiento(integer);

CREATE OR REPLACE FUNCTION public.contrato_cumplimiento(_anio integer)
 RETURNS TABLE(contrato_id uuid, planta_id uuid, planta_nombre text, cliente_id uuid, cliente_nombre text, servicio text, cantidad_anual integer, programados integer, completados integer, pendientes integer, cumplimiento_pct numeric, proxima_fecha timestamp with time zone, fecha_inicio_real timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.planta_id,
    p.nombre,
    p.cliente_id,
    cl.nombre,
    c.servicio,
    c.cantidad_anual,
    COALESCE(t.programados, 0)::int,
    COALESCE(t.completados, 0)::int,
    GREATEST(c.cantidad_anual - COALESCE(t.completados, 0), 0)::int,
    CASE WHEN c.cantidad_anual > 0
      THEN ROUND((COALESCE(t.completados, 0)::numeric / c.cantidad_anual) * 100, 1)
      ELSE 0 END,
    t.proxima_fecha,
    t.fecha_inicio_real
  FROM public.contratos_servicio c
  JOIN public.plantas p ON p.id = c.planta_id
  JOIN public.clientes cl ON cl.id = p.cliente_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE estado IN ('programado','en_progreso'))::int AS programados,
      COUNT(*) FILTER (WHERE estado = 'completado')::int AS completados,
      MIN(fecha_programada) FILTER (WHERE estado IN ('programado','en_progreso') AND fecha_programada >= now()) AS proxima_fecha,
      MIN(fecha_programada) FILTER (WHERE estado = 'completado') AS fecha_inicio_real
    FROM public.trabajos tr
    WHERE tr.contrato_id = c.id
  ) t ON true
  WHERE c.anio = _anio AND c.activo = true
$function$;
