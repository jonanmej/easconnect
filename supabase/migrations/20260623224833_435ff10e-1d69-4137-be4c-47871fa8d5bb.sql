CREATE TABLE public.trabajo_equipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id uuid NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  equipo_id uuid NOT NULL REFERENCES public.equipos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trabajo_id, equipo_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajo_equipos TO authenticated;
GRANT ALL ON public.trabajo_equipos TO service_role;

ALTER TABLE public.trabajo_equipos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gestiona trabajo_equipos"
ON public.trabajo_equipos
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supervisor')
  OR public.has_role(auth.uid(), 'tecnico')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supervisor')
  OR public.has_role(auth.uid(), 'tecnico')
);

CREATE POLICY "Cliente ve trabajo_equipos de sus plantas"
ON public.trabajo_equipos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'cliente')
  AND EXISTS (
    SELECT 1 FROM public.trabajos t
    JOIN public.plantas p ON p.id = t.planta_id
    WHERE t.id = trabajo_equipos.trabajo_id
      AND p.cliente_id = public.current_cliente_id()
  )
);

CREATE INDEX trabajo_equipos_trabajo_idx ON public.trabajo_equipos(trabajo_id);
CREATE INDEX trabajo_equipos_equipo_idx ON public.trabajo_equipos(equipo_id);

-- Backfill: migrar equipo_id ya asignado en trabajos al nuevo N:M
INSERT INTO public.trabajo_equipos (trabajo_id, equipo_id)
SELECT id, equipo_id FROM public.trabajos WHERE equipo_id IS NOT NULL
ON CONFLICT DO NOTHING;