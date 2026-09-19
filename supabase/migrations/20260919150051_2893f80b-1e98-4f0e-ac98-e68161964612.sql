ALTER TABLE public.nomina_periodos
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'mes',
  ADD COLUMN IF NOT EXISTS corte_clave text NOT NULL DEFAULT 'mes',
  ADD COLUMN IF NOT EXISTS corte_label text;

ALTER TABLE public.nomina_periodos
  DROP CONSTRAINT IF EXISTS nomina_periodos_anio_mes_key;

ALTER TABLE public.nomina_periodos
  ADD CONSTRAINT nomina_periodos_tipo_check CHECK (tipo IN ('mes','quincena','semana'));

CREATE UNIQUE INDEX IF NOT EXISTS nomina_periodos_corte_uidx
  ON public.nomina_periodos (anio, mes, corte_clave);