CREATE OR REPLACE FUNCTION public.enforce_limpieza_un_cliente_por_dia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente_id uuid;
  v_inicio date;
  v_fin date;
  v_conflict record;
BEGIN
  IF NEW.estado = 'cancelado' OR NEW.servicio IS NULL THEN
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
    t.servicio,
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
    AND lower(btrim(t.servicio)) = lower(btrim(NEW.servicio))
    AND p.cliente_id <> v_cliente_id
    AND (t.fecha_programada AT TIME ZONE 'America/El_Salvador')::date <= v_fin
    AND ((t.fecha_programada AT TIME ZONE 'America/El_Salvador')::date + (GREATEST(COALESCE(t.duracion_dias, 1), 1) - 1)) >= v_inicio
  ORDER BY t.fecha_programada
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Ya existe otro cliente con "%" programado el mismo día. Conflicto: % · % · % (% a %). Elige otro día o coordina con el cliente.',
      v_conflict.servicio,
      v_conflict.folio,
      v_conflict.cliente,
      v_conflict.planta,
      v_conflict.inicio,
      v_conflict.fin;
  END IF;

  RETURN NEW;
END;
$function$;