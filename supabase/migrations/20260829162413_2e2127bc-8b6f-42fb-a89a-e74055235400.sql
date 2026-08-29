DROP POLICY IF EXISTS "admin elimina jornada" ON public.jornadas_laborales;
CREATE POLICY "admin o supervisor elimina jornada" ON public.jornadas_laborales
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));