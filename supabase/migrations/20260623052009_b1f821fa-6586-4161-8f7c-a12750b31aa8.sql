-- 1. trabajo_evidencias
CREATE TABLE public.trabajo_evidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id uuid NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  descripcion text,
  subido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajo_evidencias TO authenticated;
GRANT ALL ON public.trabajo_evidencias TO service_role;

ALTER TABLE public.trabajo_evidencias ENABLE ROW LEVEL SECURITY;

-- Personal interno (admin/supervisor/técnico) ve y gestiona todas
CREATE POLICY "Staff gestiona evidencias"
ON public.trabajo_evidencias
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

-- Cliente ve solo evidencias de trabajos en sus plantas
CREATE POLICY "Cliente ve sus evidencias"
ON public.trabajo_evidencias
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'cliente')
  AND EXISTS (
    SELECT 1 FROM public.trabajos t
    JOIN public.plantas p ON p.id = t.planta_id
    WHERE t.id = trabajo_evidencias.trabajo_id
      AND p.cliente_id = public.current_cliente_id()
  )
);

CREATE INDEX trabajo_evidencias_trabajo_idx ON public.trabajo_evidencias(trabajo_id);

-- 2. plantas: preferencias de notificación
ALTER TABLE public.plantas
  ADD COLUMN IF NOT EXISTS notificaciones_completado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_notificaciones text;

-- 3. reportes: trazabilidad envío
ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS enviado_a text,
  ADD COLUMN IF NOT EXISTS enviado_at timestamptz;