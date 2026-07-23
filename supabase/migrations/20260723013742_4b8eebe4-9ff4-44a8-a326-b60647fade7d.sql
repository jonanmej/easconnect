
-- 1) Backfill: enlaza trabajos existentes con su contrato por planta+servicio+año
UPDATE public.trabajos t
SET contrato_id = c.id
FROM public.contratos_servicio c
WHERE t.contrato_id IS NULL
  AND c.activo = true
  AND c.planta_id = t.planta_id
  AND lower(btrim(c.servicio)) = lower(btrim(t.servicio))
  AND c.anio = EXTRACT(YEAR FROM (t.fecha_programada AT TIME ZONE 'America/El_Salvador'))::int;

-- 2) Trigger para autoenlazar en INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.autolink_trabajo_contrato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anio int;
BEGIN
  IF NEW.contrato_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.planta_id IS NULL OR NEW.servicio IS NULL OR NEW.fecha_programada IS NULL THEN
    RETURN NEW;
  END IF;
  v_anio := EXTRACT(YEAR FROM (NEW.fecha_programada AT TIME ZONE 'America/El_Salvador'))::int;
  SELECT c.id INTO NEW.contrato_id
  FROM public.contratos_servicio c
  WHERE c.activo = true
    AND c.planta_id = NEW.planta_id
    AND lower(btrim(c.servicio)) = lower(btrim(NEW.servicio))
    AND c.anio = v_anio
  LIMIT 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autolink_trabajo_contrato ON public.trabajos;
CREATE TRIGGER trg_autolink_trabajo_contrato
BEFORE INSERT OR UPDATE OF planta_id, servicio, fecha_programada, contrato_id
ON public.trabajos
FOR EACH ROW
EXECUTE FUNCTION public.autolink_trabajo_contrato();

-- 3) Cálculo del cumplimiento con fallback por planta+servicio+año
CREATE OR REPLACE FUNCTION public.contrato_cumplimiento(_anio integer)
 RETURNS TABLE(contrato_id uuid, planta_id uuid, planta_nombre text, cliente_id uuid, cliente_nombre text, servicio text, cantidad_anual integer, programados integer, completados integer, pendientes integer, cumplimiento_pct numeric, proxima_fecha timestamp with time zone, fecha_inicio_real timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
    WHERE tr.estado <> 'cancelado'
      AND (
        tr.contrato_id = c.id
        OR (
          tr.contrato_id IS NULL
          AND tr.planta_id = c.planta_id
          AND lower(btrim(tr.servicio)) = lower(btrim(c.servicio))
          AND EXTRACT(YEAR FROM (tr.fecha_programada AT TIME ZONE 'America/El_Salvador'))::int = c.anio
        )
      )
  ) t ON true
  WHERE c.anio = _anio AND c.activo = true
    AND (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'supervisor')
      OR public.has_role(auth.uid(),'tecnico')
      OR p.cliente_id = public.current_cliente_id()
    )
$function$;
