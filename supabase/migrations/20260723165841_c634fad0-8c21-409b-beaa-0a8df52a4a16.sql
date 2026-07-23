
CREATE POLICY "cot_oc_read_staff" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cotizaciones-oc' AND (
      public.has_role(auth.uid(),'admin') OR
      public.has_role(auth.uid(),'supervisor') OR
      public.has_role(auth.uid(),'tecnico')
    )
  );
CREATE POLICY "cot_oc_insert_staff" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cotizaciones-oc' AND (
      public.has_role(auth.uid(),'admin') OR
      public.has_role(auth.uid(),'supervisor') OR
      public.has_role(auth.uid(),'tecnico')
    )
  );
CREATE POLICY "cot_oc_update_staff" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cotizaciones-oc' AND (
      public.has_role(auth.uid(),'admin') OR
      public.has_role(auth.uid(),'supervisor')
    )
  );
CREATE POLICY "cot_oc_delete_admin" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cotizaciones-oc' AND public.has_role(auth.uid(),'admin')
  );
