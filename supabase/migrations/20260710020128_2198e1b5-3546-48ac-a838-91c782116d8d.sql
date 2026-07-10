CREATE OR REPLACE FUNCTION public.enforce_limpieza_un_cliente_por_dia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_inicio date;
  v_fin date;
  v_conflict record;
BEGIN
  IF NEW.estado = 'cancelado' OR NEW.servicio IS NULL OR NEW.servicio NOT ILIKE '%limpieza%' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.planta_id IS NOT DISTINCT FROM OLD.planta_id
    AND NEW.servicio IS NOT DISTINCT FROM OLD.servicio
    AND NEW.fecha_programada IS NOT DISTINCT FROM OLD.fecha_programada
    AND COALESCE(NEW.duracion_dias, 1) IS NOT DISTINCT FROM COALESCE(OLD.duracion_dias, 1)
    AND NEW.estado IS NOT DISTINCT FROM OLD.estado
  THEN
    RETURN NEW;
  END IF;

  SELECT p.cliente_id INTO v_cliente_id
  FROM public.plantas p
  WHERE p.id = NEW.planta_id;

  IF v_cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_inicio := (NEW.fecha_programada AT TIME ZONE 'America/El_Salvador')::date;
  v_fin := v_inicio + (GREATEST(COALESCE(NEW.duracion_dias, 1), 1) - 1);

  SELECT
    t.folio,
    c.nombre AS cliente,
    p.nombre AS planta,
    (t.fecha_programada AT TIME ZONE 'America/El_Salvador')::date AS inicio,
    ((t.fecha_programada AT TIME ZONE 'America/El_Salvador')::date + (GREATEST(COALESCE(t.duracion_dias, 1), 1) - 1)) AS fin
  INTO v_conflict
  FROM public.trabajos t
  JOIN public.plantas p ON p.id = t.planta_id
  JOIN public.clientes c ON c.id = p.cliente_id
  WHERE t.id <> NEW.id
    AND t.estado <> 'cancelado'
    AND t.servicio ILIKE '%limpieza%'
    AND p.cliente_id <> v_cliente_id
    AND (t.fecha_programada AT TIME ZONE 'America/El_Salvador')::date <= v_fin
    AND ((t.fecha_programada AT TIME ZONE 'America/El_Salvador')::date + (GREATEST(COALESCE(t.duracion_dias, 1), 1) - 1)) >= v_inicio
  ORDER BY t.fecha_programada
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Ya existe una limpieza programada para otro cliente el mismo día. Conflicto: % · % · % (% a %)',
      v_conflict.folio,
      v_conflict.cliente,
      v_conflict.planta,
      v_conflict.inicio,
      v_conflict.fin;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trabajos_limpieza_un_cliente_por_dia ON public.trabajos;
CREATE TRIGGER trabajos_limpieza_un_cliente_por_dia
BEFORE INSERT OR UPDATE OF planta_id, servicio, fecha_programada, duracion_dias, estado
ON public.trabajos
FOR EACH ROW
EXECUTE FUNCTION public.enforce_limpieza_un_cliente_por_dia();

CREATE OR REPLACE FUNCTION public.dashboard_kpis_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start timestamptz := ((now() AT TIME ZONE 'America/El_Salvador')::date AT TIME ZONE 'America/El_Salvador');
  v_today_end timestamptz := v_today_start + interval '1 day';
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'trabajos_hoy', (
      SELECT count(*) FROM public.trabajos
      WHERE estado <> 'cancelado'
        AND fecha_programada >= v_today_start
        AND fecha_programada < v_today_end
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
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_kpis_v1() TO authenticated;
