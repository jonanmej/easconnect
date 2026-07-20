
CREATE TABLE IF NOT EXISTS public.feriados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  anio INTEGER NOT NULL,
  fecha DATE NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'personalizado' CHECK (tipo IN ('nacional','personalizado')),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE (fecha)
);

CREATE INDEX IF NOT EXISTS feriados_anio_idx ON public.feriados(anio);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feriados TO authenticated;
GRANT ALL ON public.feriados TO service_role;

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feriados_select_auth" ON public.feriados;
CREATE POLICY "feriados_select_auth" ON public.feriados
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "feriados_admin_write" ON public.feriados;
CREATE POLICY "feriados_admin_write" ON public.feriados
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS feriados_updated_at ON public.feriados;
CREATE TRIGGER feriados_updated_at
  BEFORE UPDATE ON public.feriados
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.feriados (anio, fecha, nombre, tipo) VALUES
  (2026, '2026-01-01', 'Año Nuevo', 'nacional'),
  (2026, '2026-04-02', 'Jueves Santo', 'nacional'),
  (2026, '2026-04-03', 'Viernes Santo', 'nacional'),
  (2026, '2026-04-04', 'Sábado Santo', 'nacional'),
  (2026, '2026-05-01', 'Día del Trabajo', 'nacional'),
  (2026, '2026-05-10', 'Día de la Madre', 'nacional'),
  (2026, '2026-06-17', 'Día del Padre', 'nacional'),
  (2026, '2026-08-06', 'Fiestas Agostinas', 'nacional'),
  (2026, '2026-09-15', 'Independencia', 'nacional'),
  (2026, '2026-11-02', 'Día de los Difuntos', 'nacional'),
  (2026, '2026-12-25', 'Navidad', 'nacional'),
  (2027, '2027-01-01', 'Año Nuevo', 'nacional'),
  (2027, '2027-03-25', 'Jueves Santo', 'nacional'),
  (2027, '2027-03-26', 'Viernes Santo', 'nacional'),
  (2027, '2027-03-27', 'Sábado Santo', 'nacional'),
  (2027, '2027-05-01', 'Día del Trabajo', 'nacional'),
  (2027, '2027-05-10', 'Día de la Madre', 'nacional'),
  (2027, '2027-06-17', 'Día del Padre', 'nacional'),
  (2027, '2027-08-06', 'Fiestas Agostinas', 'nacional'),
  (2027, '2027-09-15', 'Independencia', 'nacional'),
  (2027, '2027-11-02', 'Día de los Difuntos', 'nacional'),
  (2027, '2027-12-25', 'Navidad', 'nacional')
ON CONFLICT (fecha) DO NOTHING;
