
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Quitar si ya existe (por idempotencia)
SELECT cron.unschedule('revisar-firmas-pendientes')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'revisar-firmas-pendientes');

SELECT cron.schedule(
  'revisar-firmas-pendientes',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--4a1d8dfa-3473-4ec4-a07c-e2cd9feba391.lovable.app/api/public/cron/revisar-firmas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtbm54ampqemF3cXFkcnR3c3duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNzMxNjgsImV4cCI6MjA5Nzc0OTE2OH0.7r66hX27UTLDgL9KsIkT--UqYLeXz4LOA1a9jljMynE'
    ),
    body := '{}'::jsonb
  );
  $$
);
