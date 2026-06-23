-- Restringir lectura del bucket firmas-clientes para que un cliente solo pueda
-- ver firmas de trabajos de plantas que pertenecen a SU cliente_id.
DROP POLICY IF EXISTS "Leer firma de aprobación" ON storage.objects;

CREATE POLICY "Leer firma de aprobación"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'firmas-clientes' AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'supervisor')
      OR public.has_role(auth.uid(), 'tecnico')
      OR (
        public.has_role(auth.uid(), 'cliente')
        AND EXISTS (
          SELECT 1
          FROM public.trabajo_aprobaciones a
          JOIN public.trabajos t ON t.id = a.trabajo_id
          JOIN public.plantas p ON p.id = t.planta_id
          WHERE a.firma_storage_path = storage.objects.name
            AND p.cliente_id = public.current_cliente_id()
        )
      )
    )
  );