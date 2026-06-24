
-- 1) Tabla de contratos
CREATE TABLE public.contratos_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planta_id uuid NOT NULL REFERENCES public.plantas(id) ON DELETE CASCADE,
  servicio text NOT NULL,
  cantidad_anual int NOT NULL CHECK (cantidad_anual >= 1 AND cantidad_anual <= 365),
  anio int NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  fecha_inicio date NOT NULL DEFAULT date_trunc('year', now())::date,
  duracion_dias_default int NOT NULL DEFAULT 1 CHECK (duracion_dias_default >= 1),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (planta_id, servicio, anio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos_servicio TO authenticated;
GRANT ALL ON public.contratos_servicio TO service_role;

ALTER TABLE public.contratos_servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff full contratos"
  ON public.contratos_servicio FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "tecnico select contratos"
  ON public.contratos_servicio FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tecnico'));

CREATE POLICY "cliente select contratos de sus plantas"
  ON public.contratos_servicio FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'cliente')
    AND EXISTS (
      SELECT 1 FROM public.plantas p
      WHERE p.id = contratos_servicio.planta_id
        AND p.cliente_id = public.current_cliente_id()
    )
  );

CREATE TRIGGER contratos_set_updated_at
  BEFORE UPDATE ON public.contratos_servicio
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Columnas nuevas en trabajos
ALTER TABLE public.trabajos
  ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES public.contratos_servicio(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ciclo_numero int,
  ADD COLUMN IF NOT EXISTS auto_generado boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS trabajos_contrato_ciclo_uniq
  ON public.trabajos(contrato_id, ciclo_numero)
  WHERE contrato_id IS NOT NULL AND ciclo_numero IS NOT NULL;

-- 3) Cumplimiento por año
CREATE OR REPLACE FUNCTION public.contrato_cumplimiento(_anio int)
RETURNS TABLE(
  contrato_id uuid,
  planta_id uuid,
  planta_nombre text,
  cliente_id uuid,
  cliente_nombre text,
  servicio text,
  cantidad_anual int,
  programados int,
  completados int,
  pendientes int,
  cumplimiento_pct numeric,
  proxima_fecha timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
    t.proxima_fecha
  FROM public.contratos_servicio c
  JOIN public.plantas p ON p.id = c.planta_id
  JOIN public.clientes cl ON cl.id = p.cliente_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE estado IN ('programado','en_progreso'))::int AS programados,
      COUNT(*) FILTER (WHERE estado = 'completado')::int AS completados,
      MIN(fecha_programada) FILTER (WHERE estado IN ('programado','en_progreso') AND fecha_programada >= now()) AS proxima_fecha
    FROM public.trabajos tr
    WHERE tr.contrato_id = c.id
      AND EXTRACT(YEAR FROM tr.fecha_programada) = _anio
  ) t ON true
  WHERE c.anio = _anio AND c.activo = true
$$;

GRANT EXECUTE ON FUNCTION public.contrato_cumplimiento(int) TO authenticated;
