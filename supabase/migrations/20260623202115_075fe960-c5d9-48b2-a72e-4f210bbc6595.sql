
-- Extensión para gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Columnas en trabajos
ALTER TABLE public.trabajos
  ADD COLUMN IF NOT EXISTS firmado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS firmado_por TEXT,
  ADD COLUMN IF NOT EXISTS firmado_rut TEXT,
  ADD COLUMN IF NOT EXISTS firma_storage_path TEXT;

-- 2. Tabla de aprobaciones
CREATE TABLE IF NOT EXISTS public.trabajo_aprobaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id UUID NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expira_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  firmado_at TIMESTAMPTZ,
  firmante_nombre TEXT,
  firmante_rut TEXT,
  firma_storage_path TEXT,
  ip TEXT,
  user_agent TEXT,
  creado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trabajo_aprobaciones_trabajo ON public.trabajo_aprobaciones(trabajo_id);
CREATE INDEX IF NOT EXISTS idx_trabajo_aprobaciones_token ON public.trabajo_aprobaciones(token);

GRANT SELECT, INSERT, UPDATE ON public.trabajo_aprobaciones TO authenticated;
GRANT ALL ON public.trabajo_aprobaciones TO service_role;

ALTER TABLE public.trabajo_aprobaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff lee aprobaciones" ON public.trabajo_aprobaciones
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'tecnico')
  );

CREATE POLICY "Staff crea aprobaciones" ON public.trabajo_aprobaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "Cliente ve sus aprobaciones" ON public.trabajo_aprobaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trabajos t
      JOIN public.plantas p ON p.id = t.planta_id
      WHERE t.id = trabajo_aprobaciones.trabajo_id
        AND p.cliente_id = public.current_cliente_id()
    )
  );

-- 3. Función pública para validar token (sin auth, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.validar_token_aprobacion(_token TEXT)
RETURNS TABLE (
  aprobacion_id UUID,
  trabajo_id UUID,
  folio TEXT,
  servicio TEXT,
  fecha_programada TIMESTAMPTZ,
  fecha_completado TIMESTAMPTZ,
  notas TEXT,
  planta_nombre TEXT,
  cliente_nombre TEXT,
  tecnico_nombre TEXT,
  expira_at TIMESTAMPTZ,
  firmado_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id, t.id, t.folio, t.servicio, t.fecha_programada, t.fecha_completado, t.notas,
    p.nombre, c.nombre,
    COALESCE(pr.display_name, ''),
    a.expira_at, a.firmado_at
  FROM public.trabajo_aprobaciones a
  JOIN public.trabajos t ON t.id = a.trabajo_id
  JOIN public.plantas p ON p.id = t.planta_id
  JOIN public.clientes c ON c.id = p.cliente_id
  LEFT JOIN public.profiles pr ON pr.id = t.tecnico_id
  WHERE a.token = _token AND a.expira_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.validar_token_aprobacion(TEXT) TO anon, authenticated;

-- 4. Función pública para firmar aprobación (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.firmar_aprobacion(
  _token TEXT,
  _firmante_nombre TEXT,
  _firmante_rut TEXT,
  _firma_storage_path TEXT,
  _ip TEXT,
  _user_agent TEXT
)
RETURNS TABLE (trabajo_id UUID, folio TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apr public.trabajo_aprobaciones%ROWTYPE;
BEGIN
  SELECT * INTO v_apr
  FROM public.trabajo_aprobaciones
  WHERE token = _token AND expira_at > now() AND firmado_at IS NULL
  FOR UPDATE;

  IF v_apr.id IS NULL THEN
    RAISE EXCEPTION 'Token inválido, expirado o ya firmado';
  END IF;

  IF length(trim(coalesce(_firmante_nombre, ''))) < 2 THEN
    RAISE EXCEPTION 'Nombre del firmante requerido';
  END IF;

  UPDATE public.trabajo_aprobaciones
  SET firmado_at = now(),
      firmante_nombre = _firmante_nombre,
      firmante_rut = _firmante_rut,
      firma_storage_path = _firma_storage_path,
      ip = _ip,
      user_agent = _user_agent
  WHERE id = v_apr.id;

  UPDATE public.trabajos
  SET firmado_at = now(),
      firmado_por = _firmante_nombre,
      firmado_rut = _firmante_rut,
      firma_storage_path = _firma_storage_path
  WHERE id = v_apr.trabajo_id;

  RETURN QUERY
  SELECT t.id, t.folio FROM public.trabajos t WHERE t.id = v_apr.trabajo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.firmar_aprobacion(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 5. Trigger updated_at para trabajo_aprobaciones (no necesita updated_at; skip)
-- 6. Notificaciones_log: ampliar tipos no es necesario (la columna es text).
