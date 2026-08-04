DROP POLICY IF EXISTS "feriados_select_auth" ON public.feriados;
CREATE POLICY "feriados_select_roles" ON public.feriados
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supervisor')
  OR public.has_role(auth.uid(), 'tecnico')
  OR public.has_role(auth.uid(), 'cliente')
);

DROP POLICY IF EXISTS "Supervisors read all roles" ON public.user_roles;
CREATE POLICY "Supervisors read operational roles" ON public.user_roles
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor')
  AND role <> 'admin'::app_role
);