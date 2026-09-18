CREATE TABLE public.nomina_periodos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  anio integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  desde date NOT NULL,
  hasta date NOT NULL,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','cerrado')),
  notas text,
  total_bruto numeric NOT NULL DEFAULT 0,
  total_isss numeric NOT NULL DEFAULT 0,
  total_afp numeric NOT NULL DEFAULT 0,
  total_renta numeric NOT NULL DEFAULT 0,
  total_otros numeric NOT NULL DEFAULT 0,
  total_neto numeric NOT NULL DEFAULT 0,
  cerrado_por uuid,
  cerrado_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (anio, mes)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nomina_periodos TO authenticated;
GRANT ALL ON public.nomina_periodos TO service_role;
ALTER TABLE public.nomina_periodos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gestiona periodos de nomina" ON public.nomina_periodos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE TRIGGER nomina_periodos_updated_at
  BEFORE UPDATE ON public.nomina_periodos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.nomina_periodo_detalle (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  periodo_id uuid NOT NULL REFERENCES public.nomina_periodos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  colaborador text NOT NULL,
  salario_mensual numeric NOT NULL DEFAULT 0,
  valor_hora numeric NOT NULL DEFAULT 0,
  dias integer NOT NULL DEFAULT 0,
  horas_totales numeric NOT NULL DEFAULT 0,
  horas_ord_diurnas numeric NOT NULL DEFAULT 0,
  horas_ord_nocturnas numeric NOT NULL DEFAULT 0,
  horas_extra_diurnas numeric NOT NULL DEFAULT 0,
  horas_extra_nocturnas numeric NOT NULL DEFAULT 0,
  horas_descanso numeric NOT NULL DEFAULT 0,
  horas_feriado numeric NOT NULL DEFAULT 0,
  pago_ordinario numeric NOT NULL DEFAULT 0,
  pago_extras numeric NOT NULL DEFAULT 0,
  pago_descanso numeric NOT NULL DEFAULT 0,
  pago_feriado numeric NOT NULL DEFAULT 0,
  total_bruto numeric NOT NULL DEFAULT 0,
  isss numeric NOT NULL DEFAULT 0,
  afp numeric NOT NULL DEFAULT 0,
  renta numeric NOT NULL DEFAULT 0,
  otros_descuentos numeric NOT NULL DEFAULT 0,
  total_neto numeric NOT NULL DEFAULT 0,
  notas text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (periodo_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nomina_periodo_detalle TO authenticated;
GRANT ALL ON public.nomina_periodo_detalle TO service_role;
ALTER TABLE public.nomina_periodo_detalle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gestiona detalle de nomina" ON public.nomina_periodo_detalle
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Cada colaborador ve su propio detalle" ON public.nomina_periodo_detalle
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER nomina_periodo_detalle_updated_at
  BEFORE UPDATE ON public.nomina_periodo_detalle
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_nomina_detalle_user ON public.nomina_periodo_detalle(user_id);
CREATE INDEX idx_nomina_periodos_anio_mes ON public.nomina_periodos(anio DESC, mes DESC);