
CREATE TABLE public.jornadas_laborales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/El_Salvador')::date),
  hora_inicio timestamptz NOT NULL DEFAULT now(),
  hora_fin timestamptz,
  almuerzo_inicio timestamptz,
  almuerzo_fin timestamptz,
  almuerzo_excedido boolean NOT NULL DEFAULT false,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Solo una jornada abierta (sin hora_fin) por técnico por día
CREATE UNIQUE INDEX jornadas_una_abierta_por_dia
  ON public.jornadas_laborales(tecnico_id, fecha)
  WHERE hora_fin IS NULL;

CREATE INDEX jornadas_fecha_idx ON public.jornadas_laborales(fecha DESC);
CREATE INDEX jornadas_tecnico_fecha_idx ON public.jornadas_laborales(tecnico_id, fecha DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jornadas_laborales TO authenticated;
GRANT ALL ON public.jornadas_laborales TO service_role;

ALTER TABLE public.jornadas_laborales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tecnico ve su jornada" ON public.jornadas_laborales
  FOR SELECT TO authenticated
  USING (tecnico_id = auth.uid()
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "tecnico crea su jornada" ON public.jornadas_laborales
  FOR INSERT TO authenticated
  WITH CHECK (tecnico_id = auth.uid());

CREATE POLICY "tecnico actualiza su jornada" ON public.jornadas_laborales
  FOR UPDATE TO authenticated
  USING (tecnico_id = auth.uid()
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (tecnico_id = auth.uid()
              OR public.has_role(auth.uid(), 'admin')
              OR public.has_role(auth.uid(), 'supervisor'));

CREATE POLICY "admin elimina jornada" ON public.jornadas_laborales
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER jornadas_set_updated_at
  BEFORE UPDATE ON public.jornadas_laborales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cron: resumen diario consolidado a las 17:00 hora El Salvador (23:00 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('resumen-jornadas-diario');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'resumen-jornadas-diario',
  '0 23 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--4a1d8dfa-3473-4ec4-a07c-e2cd9feba391.lovable.app/api/public/hooks/resumen-jornadas-diario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_API_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);
