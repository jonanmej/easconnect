
-- 1) trabajo_aprobaciones: restrict client-facing SELECT to cliente role
DROP POLICY IF EXISTS "Cliente ve sus aprobaciones" ON public.trabajo_aprobaciones;
CREATE POLICY "Cliente ve sus aprobaciones"
ON public.trabajo_aprobaciones
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'cliente'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.trabajos t
    JOIN public.plantas p ON p.id = t.planta_id
    WHERE t.id = trabajo_aprobaciones.trabajo_id
      AND p.cliente_id = current_cliente_id()
  )
);

-- 2) password_reset_solicitudes: replace WITH CHECK (true) with sane shape constraints
DROP POLICY IF EXISTS solicitar_reset_publico_insert ON public.password_reset_solicitudes;
CREATE POLICY solicitar_reset_publico_insert
ON public.password_reset_solicitudes
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email IS NOT NULL
  AND length(email) BETWEEN 5 AND 200
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND estado = 'pendiente'
  AND atendida_at IS NULL
  AND atendida_por IS NULL
  AND reenvios = 0
  AND reenviado_at IS NULL
);

-- 3) storage.objects: add scoped INSERT/UPDATE/DELETE policies for firmas-clientes
DROP POLICY IF EXISTS "Subir firma de aprobación" ON storage.objects;
CREATE POLICY "Subir firma de aprobación"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'firmas-clientes'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Actualizar firma de aprobación" ON storage.objects;
CREATE POLICY "Actualizar firma de aprobación"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'firmas-clientes'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
)
WITH CHECK (
  bucket_id = 'firmas-clientes'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
);

DROP POLICY IF EXISTS "Eliminar firma de aprobación" ON storage.objects;
CREATE POLICY "Eliminar firma de aprobación"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'firmas-clientes'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
);
