
ALTER TABLE public.trabajo_evidencias
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'durante'
    CHECK (categoria IN ('antes','durante','despues','anomalia'));

CREATE INDEX IF NOT EXISTS trabajo_evidencias_trabajo_categoria_idx
  ON public.trabajo_evidencias(trabajo_id, categoria);

ALTER TABLE public.trabajo_reportes
  ADD COLUMN IF NOT EXISTS paneles_limpiados integer,
  ADD COLUMN IF NOT EXISTS agua_galones numeric(10,2);
