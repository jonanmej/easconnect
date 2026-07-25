-- 1) trabajos.SELECT: incluir técnicos co-asignados (trabajo_tecnicos) e histórico (trabajo_asignaciones_log)
DROP POLICY IF EXISTS "Read trabajos" ON public.trabajos;
CREATE POLICY "Read trabajos" ON public.trabajos
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supervisor')
  OR (
    public.has_role(auth.uid(), 'tecnico') AND (
      tecnico_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.trabajo_tecnicos tt WHERE tt.trabajo_id = trabajos.id AND tt.tecnico_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.trabajo_asignaciones_log l WHERE l.trabajo_id = trabajos.id AND l.tecnico_nuevo = auth.uid())
    )
  )
  OR (planta_id IN (SELECT p.id FROM public.plantas p WHERE p.cliente_id = public.current_cliente_id()))
);

-- 2) trabajos.UPDATE: técnicos co-asignados pueden actualizar (avanzar estado, etc.)
DROP POLICY IF EXISTS "Update trabajos" ON public.trabajos;
CREATE POLICY "Update trabajos" ON public.trabajos
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supervisor')
  OR (
    public.has_role(auth.uid(), 'tecnico') AND (
      tecnico_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.trabajo_tecnicos tt WHERE tt.trabajo_id = trabajos.id AND tt.tecnico_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.trabajo_asignaciones_log l WHERE l.trabajo_id = trabajos.id AND l.tecnico_nuevo = auth.uid())
    )
  )
);

-- 3) reportes.SELECT: técnicos pueden leer reportes ejecutivos de trabajos donde participaron
DROP POLICY IF EXISTS "Read reportes" ON public.reportes;
CREATE POLICY "Read reportes" ON public.reportes
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supervisor')
  OR (cliente_id = public.current_cliente_id())
  OR (
    public.has_role(auth.uid(), 'tecnico') AND EXISTS (
      SELECT 1
      FROM public.trabajos t
      JOIN public.plantas p ON p.id = t.planta_id
      WHERE p.cliente_id = reportes.cliente_id
        AND (
          t.tecnico_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.trabajo_tecnicos tt WHERE tt.trabajo_id = t.id AND tt.tecnico_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.trabajo_asignaciones_log l WHERE l.trabajo_id = t.id AND l.tecnico_nuevo = auth.uid())
        )
    )
  )
);