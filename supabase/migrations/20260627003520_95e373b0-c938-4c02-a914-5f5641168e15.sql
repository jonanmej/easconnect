
-- 1) Clientes: marcar los que solo reciben capacitaciones
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS solo_capacitacion BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Tabla N:M de técnicos adicionales por trabajo
CREATE TABLE IF NOT EXISTS public.trabajo_tecnicos (
  trabajo_id UUID NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  tecnico_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol TEXT NOT NULL DEFAULT 'apoyo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (trabajo_id, tecnico_id)
);
CREATE INDEX IF NOT EXISTS trabajo_tecnicos_tecnico_idx ON public.trabajo_tecnicos(tecnico_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajo_tecnicos TO authenticated;
GRANT ALL ON public.trabajo_tecnicos TO service_role;

ALTER TABLE public.trabajo_tecnicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gestiona técnicos extra"
  ON public.trabajo_tecnicos
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE POLICY "Técnico ve sus asignaciones extra"
  ON public.trabajo_tecnicos
  FOR SELECT
  TO authenticated
  USING (tecnico_id = auth.uid());

-- 3) Ampliar políticas RLS para que los técnicos extra puedan ver / cargar diarios y evidencias
DROP POLICY IF EXISTS "Equipo técnico ve diarios del trabajo asignado" ON public.trabajo_reportes_diarios;
CREATE POLICY "Equipo técnico ve diarios del trabajo asignado"
  ON public.trabajo_reportes_diarios
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'tecnico'::app_role)
    AND (
      EXISTS (
        SELECT 1 FROM public.trabajos t
        WHERE t.id = trabajo_reportes_diarios.trabajo_id
          AND (
            t.tecnico_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.trabajo_tecnicos tt
              WHERE tt.trabajo_id = t.id AND tt.tecnico_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM public.trabajo_asignaciones_log l
              WHERE l.trabajo_id = t.id AND l.tecnico_nuevo = auth.uid()
            )
          )
      )
    )
  );

-- 4) Validación: clientes "solo_capacitacion" solo aceptan trabajos de Capacitación
CREATE OR REPLACE FUNCTION public.validar_trabajo_capacitacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solo BOOLEAN;
BEGIN
  SELECT c.solo_capacitacion INTO v_solo
  FROM public.plantas p
  JOIN public.clientes c ON c.id = p.cliente_id
  WHERE p.id = NEW.planta_id;

  IF COALESCE(v_solo, FALSE) AND NEW.servicio <> 'Capacitación' THEN
    RAISE EXCEPTION 'Este cliente solo acepta servicios de Capacitación (servicio recibido: %).', NEW.servicio
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_trabajo_capacitacion ON public.trabajos;
CREATE TRIGGER trg_validar_trabajo_capacitacion
  BEFORE INSERT OR UPDATE OF planta_id, servicio
  ON public.trabajos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_trabajo_capacitacion();

-- 5) Validación equivalente para contratos
CREATE OR REPLACE FUNCTION public.validar_contrato_capacitacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solo BOOLEAN;
BEGIN
  SELECT c.solo_capacitacion INTO v_solo
  FROM public.plantas p
  JOIN public.clientes c ON c.id = p.cliente_id
  WHERE p.id = NEW.planta_id;

  IF COALESCE(v_solo, FALSE) AND NEW.servicio <> 'Capacitación' THEN
    RAISE EXCEPTION 'Este cliente solo acepta contratos de Capacitación (servicio recibido: %).', NEW.servicio
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_contrato_capacitacion ON public.contratos_servicio;
CREATE TRIGGER trg_validar_contrato_capacitacion
  BEFORE INSERT OR UPDATE OF planta_id, servicio
  ON public.contratos_servicio
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_contrato_capacitacion();

-- 6) Restringir EXECUTE de funciones nuevas al rol anónimo (defensa en profundidad)
REVOKE EXECUTE ON FUNCTION public.validar_trabajo_capacitacion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validar_contrato_capacitacion() FROM anon;
