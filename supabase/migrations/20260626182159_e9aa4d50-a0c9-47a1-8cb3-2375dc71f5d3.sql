
-- 1. Reportes diarios por técnico
CREATE TABLE public.trabajo_reportes_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id UUID NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tecnico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avance_pct INTEGER CHECK (avance_pct BETWEEN 0 AND 100),
  paneles_limpiados INTEGER,
  agua_galones NUMERIC,
  horas_trabajadas NUMERIC,
  clima TEXT,
  trabajo_realizado TEXT,
  hallazgos TEXT,
  bloqueos TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trabajo_id, fecha, tecnico_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajo_reportes_diarios TO authenticated;
GRANT ALL ON public.trabajo_reportes_diarios TO service_role;

ALTER TABLE public.trabajo_reportes_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff ve todos los diarios"
  ON public.trabajo_reportes_diarios FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Equipo técnico ve diarios del trabajo asignado"
  ON public.trabajo_reportes_diarios FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'tecnico')
    AND EXISTS (
      SELECT 1 FROM public.trabajos t
      WHERE t.id = trabajo_id
        AND (t.tecnico_id = auth.uid()
             OR EXISTS (
               SELECT 1 FROM public.trabajo_asignaciones_log l
               WHERE l.trabajo_id = t.id AND l.tecnico_nuevo = auth.uid()
             ))
    )
  );

CREATE POLICY "Técnico inserta su propio diario"
  ON public.trabajo_reportes_diarios FOR INSERT
  TO authenticated
  WITH CHECK (
    tecnico_id = auth.uid()
    AND (public.has_role(auth.uid(), 'tecnico')
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'supervisor'))
  );

CREATE POLICY "Autor o staff actualiza diario"
  ON public.trabajo_reportes_diarios FOR UPDATE
  TO authenticated
  USING (
    tecnico_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "Autor o staff elimina diario"
  ON public.trabajo_reportes_diarios FOR DELETE
  TO authenticated
  USING (
    tecnico_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE TRIGGER trabajo_reportes_diarios_updated_at
  BEFORE UPDATE ON public.trabajo_reportes_diarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX trabajo_reportes_diarios_trabajo_fecha
  ON public.trabajo_reportes_diarios(trabajo_id, fecha DESC);

-- 2. Reportes PDF (caso st.solar)
CREATE TABLE public.trabajo_reportes_pdf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id UUID NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  subido_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  nombre_original TEXT,
  tamanio_bytes INTEGER,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajo_reportes_pdf TO authenticated;
GRANT ALL ON public.trabajo_reportes_pdf TO service_role;

ALTER TABLE public.trabajo_reportes_pdf ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff ve todos los PDF"
  ON public.trabajo_reportes_pdf FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Técnico ve sus propios PDF"
  ON public.trabajo_reportes_pdf FOR SELECT
  TO authenticated
  USING (subido_por = auth.uid());

CREATE POLICY "Técnico inserta su PDF"
  ON public.trabajo_reportes_pdf FOR INSERT
  TO authenticated
  WITH CHECK (subido_por = auth.uid());

CREATE POLICY "Autor o staff elimina PDF"
  ON public.trabajo_reportes_pdf FOR DELETE
  TO authenticated
  USING (
    subido_por = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE INDEX trabajo_reportes_pdf_trabajo ON public.trabajo_reportes_pdf(trabajo_id, fecha DESC);

-- 3. Evidencias con fecha del día (opcional)
ALTER TABLE public.trabajo_evidencias ADD COLUMN IF NOT EXISTS fecha DATE;
