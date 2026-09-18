DROP POLICY IF EXISTS "tecnico crea su jornada" ON public.jornadas_laborales;
CREATE POLICY "tecnico o staff crea jornada"
ON public.jornadas_laborales
FOR INSERT
TO authenticated
WITH CHECK (
  tecnico_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);