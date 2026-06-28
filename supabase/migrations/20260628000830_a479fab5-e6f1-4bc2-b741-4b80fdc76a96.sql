
ALTER TABLE public.trabajo_evidencias
  ADD COLUMN IF NOT EXISTS reporte_diario_id uuid
    REFERENCES public.trabajo_reportes_diarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS trabajo_evidencias_reporte_diario_idx
  ON public.trabajo_evidencias(reporte_diario_id);

-- Validación: el reporte diario debe pertenecer al mismo trabajo,
-- y el storage_path debe estar bajo trabajos/<trabajo_id>/.
CREATE OR REPLACE FUNCTION public.validar_trabajo_evidencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trabajo uuid;
BEGIN
  IF NEW.reporte_diario_id IS NOT NULL THEN
    SELECT trabajo_id INTO v_trabajo
    FROM public.trabajo_reportes_diarios
    WHERE id = NEW.reporte_diario_id;
    IF v_trabajo IS NULL THEN
      RAISE EXCEPTION 'reporte_diario_id no existe';
    END IF;
    IF v_trabajo <> NEW.trabajo_id THEN
      RAISE EXCEPTION 'El reporte diario no pertenece al trabajo indicado';
    END IF;
  END IF;

  IF NEW.storage_path IS NULL
     OR NEW.storage_path NOT LIKE ('trabajos/' || NEW.trabajo_id::text || '/%') THEN
    RAISE EXCEPTION 'storage_path debe comenzar con trabajos/<trabajo_id>/';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validar_trabajo_evidencia() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trabajo_evidencias_validar ON public.trabajo_evidencias;
CREATE TRIGGER trabajo_evidencias_validar
  BEFORE INSERT OR UPDATE ON public.trabajo_evidencias
  FOR EACH ROW EXECUTE FUNCTION public.validar_trabajo_evidencia();

-- Ampliar visibilidad de evidencias al técnico asignado (titular/adicional/log).
DROP POLICY IF EXISTS "Tecnico asignado ve evidencias" ON public.trabajo_evidencias;
CREATE POLICY "Tecnico asignado ve evidencias"
  ON public.trabajo_evidencias FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'tecnico'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.trabajos t
      WHERE t.id = trabajo_evidencias.trabajo_id
        AND (
          t.tecnico_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.trabajo_tecnicos tt
                     WHERE tt.trabajo_id = t.id AND tt.tecnico_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.trabajo_asignaciones_log l
                     WHERE l.trabajo_id = t.id AND l.tecnico_nuevo = auth.uid())
        )
    )
  );
