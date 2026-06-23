
-- ============ profiles ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ clientes ============
CREATE TYPE public.cliente_estado AS ENUM ('activo','revision','pausado');

CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  rut text,
  contacto text,
  capacidad text,
  estado public.cliente_estado NOT NULL DEFAULT 'activo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- profile cliente_id FK now that clientes exists
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cliente_fk
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;

-- ============ plantas ============
CREATE TABLE public.plantas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  ubicacion text,
  paneles integer NOT NULL DEFAULT 0,
  capacidad text,
  eficiencia numeric(5,2),
  ultima_limpieza date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plantas TO authenticated;
GRANT ALL ON public.plantas TO service_role;
ALTER TABLE public.plantas ENABLE ROW LEVEL SECURITY;

-- ============ equipos ============
CREATE TYPE public.equipo_estado AS ENUM ('operativo','mantenimiento','disponible','fuera_servicio');

CREATE TABLE public.equipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  tipo text NOT NULL,
  estado public.equipo_estado NOT NULL DEFAULT 'disponible',
  salud integer CHECK (salud BETWEEN 0 AND 100),
  planta_id uuid REFERENCES public.plantas(id) ON DELETE SET NULL,
  ubicacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipos TO authenticated;
GRANT ALL ON public.equipos TO service_role;
ALTER TABLE public.equipos ENABLE ROW LEVEL SECURITY;

-- ============ trabajos ============
CREATE TYPE public.trabajo_estado AS ENUM ('programado','en_progreso','completado','cancelado');

CREATE SEQUENCE public.trabajos_folio_seq;

CREATE TABLE public.trabajos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE DEFAULT (
    'T-' || to_char(now(), 'YYYY') || '-' ||
    lpad(nextval('public.trabajos_folio_seq')::text, 4, '0')
  ),
  planta_id uuid NOT NULL REFERENCES public.plantas(id) ON DELETE RESTRICT,
  equipo_id uuid REFERENCES public.equipos(id) ON DELETE SET NULL,
  servicio text NOT NULL,
  fecha_programada timestamptz NOT NULL,
  tecnico_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  estado public.trabajo_estado NOT NULL DEFAULT 'programado',
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajos TO authenticated;
GRANT ALL ON public.trabajos TO service_role;
ALTER TABLE public.trabajos ENABLE ROW LEVEL SECURITY;

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER touch_clientes BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER touch_plantas BEFORE UPDATE ON public.plantas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER touch_equipos BEFORE UPDATE ON public.equipos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER touch_trabajos BEFORE UPDATE ON public.trabajos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ auto-create profile on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- backfill existing users
INSERT INTO public.profiles (id, display_name)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', email) FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============ helper: cliente_id del usuario ============
CREATE OR REPLACE FUNCTION public.current_cliente_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cliente_id FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.current_cliente_id() FROM PUBLIC, anon;

-- ============ RLS policies ============

-- profiles
CREATE POLICY "Read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin insert profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- clientes
CREATE POLICY "Staff read clientes" ON public.clientes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'supervisor')
    OR public.has_role(auth.uid(),'tecnico')
    OR id = public.current_cliente_id()
  );
CREATE POLICY "Admin write clientes" ON public.clientes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

-- plantas
CREATE POLICY "Staff read plantas" ON public.plantas FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'supervisor')
    OR public.has_role(auth.uid(),'tecnico')
    OR cliente_id = public.current_cliente_id()
  );
CREATE POLICY "Admin write plantas" ON public.plantas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

-- equipos
CREATE POLICY "Staff read equipos" ON public.equipos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'supervisor')
    OR public.has_role(auth.uid(),'tecnico')
    OR planta_id IN (SELECT id FROM public.plantas WHERE cliente_id = public.current_cliente_id())
  );
CREATE POLICY "Admin write equipos" ON public.equipos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

-- trabajos
CREATE POLICY "Read trabajos" ON public.trabajos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'supervisor')
    OR (public.has_role(auth.uid(),'tecnico') AND tecnico_id = auth.uid())
    OR planta_id IN (SELECT id FROM public.plantas WHERE cliente_id = public.current_cliente_id())
  );
CREATE POLICY "Staff write trabajos" ON public.trabajos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "Update trabajos" ON public.trabajos FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'supervisor')
    OR (public.has_role(auth.uid(),'tecnico') AND tecnico_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'supervisor')
    OR (public.has_role(auth.uid(),'tecnico') AND tecnico_id = auth.uid())
  );
CREATE POLICY "Delete trabajos" ON public.trabajos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
