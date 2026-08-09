-- Técnico: solo sus propios reportes diarios
DROP POLICY IF EXISTS "Equipo técnico ve diarios del trabajo asignado" ON public.trabajo_reportes_diarios;

CREATE POLICY "Tecnico ve solo sus propios diarios"
ON public.trabajo_reportes_diarios FOR SELECT
TO authenticated
USING (tecnico_id = auth.uid());
