
-- Subir firma: cualquier sesión (anónima incluida) puede subir, ya que el flujo público
-- se valida por token en la función firmar_aprobacion. El path es generado server-side.
CREATE POLICY "Subir firma de aprobación"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'firmas-clientes');

-- Staff y cliente dueño pueden leer firmas (lectura pública por bucket privado vía signed URL).
CREATE POLICY "Leer firma de aprobación"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'firmas-clientes' AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'supervisor')
      OR public.has_role(auth.uid(), 'tecnico')
      OR public.has_role(auth.uid(), 'cliente')
    )
  );
