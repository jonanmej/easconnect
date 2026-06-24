
-- 1. Flag para forzar cambio de contraseña al ingresar
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;

-- 2. Tabla de solicitudes de reseteo de contraseña
CREATE TABLE IF NOT EXISTS public.password_reset_solicitudes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  mensaje TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','atendida','descartada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  atendida_at TIMESTAMPTZ,
  atendida_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notas_admin TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_reset_estado ON public.password_reset_solicitudes(estado, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.password_reset_solicitudes TO authenticated;
GRANT INSERT ON public.password_reset_solicitudes TO anon;
GRANT ALL ON public.password_reset_solicitudes TO service_role;

ALTER TABLE public.password_reset_solicitudes ENABLE ROW LEVEL SECURITY;

-- Cualquiera (incluso sin sesión) puede crear una solicitud desde el login
CREATE POLICY "solicitar_reset_publico_insert"
  ON public.password_reset_solicitudes
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Solo admin puede ver/actualizar
CREATE POLICY "admin_ver_resets"
  ON public.password_reset_solicitudes
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_actualizar_resets"
  ON public.password_reset_solicitudes
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
