
-- 1. Historial de reasignaciones
CREATE TABLE public.trabajo_asignaciones_log (
  id uuid primary key default gen_random_uuid(),
  trabajo_id uuid not null references public.trabajos(id) on delete cascade,
  tecnico_anterior uuid references auth.users(id) on delete set null,
  tecnico_nuevo uuid references auth.users(id) on delete set null,
  asignado_por uuid references auth.users(id) on delete set null,
  motivo text,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT ON public.trabajo_asignaciones_log TO authenticated;
GRANT ALL ON public.trabajo_asignaciones_log TO service_role;
CREATE INDEX idx_trabajo_asig_log_trabajo
  ON public.trabajo_asignaciones_log(trabajo_id, created_at DESC);
ALTER TABLE public.trabajo_asignaciones_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff lee log asignaciones"
  ON public.trabajo_asignaciones_log FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'supervisor'::app_role)
    OR (public.has_role(auth.uid(),'tecnico'::app_role)
        AND (tecnico_nuevo = auth.uid() OR tecnico_anterior = auth.uid()))
  );
CREATE POLICY "staff inserta log asignaciones"
  ON public.trabajo_asignaciones_log FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'supervisor'::app_role)
  );

-- 2. Trigger que registra cambios de técnico
CREATE OR REPLACE FUNCTION public.log_asignacion_trabajo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.tecnico_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.tecnico_id IS DISTINCT FROM OLD.tecnico_id) THEN
    INSERT INTO public.trabajo_asignaciones_log(
      trabajo_id, tecnico_anterior, tecnico_nuevo, asignado_por
    ) VALUES (
      NEW.id,
      CASE WHEN TG_OP='UPDATE' THEN OLD.tecnico_id ELSE NULL END,
      NEW.tecnico_id,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_log_asignacion_trabajo
AFTER INSERT OR UPDATE OF tecnico_id ON public.trabajos
FOR EACH ROW EXECUTE FUNCTION public.log_asignacion_trabajo();

-- 3. Verificación de conflictos
CREATE OR REPLACE FUNCTION public.verificar_conflicto_tecnico(
  _tecnico_id uuid,
  _fecha timestamptz,
  _duracion_dias int,
  _excluir_trabajo_id uuid DEFAULT NULL
) RETURNS TABLE (id uuid, folio text, fecha_programada timestamptz, duracion_dias int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.folio, t.fecha_programada, t.duracion_dias
  FROM public.trabajos t
  WHERE t.tecnico_id = _tecnico_id
    AND t.estado <> 'cancelado'
    AND (_excluir_trabajo_id IS NULL OR t.id <> _excluir_trabajo_id)
    AND tstzrange(
          t.fecha_programada,
          t.fecha_programada + (COALESCE(t.duracion_dias,1) || ' days')::interval,
          '[)'
        ) && tstzrange(
          _fecha,
          _fecha + (GREATEST(_duracion_dias,1) || ' days')::interval,
          '[)'
        );
$$;
REVOKE EXECUTE ON FUNCTION public.verificar_conflicto_tecnico(uuid, timestamptz, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_conflicto_tecnico(uuid, timestamptz, int, uuid) TO authenticated;

-- 4. Notificaciones in-app por usuario
CREATE TABLE public.notificaciones_usuario (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensaje text not null,
  trabajo_id uuid references public.trabajos(id) on delete set null,
  leida_at timestamptz,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE ON public.notificaciones_usuario TO authenticated;
GRANT ALL ON public.notificaciones_usuario TO service_role;
CREATE INDEX idx_notif_usuario_user ON public.notificaciones_usuario(user_id, created_at DESC);
ALTER TABLE public.notificaciones_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user lee sus notif"
  ON public.notificaciones_usuario FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "user marca leida"
  ON public.notificaciones_usuario FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff inserta notif"
  ON public.notificaciones_usuario FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'supervisor'::app_role)
  );
