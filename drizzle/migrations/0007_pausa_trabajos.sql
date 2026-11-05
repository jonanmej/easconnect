ALTER TABLE public.trabajos ADD COLUMN pausada_at timestamptz, ADD COLUMN pausa_motivo text, ADD COLUMN pausada_por uuid;
CREATE INDEX IF NOT EXISTS trabajos_pausada_idx ON public.trabajos (pausada_at) WHERE pausada_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.disponibilidad_calendario(_desde date, _hasta date)
RETURNS TABLE(fecha_inicio timestamptz, duracion_dias integer, propio boolean, folio text, servicio text, nombre_trabajo text, planta_nombre text, estado text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.fecha_programada, t.duracion_dias,
    (p.cliente_id = public.current_cliente_id()) AS propio,
    CASE WHEN p.cliente_id = public.current_cliente_id() THEN t.folio END,
    CASE WHEN p.cliente_id = public.current_cliente_id() THEN t.servicio END,
    CASE WHEN p.cliente_id = public.current_cliente_id() THEN t.nombre_trabajo END,
    CASE WHEN p.cliente_id = public.current_cliente_id() THEN p.nombre END,
    CASE WHEN p.cliente_id = public.current_cliente_id() THEN t.estado::text END
  FROM public.trabajos t
  JOIN public.plantas p ON p.id = t.planta_id
  WHERE t.fecha_programada::date <= _hasta
    AND (t.fecha_programada::date + (t.duracion_dias - 1)) >= _desde
    AND t.estado <> 'cancelado'
    AND t.pausada_at IS NULL
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'supervisor')
      OR public.current_cliente_id() IS NOT NULL
    );
$$;
GRANT EXECUTE ON FUNCTION public.disponibilidad_calendario(date, date) TO authenticated;