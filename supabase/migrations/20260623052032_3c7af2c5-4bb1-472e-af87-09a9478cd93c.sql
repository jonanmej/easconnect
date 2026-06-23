-- Staff: ALL en el bucket trabajos-evidencia
CREATE POLICY "Staff lee evidencias storage"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'trabajos-evidencia' AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'tecnico')
  )
);

CREATE POLICY "Staff sube evidencias storage"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'trabajos-evidencia' AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'tecnico')
  )
);

CREATE POLICY "Staff actualiza evidencias storage"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'trabajos-evidencia' AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'tecnico')
  )
);

CREATE POLICY "Staff borra evidencias storage"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'trabajos-evidencia' AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'tecnico')
  )
);

-- Cliente: SELECT solo si el path es trabajos/{trabajo_id}/... y ese trabajo pertenece a una planta suya
CREATE POLICY "Cliente lee sus evidencias storage"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'trabajos-evidencia'
  AND public.has_role(auth.uid(), 'cliente')
  AND EXISTS (
    SELECT 1
    FROM public.trabajos t
    JOIN public.plantas p ON p.id = t.planta_id
    WHERE p.cliente_id = public.current_cliente_id()
      AND (storage.foldername(name))[2] = t.id::text
  )
);