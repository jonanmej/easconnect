ALTER TABLE public.nomina_salarios
  ADD COLUMN IF NOT EXISTS modalidad text NOT NULL DEFAULT 'mensual',
  ADD COLUMN IF NOT EXISTS pago_diario numeric NOT NULL DEFAULT 0;

ALTER TABLE public.nomina_salarios
  ADD CONSTRAINT nomina_salarios_modalidad_check CHECK (modalidad IN ('mensual', 'diario'));