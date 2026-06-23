
-- ============ INVENTARIO ============
CREATE TYPE public.inventario_categoria AS ENUM ('insumo','repuesto','herramienta','epp');
CREATE TYPE public.movimiento_tipo AS ENUM ('ingreso','salida','ajuste');

CREATE TABLE public.inventario_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  nombre text NOT NULL,
  categoria inventario_categoria NOT NULL,
  ubicacion text,
  unidad text NOT NULL DEFAULT 'un',
  stock_actual numeric NOT NULL DEFAULT 0,
  stock_minimo numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_items TO authenticated;
GRANT ALL ON public.inventario_items TO service_role;
ALTER TABLE public.inventario_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read inventario" ON public.inventario_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'tecnico'));
CREATE POLICY "Admin write inventario" ON public.inventario_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));
CREATE TRIGGER touch_inv_items BEFORE UPDATE ON public.inventario_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.inventario_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventario_items(id) ON DELETE CASCADE,
  tipo movimiento_tipo NOT NULL,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  motivo text,
  trabajo_id uuid REFERENCES public.trabajos(id) ON DELETE SET NULL,
  realizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_movimientos TO authenticated;
GRANT ALL ON public.inventario_movimientos TO service_role;
ALTER TABLE public.inventario_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read movimientos" ON public.inventario_movimientos FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'tecnico'));
CREATE POLICY "Staff write movimientos" ON public.inventario_movimientos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'tecnico'));

CREATE OR REPLACE FUNCTION public.apply_movimiento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tipo = 'ingreso' THEN
    UPDATE public.inventario_items SET stock_actual = stock_actual + NEW.cantidad WHERE id = NEW.item_id;
  ELSIF NEW.tipo = 'salida' THEN
    UPDATE public.inventario_items SET stock_actual = stock_actual - NEW.cantidad WHERE id = NEW.item_id;
  ELSIF NEW.tipo = 'ajuste' THEN
    UPDATE public.inventario_items SET stock_actual = NEW.cantidad WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_apply_movimiento AFTER INSERT ON public.inventario_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.apply_movimiento();

-- ============ MANTENIMIENTOS ============
CREATE TYPE public.mantenimiento_tipo AS ENUM ('preventivo','correctivo','predictivo');
CREATE TYPE public.mantenimiento_estado AS ENUM ('programado','pendiente','completado','cancelado');

CREATE TABLE public.mantenimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id uuid NOT NULL REFERENCES public.equipos(id) ON DELETE CASCADE,
  tipo mantenimiento_tipo NOT NULL,
  fecha date NOT NULL,
  horas numeric NOT NULL DEFAULT 0,
  tecnico_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  estado mantenimiento_estado NOT NULL DEFAULT 'programado',
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mantenimientos TO authenticated;
GRANT ALL ON public.mantenimientos TO service_role;
ALTER TABLE public.mantenimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read mantenimientos" ON public.mantenimientos FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor')
    OR (has_role(auth.uid(),'tecnico') AND tecnico_id = auth.uid())
    OR equipo_id IN (SELECT e.id FROM public.equipos e JOIN public.plantas p ON p.id = e.planta_id WHERE p.cliente_id = current_cliente_id())
  );
CREATE POLICY "Staff insert mantenimientos" ON public.mantenimientos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));
CREATE POLICY "Update mantenimientos" ON public.mantenimientos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR (has_role(auth.uid(),'tecnico') AND tecnico_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR (has_role(auth.uid(),'tecnico') AND tecnico_id = auth.uid()));
CREATE POLICY "Admin delete mantenimientos" ON public.mantenimientos FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));
CREATE TRIGGER touch_mantenimientos BEFORE UPDATE ON public.mantenimientos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ REPORTES ============
CREATE TYPE public.reporte_estado AS ENUM ('borrador','enviado');

CREATE TABLE public.reportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  planta_id uuid REFERENCES public.plantas(id) ON DELETE SET NULL,
  periodo text NOT NULL,
  titulo text NOT NULL,
  contenido_markdown text NOT NULL,
  insight_resumen text,
  estado reporte_estado NOT NULL DEFAULT 'borrador',
  generado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  model_used text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reportes TO authenticated;
GRANT ALL ON public.reportes TO service_role;
ALTER TABLE public.reportes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read reportes" ON public.reportes FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR cliente_id = current_cliente_id());
CREATE POLICY "Staff write reportes" ON public.reportes FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));
CREATE POLICY "Staff update reportes" ON public.reportes FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));
CREATE POLICY "Admin delete reportes" ON public.reportes FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER touch_reportes BEFORE UPDATE ON public.reportes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
