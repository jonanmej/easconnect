CREATE TABLE public.planta_zonas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  planta_id uuid NOT NULL REFERENCES public.plantas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  paneles_estimados integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#22c55e',
  poligono jsonb NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_planta_zonas_planta ON public.planta_zonas(planta_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planta_zonas TO authenticated;
GRANT ALL ON public.planta_zonas TO service_role;

ALTER TABLE public.planta_zonas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planta_zonas_select" ON public.planta_zonas
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'supervisor')
  OR public.has_role(auth.uid(),'tecnico')
  OR EXISTS (
    SELECT 1 FROM public.plantas p
    WHERE p.id = planta_zonas.planta_id
      AND p.cliente_id = public.current_cliente_id()
  )
);

CREATE POLICY "planta_zonas_write" ON public.planta_zonas
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

CREATE TRIGGER trg_planta_zonas_updated_at
BEFORE UPDATE ON public.planta_zonas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reporte_diario_zonas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporte_diario_id uuid NOT NULL REFERENCES public.trabajo_reportes_diarios(id) ON DELETE CASCADE,
  trabajo_id uuid NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  zona_id uuid NOT NULL REFERENCES public.planta_zonas(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'completada',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reporte_diario_zonas_estado_chk CHECK (estado IN ('en_proceso','completada')),
  CONSTRAINT reporte_diario_zonas_unq UNIQUE (reporte_diario_id, zona_id)
);

CREATE INDEX idx_rdz_reporte ON public.reporte_diario_zonas(reporte_diario_id);
CREATE INDEX idx_rdz_trabajo ON public.reporte_diario_zonas(trabajo_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reporte_diario_zonas TO authenticated;
GRANT ALL ON public.reporte_diario_zonas TO service_role;

ALTER TABLE public.reporte_diario_zonas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rdz_select" ON public.reporte_diario_zonas
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'supervisor')
  OR public.has_role(auth.uid(),'tecnico')
  OR EXISTS (
    SELECT 1 FROM public.trabajos t
    JOIN public.plantas p ON p.id = t.planta_id
    WHERE t.id = reporte_diario_zonas.trabajo_id
      AND p.cliente_id = public.current_cliente_id()
  )
);

CREATE POLICY "rdz_write" ON public.reporte_diario_zonas
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'supervisor')
  OR EXISTS (
    SELECT 1 FROM public.trabajo_reportes_diarios d
    WHERE d.id = reporte_diario_zonas.reporte_diario_id
      AND d.tecnico_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'supervisor')
  OR EXISTS (
    SELECT 1 FROM public.trabajo_reportes_diarios d
    WHERE d.id = reporte_diario_zonas.reporte_diario_id
      AND d.tecnico_id = auth.uid()
  )
);

CREATE TRIGGER trg_rdz_updated_at
BEFORE UPDATE ON public.reporte_diario_zonas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();