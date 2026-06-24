
-- 1) Ampliar password_reset_solicitudes
ALTER TABLE public.password_reset_solicitudes
  ADD COLUMN IF NOT EXISTS expira_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  ADD COLUMN IF NOT EXISTS ip TEXT,
  ADD COLUMN IF NOT EXISTS reenvios INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reenviado_at TIMESTAMPTZ;

ALTER TABLE public.password_reset_solicitudes
  DROP CONSTRAINT IF EXISTS password_reset_solicitudes_estado_check;
ALTER TABLE public.password_reset_solicitudes
  ADD CONSTRAINT password_reset_solicitudes_estado_check
  CHECK (estado IN ('pendiente','atendida','descartada','caducada'));

CREATE INDEX IF NOT EXISTS idx_password_reset_email_created
  ON public.password_reset_solicitudes (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_ip_created
  ON public.password_reset_solicitudes (ip, created_at DESC);

-- 2) Tabla system_config (clave-valor) para configuración del sistema
CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_config TO authenticated;
GRANT ALL ON public.system_config TO service_role;

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_ver_config" ON public.system_config;
CREATE POLICY "admin_ver_config" ON public.system_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_modificar_config" ON public.system_config;
CREATE POLICY "admin_modificar_config" ON public.system_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_system_config_updated ON public.system_config;
CREATE TRIGGER trg_system_config_updated
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Política de contraseñas temporales por defecto
INSERT INTO public.system_config (key, value)
VALUES (
  'password_policy',
  jsonb_build_object(
    'longitud', 16,
    'requiere_mayusculas', true,
    'requiere_minusculas', true,
    'requiere_digitos', true,
    'requiere_simbolos', true,
    'excluir_ambiguos', true
  )
)
ON CONFLICT (key) DO NOTHING;

-- 4) Marcar como 'caducada' las pendientes ya expiradas
UPDATE public.password_reset_solicitudes
SET estado = 'caducada'
WHERE estado = 'pendiente' AND expira_at < now();
