ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS desde timestamp with time zone,
  ADD COLUMN IF NOT EXISTS hasta timestamp with time zone;