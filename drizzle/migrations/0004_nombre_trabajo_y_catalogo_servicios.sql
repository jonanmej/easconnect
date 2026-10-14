ALTER TABLE public.trabajos ADD COLUMN nombre_trabajo text;
COMMENT ON COLUMN public.trabajos.nombre_trabajo IS 'Nombre específico del trabajo (ej. «Desmontaje de inversores y cambio de combiner box»); complementa al servicio del catálogo.';

CREATE TABLE public.servicios_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  contratable boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.servicios_catalogo TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.servicios_catalogo TO authenticated;
GRANT ALL ON public.servicios_catalogo TO service_role;
ALTER TABLE public.servicios_catalogo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal autenticado lee el catálogo de servicios"
  ON public.servicios_catalogo FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Solo admin gestiona el catálogo de servicios"
  ON public.servicios_catalogo FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Solo admin edita el catálogo de servicios"
  ON public.servicios_catalogo FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Solo admin elimina del catálogo de servicios"
  ON public.servicios_catalogo FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP FUNCTION public.disponibilidad_calendario(date, date);
CREATE FUNCTION public.disponibilidad_calendario(_desde date, _hasta date)
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
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'supervisor')
      OR public.current_cliente_id() IS NOT NULL
    );
$$;
GRANT EXECUTE ON FUNCTION public.disponibilidad_calendario(date, date) TO authenticated;