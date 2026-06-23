
-- 1) Plantas: geolocalización
ALTER TABLE public.plantas
  ADD COLUMN IF NOT EXISTS latitud numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitud numeric(10,7);

-- 2) Auto-generación de códigos para INVENTARIO (INV-CAT-NNNN)
CREATE SEQUENCE IF NOT EXISTS public.inventario_sku_seq;

CREATE OR REPLACE FUNCTION public.gen_inventario_sku()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cat_code text;
BEGIN
  IF NEW.sku IS NULL OR NEW.sku = '' OR NEW.sku ~ '^AUTO' THEN
    cat_code := CASE NEW.categoria
      WHEN 'insumo' THEN 'INS'
      WHEN 'repuesto' THEN 'REP'
      WHEN 'herramienta' THEN 'HER'
      WHEN 'epp' THEN 'EPP'
      ELSE 'GEN'
    END;
    NEW.sku := 'INV-' || cat_code || '-' || lpad(nextval('public.inventario_sku_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gen_inventario_sku_trg ON public.inventario_items;
CREATE TRIGGER gen_inventario_sku_trg
  BEFORE INSERT ON public.inventario_items
  FOR EACH ROW EXECUTE FUNCTION public.gen_inventario_sku();

-- 3) Auto-generación de códigos para EQUIPOS (EQP-TIPO-NNNN)
CREATE SEQUENCE IF NOT EXISTS public.equipos_codigo_seq;

CREATE OR REPLACE FUNCTION public.gen_equipo_codigo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tipo_code text;
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' OR NEW.codigo ~ '^AUTO' THEN
    tipo_code := upper(regexp_replace(coalesce(NEW.tipo, 'GEN'), '[^A-Za-z0-9]', '', 'g'));
    tipo_code := left(coalesce(nullif(tipo_code, ''), 'GEN'), 3);
    NEW.codigo := 'EQP-' || tipo_code || '-' || lpad(nextval('public.equipos_codigo_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gen_equipo_codigo_trg ON public.equipos;
CREATE TRIGGER gen_equipo_codigo_trg
  BEFORE INSERT ON public.equipos
  FOR EACH ROW EXECUTE FUNCTION public.gen_equipo_codigo();

-- 4) trabajo_reportes (reporte base llenado por el técnico)
CREATE TABLE IF NOT EXISTS public.trabajo_reportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id uuid NOT NULL UNIQUE REFERENCES public.trabajos(id) ON DELETE CASCADE,
  condiciones_sitio text,
  trabajo_realizado text,
  hallazgos text,
  recomendaciones text,
  mediciones jsonb DEFAULT '{}'::jsonb,
  materiales_usados text,
  tecnico_nombre text,
  tecnico_firma_url text,
  cliente_recibe_nombre text,
  cliente_recibe_cargo text,
  cliente_firma_url text,
  cliente_observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajo_reportes TO authenticated;
GRANT ALL ON public.trabajo_reportes TO service_role;
ALTER TABLE public.trabajo_reportes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read trabajo_reportes" ON public.trabajo_reportes FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'tecnico'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.trabajos t JOIN public.plantas p ON p.id = t.planta_id
    WHERE t.id = trabajo_reportes.trabajo_id AND p.cliente_id = current_cliente_id()
  )
);

CREATE POLICY "Write trabajo_reportes" ON public.trabajo_reportes FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'tecnico'::app_role)
);

CREATE POLICY "Update trabajo_reportes" ON public.trabajo_reportes FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'tecnico'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'tecnico'::app_role)
);

CREATE POLICY "Delete trabajo_reportes" ON public.trabajo_reportes FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

CREATE TRIGGER touch_trabajo_reportes BEFORE UPDATE ON public.trabajo_reportes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) trabajo_recursos (checklist de recursos por OT)
CREATE TABLE IF NOT EXISTS public.trabajo_recursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id uuid NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (categoria IN ('herramienta','equipo','epp','insumo','repuesto','otro')),
  descripcion text NOT NULL,
  cantidad numeric NOT NULL DEFAULT 1,
  unidad text DEFAULT 'un',
  item_id uuid REFERENCES public.inventario_items(id) ON DELETE SET NULL,
  equipo_id uuid REFERENCES public.equipos(id) ON DELETE SET NULL,
  entregado boolean NOT NULL DEFAULT false,
  devuelto boolean NOT NULL DEFAULT false,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trabajo_recursos_trabajo_idx ON public.trabajo_recursos(trabajo_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trabajo_recursos TO authenticated;
GRANT ALL ON public.trabajo_recursos TO service_role;
ALTER TABLE public.trabajo_recursos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read trabajo_recursos" ON public.trabajo_recursos FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'tecnico'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.trabajos t JOIN public.plantas p ON p.id = t.planta_id
    WHERE t.id = trabajo_recursos.trabajo_id AND p.cliente_id = current_cliente_id()
  )
);

CREATE POLICY "Staff write trabajo_recursos" ON public.trabajo_recursos FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'tecnico'::app_role));

CREATE POLICY "Staff update trabajo_recursos" ON public.trabajo_recursos FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'tecnico'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'tecnico'::app_role));

CREATE POLICY "Staff delete trabajo_recursos" ON public.trabajo_recursos FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

CREATE TRIGGER touch_trabajo_recursos BEFORE UPDATE ON public.trabajo_recursos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
