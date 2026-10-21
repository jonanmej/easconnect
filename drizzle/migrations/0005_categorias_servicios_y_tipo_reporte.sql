ALTER TABLE public.servicios_catalogo ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'Fotovoltaica';

-- Backfill: el servicio de motores pertenece a la categoría Motores HFO.
UPDATE public.servicios_catalogo SET categoria = 'Motores HFO' WHERE nombre = 'Mantenimiento de motores';

-- Tipo de reporte: 'final' (cliente, abarca todo el trabajo) o 'diario' (uso interno).
ALTER TABLE public.reportes ADD COLUMN IF NOT EXISTS tipo_reporte TEXT NOT NULL DEFAULT 'final';
ALTER TABLE public.reportes ADD CONSTRAINT reportes_tipo_reporte_check CHECK (tipo_reporte IN ('diario', 'final'));