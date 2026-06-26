
-- Workflow + auditoría de reportes ejecutivos
ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS enviado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS aprobado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS aprobado_at timestamptz,
  ADD COLUMN IF NOT EXISTS rechazado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rechazado_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_rechazo text,
  ADD COLUMN IF NOT EXISTS reporte_padre_id uuid REFERENCES public.reportes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.reporte_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes(id) ON DELETE CASCADE,
  accion text NOT NULL,
  estado_anterior text,
  estado_nuevo text,
  version int,
  comentario text,
  actor uuid REFERENCES auth.users(id),
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.reporte_auditoria TO authenticated;
GRANT ALL ON public.reporte_auditoria TO service_role;

ALTER TABLE public.reporte_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_lee_aud_reportes" ON public.reporte_auditoria;
CREATE POLICY "staff_lee_aud_reportes" ON public.reporte_auditoria
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

DROP POLICY IF EXISTS "staff_inserta_aud_reportes" ON public.reporte_auditoria;
CREATE POLICY "staff_inserta_aud_reportes" ON public.reporte_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE INDEX IF NOT EXISTS idx_reporte_aud_reporte ON public.reporte_auditoria(reporte_id, created_at DESC);
