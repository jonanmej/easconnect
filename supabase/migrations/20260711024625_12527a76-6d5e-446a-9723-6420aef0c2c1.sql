
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'trabajos','trabajo_reportes','trabajo_reportes_diarios','trabajo_reportes_pdf',
    'trabajo_evidencias','trabajo_recursos','trabajo_aprobaciones',
    'notificaciones_usuario','jornadas_laborales',
    'inventario_items','inventario_movimientos','equipos',
    'solicitudes_visita','mantenimientos'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
