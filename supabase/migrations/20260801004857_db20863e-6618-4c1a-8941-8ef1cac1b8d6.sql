DROP POLICY IF EXISTS "Staff insert mantenimientos" ON public.mantenimientos;
CREATE POLICY "Staff insert mantenimientos"
ON public.mantenimientos FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'supervisor')
  OR (has_role(auth.uid(),'tecnico') AND tecnico_id = auth.uid())
);

DROP POLICY IF EXISTS "Admin delete mantenimientos" ON public.mantenimientos;
CREATE POLICY "Admin delete mantenimientos"
ON public.mantenimientos FOR DELETE TO authenticated
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'supervisor')
  OR (has_role(auth.uid(),'tecnico') AND tecnico_id = auth.uid())
);