DROP POLICY IF EXISTS "Staff gestiona salarios" ON public.nomina_salarios;
DROP POLICY IF EXISTS "Cada usuario ve su salario" ON public.nomina_salarios;
CREATE POLICY "Solo admin gestiona salarios" ON public.nomina_salarios FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Staff gestiona periodos de nomina" ON public.nomina_periodos;
CREATE POLICY "Solo admin gestiona periodos de nomina" ON public.nomina_periodos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Staff gestiona detalle de nomina" ON public.nomina_periodo_detalle;
DROP POLICY IF EXISTS "Cada colaborador ve su propio detalle" ON public.nomina_periodo_detalle;
CREATE POLICY "Solo admin gestiona detalle de nomina" ON public.nomina_periodo_detalle FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));