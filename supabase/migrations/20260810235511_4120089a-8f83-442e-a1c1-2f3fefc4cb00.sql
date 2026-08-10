ALTER TABLE public.trabajo_reportes_diarios
  ADD COLUMN IF NOT EXISTS fase text NOT NULL DEFAULT 'intervencion';

ALTER TABLE public.trabajo_reportes_diarios
  DROP CONSTRAINT IF EXISTS trabajo_reportes_diarios_fase_check;
ALTER TABLE public.trabajo_reportes_diarios
  ADD CONSTRAINT trabajo_reportes_diarios_fase_check
  CHECK (fase IN ('diagnostico','intervencion','cierre'));

ALTER TABLE public.trabajo_reportes_diarios
  DROP CONSTRAINT IF EXISTS trabajo_reportes_diarios_trabajo_id_fecha_tecnico_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS trabajo_reportes_diarios_trabajo_fecha_tecnico_fase_key
  ON public.trabajo_reportes_diarios (trabajo_id, fecha, tecnico_id, fase);