DROP FUNCTION public.disponibilidad_calendario(date, date);

CREATE FUNCTION public.disponibilidad_calendario(_desde date, _hasta date)
RETURNS TABLE(
  fecha_inicio timestamp with time zone,
  duracion_dias integer,
  propio boolean,
  folio text,
  servicio text,
  nombre_trabajo text,
  planta_nombre text,
  estado text,
  excepciones_dia jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    t.fecha_programada,
    t.duracion_dias,
    (p.cliente_id = public.current_cliente_id()) AS propio,
    CASE WHEN p.cliente_id = public.current_cliente_id() THEN t.folio END,
    CASE WHEN p.cliente_id = public.current_cliente_id() THEN t.servicio END,
    CASE WHEN p.cliente_id = public.current_cliente_id() THEN t.nombre_trabajo END,
    CASE WHEN p.cliente_id = public.current_cliente_id() THEN p.nombre END,
    CASE WHEN p.cliente_id = public.current_cliente_id() THEN t.estado::text END,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'fecha_original', e.fecha_original,
            'fecha_movida', e.fecha_movida
          ) ORDER BY e.fecha_original
        )
        FROM public.trabajo_dia_excepciones e
        WHERE e.trabajo_id = t.id
      ),
      '[]'::jsonb
    ) AS excepciones_dia
  FROM public.trabajos t
  JOIN public.plantas p ON p.id = t.planta_id
  WHERE t.estado <> 'cancelado'
    AND t.pausada_at IS NULL
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'supervisor')
      OR public.current_cliente_id() IS NOT NULL
    )
    AND (
      (
        (t.fecha_programada AT TIME ZONE 'America/El_Salvador')::date <= _hasta
        AND (t.fecha_programada AT TIME ZONE 'America/El_Salvador')::date >=
          _desde - (GREATEST(COALESCE(t.duracion_dias, 1), 1) * 4 + 62)
      )
      OR EXISTS (
        SELECT 1
        FROM public.trabajo_dia_excepciones e
        WHERE e.trabajo_id = t.id
          AND e.fecha_movida BETWEEN _desde AND _hasta
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.disponibilidad_calendario(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disponibilidad_calendario(date, date) TO anon, authenticated, service_role;