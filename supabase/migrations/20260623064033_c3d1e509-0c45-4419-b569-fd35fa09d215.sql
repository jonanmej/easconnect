-- Fase 6: SLA, fecha_completado, auditoría

-- 1. Plantas: campos SLA
ALTER TABLE public.plantas
  ADD COLUMN IF NOT EXISTS sla_horas_respuesta INT,
  ADD COLUMN IF NOT EXISTS sla_horas_resolucion INT;

-- 2. Trabajos: fecha_completado + trigger autocompletado
ALTER TABLE public.trabajos
  ADD COLUMN IF NOT EXISTS fecha_completado TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_fecha_completado()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'completado' AND (OLD.estado IS DISTINCT FROM 'completado') AND NEW.fecha_completado IS NULL THEN
    NEW.fecha_completado := now();
  ELSIF NEW.estado <> 'completado' THEN
    NEW.fecha_completado := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_fecha_completado ON public.trabajos;
CREATE TRIGGER trg_set_fecha_completado
  BEFORE UPDATE ON public.trabajos
  FOR EACH ROW EXECUTE FUNCTION public.set_fecha_completado();

-- 3. Vista SLA
CREATE OR REPLACE VIEW public.trabajos_sla AS
SELECT
  t.id,
  t.folio,
  t.planta_id,
  p.cliente_id,
  t.servicio,
  t.estado,
  t.fecha_programada,
  t.fecha_completado,
  p.sla_horas_respuesta,
  p.sla_horas_resolucion,
  CASE
    WHEN t.estado = 'completado' AND t.fecha_completado IS NOT NULL
      THEN EXTRACT(EPOCH FROM (t.fecha_completado - t.fecha_programada)) / 3600.0
    WHEN t.estado <> 'cancelado'
      THEN EXTRACT(EPOCH FROM (now() - t.fecha_programada)) / 3600.0
    ELSE NULL
  END AS horas_transcurridas,
  CASE
    WHEN t.estado = 'cancelado' THEN 'cancelado'
    WHEN t.estado = 'completado' AND p.sla_horas_resolucion IS NOT NULL
         AND t.fecha_completado IS NOT NULL
         AND EXTRACT(EPOCH FROM (t.fecha_completado - t.fecha_programada)) / 3600.0 <= p.sla_horas_resolucion
      THEN 'en_plazo'
    WHEN t.estado = 'completado' THEN 'completado'
    WHEN p.sla_horas_resolucion IS NULL THEN 'sin_sla'
    WHEN EXTRACT(EPOCH FROM (now() - t.fecha_programada)) / 3600.0 > p.sla_horas_resolucion THEN 'vencido'
    WHEN EXTRACT(EPOCH FROM (now() - t.fecha_programada)) / 3600.0 > (p.sla_horas_resolucion * 0.75) THEN 'en_riesgo'
    ELSE 'en_plazo'
  END AS estado_sla
FROM public.trabajos t
JOIN public.plantas p ON p.id = t.planta_id;

GRANT SELECT ON public.trabajos_sla TO authenticated;
GRANT SELECT ON public.trabajos_sla TO service_role;

-- 4. Auditoría
CREATE TABLE IF NOT EXISTS public.auditoria_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad TEXT NOT NULL,
  entidad_id UUID,
  accion TEXT NOT NULL,
  antes JSONB,
  despues JSONB,
  actor UUID,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON public.auditoria_log(entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_ts ON public.auditoria_log(ts DESC);

GRANT SELECT ON public.auditoria_log TO authenticated;
GRANT ALL ON public.auditoria_log TO service_role;

ALTER TABLE public.auditoria_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin lee auditoria" ON public.auditoria_log;
CREATE POLICY "Admin lee auditoria" ON public.auditoria_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_entidad TEXT := TG_TABLE_NAME;
  v_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := (to_jsonb(OLD)->>'id')::uuid;
    INSERT INTO public.auditoria_log(entidad, entidad_id, accion, antes, actor)
    VALUES (v_entidad, v_id, 'delete', to_jsonb(OLD), v_actor);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_id := (to_jsonb(NEW)->>'id')::uuid;
    INSERT INTO public.auditoria_log(entidad, entidad_id, accion, antes, despues, actor)
    VALUES (v_entidad, v_id, 'update', to_jsonb(OLD), to_jsonb(NEW), v_actor);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    v_id := (to_jsonb(NEW)->>'id')::uuid;
    INSERT INTO public.auditoria_log(entidad, entidad_id, accion, despues, actor)
    VALUES (v_entidad, v_id, 'insert', to_jsonb(NEW), v_actor);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_trabajos ON public.trabajos;
CREATE TRIGGER audit_trabajos
  AFTER INSERT OR UPDATE OR DELETE ON public.trabajos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS audit_mantenimientos ON public.mantenimientos;
CREATE TRIGGER audit_mantenimientos
  AFTER INSERT OR UPDATE OR DELETE ON public.mantenimientos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS audit_solicitudes ON public.solicitudes_visita;
CREATE TRIGGER audit_solicitudes
  AFTER INSERT OR UPDATE OR DELETE ON public.solicitudes_visita
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS audit_inventario ON public.inventario_items;
CREATE TRIGGER audit_inventario
  AFTER INSERT OR UPDATE OR DELETE ON public.inventario_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS audit_plantas ON public.plantas;
CREATE TRIGGER audit_plantas
  AFTER INSERT OR UPDATE OR DELETE ON public.plantas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
