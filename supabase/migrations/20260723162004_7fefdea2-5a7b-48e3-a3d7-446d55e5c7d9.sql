CREATE TABLE public.trabajo_dia_excepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id uuid NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  fecha_original date NOT NULL,
  fecha_movida date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trabajo_id, fecha_original)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajo_dia_excepciones TO authenticated;
GRANT ALL ON public.trabajo_dia_excepciones TO service_role;

ALTER TABLE public.trabajo_dia_excepciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage excepciones dia"
  ON public.trabajo_dia_excepciones
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

CREATE POLICY "tecnico read excepciones dia"
  ON public.trabajo_dia_excepciones
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'tecnico'));

CREATE POLICY "cliente read excepciones dia"
  ON public.trabajo_dia_excepciones
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trabajos t
      JOIN public.plantas p ON p.id = t.planta_id
      WHERE t.id = trabajo_dia_excepciones.trabajo_id
        AND p.cliente_id = public.current_cliente_id()
    )
  );

CREATE INDEX idx_trabajo_dia_excepciones_trabajo ON public.trabajo_dia_excepciones(trabajo_id);
CREATE INDEX idx_trabajo_dia_excepciones_fecha_movida ON public.trabajo_dia_excepciones(fecha_movida);

CREATE TRIGGER trg_trabajo_dia_excepciones_updated_at
  BEFORE UPDATE ON public.trabajo_dia_excepciones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();