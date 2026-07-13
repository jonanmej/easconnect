ALTER TABLE public.trabajo_reportes_diarios
  ADD COLUMN IF NOT EXISTS tds_ppm numeric,
  ADD COLUMN IF NOT EXISTS angulo_inclinacion numeric,
  ADD COLUMN IF NOT EXISTS presion_agua_psi numeric;