-- Clientes: contacto y contrato O&M
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS contrato_om boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cuota_preventivos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cuota_correctivos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cuota_menores integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cuota_medios integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cuota_mayores integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cuota_limpiezas integer NOT NULL DEFAULT 0;

-- Mantenimientos: rango inicio/fin
ALTER TABLE public.mantenimientos
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date;

-- Backfill: inicio = fin = fecha original
UPDATE public.mantenimientos SET fecha_inicio = fecha WHERE fecha_inicio IS NULL;
UPDATE public.mantenimientos SET fecha_fin = fecha WHERE fecha_fin IS NULL;

-- Trabajos: registro de avisos enviados (claves: '30','20','10','5','1')
ALTER TABLE public.trabajos
  ADD COLUMN IF NOT EXISTS avisos_enviados jsonb NOT NULL DEFAULT '{}'::jsonb;