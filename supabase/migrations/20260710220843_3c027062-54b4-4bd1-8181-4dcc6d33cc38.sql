ALTER TABLE public.trabajo_reportes_diarios
  ADD COLUMN IF NOT EXISTS hora_inicio time,
  ADD COLUMN IF NOT EXISTS hora_fin time;