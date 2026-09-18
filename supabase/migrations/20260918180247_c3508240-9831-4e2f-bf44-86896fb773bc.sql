CREATE TABLE public.nomina_salarios (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  salario_mensual numeric NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'USD',
  notas text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nomina_salarios TO authenticated;
GRANT ALL ON public.nomina_salarios TO service_role;

ALTER TABLE public.nomina_salarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gestiona salarios"
ON public.nomina_salarios FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "Cada usuario ve su salario"
ON public.nomina_salarios FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER nomina_salarios_updated_at
BEFORE UPDATE ON public.nomina_salarios
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();