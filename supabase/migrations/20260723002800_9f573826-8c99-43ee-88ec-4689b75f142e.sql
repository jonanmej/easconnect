
-- Permitir a los clientes aprobar/rechazar sus propios reportes en estado 'enviado'
CREATE POLICY "Cliente aprobar/rechazar reportes"
ON public.reportes FOR UPDATE
TO authenticated
USING (cliente_id = public.current_cliente_id() AND estado = 'enviado')
WITH CHECK (cliente_id = public.current_cliente_id() AND estado IN ('aprobado','rechazado'));

-- Permitir a los clientes registrar su decisión en la auditoría del reporte
CREATE POLICY "cliente_inserta_aud_reportes"
ON public.reporte_auditoria FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reportes r
    WHERE r.id = reporte_id
      AND r.cliente_id = public.current_cliente_id()
  )
);

-- Permitir a los clientes leer la auditoría de sus propios reportes
CREATE POLICY "cliente_lee_aud_reportes"
ON public.reporte_auditoria FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reportes r
    WHERE r.id = reporte_id
      AND r.cliente_id = public.current_cliente_id()
  )
);
