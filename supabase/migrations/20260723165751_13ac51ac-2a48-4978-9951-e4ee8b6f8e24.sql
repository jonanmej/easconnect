
-- ============================================================
-- Órdenes de compra: estados, recepciones, cotizaciones e historial
-- ============================================================

-- Costo promedio en inventario
ALTER TABLE public.inventario_items
  ADD COLUMN IF NOT EXISTS costo_promedio numeric NOT NULL DEFAULT 0;

-- Enum de estados
DO $$ BEGIN
  CREATE TYPE public.oc_estado AS ENUM ('borrador','enviada','parcial','recibida','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabla principal
CREATE TABLE IF NOT EXISTS public.ordenes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  estado public.oc_estado NOT NULL DEFAULT 'borrador',
  fecha_emision date NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador')::date,
  solicitante text NOT NULL DEFAULT '',
  notas text,
  proveedores jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{nombre, cotizacion_folio, cotizacion_fecha, cotizacion_monto, cotizacion_storage_path}]
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  fecha_enviada timestamptz,
  fecha_recibida timestamptz,
  fecha_cancelada timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes_compra TO authenticated;
GRANT ALL ON public.ordenes_compra TO service_role;
ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY oc_select_staff ON public.ordenes_compra FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'));
CREATE POLICY oc_insert_staff ON public.ordenes_compra FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'));
CREATE POLICY oc_update_staff ON public.ordenes_compra FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY oc_delete_admin ON public.ordenes_compra FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_oc_updated_at BEFORE UPDATE ON public.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Líneas de la orden
CREATE TABLE IF NOT EXISTS public.orden_compra_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventario_items(id) ON DELETE SET NULL, -- null => libre
  sku_texto text,
  nombre text NOT NULL,
  categoria text,
  unidad text NOT NULL DEFAULT 'un',
  cantidad_pedida numeric NOT NULL CHECK (cantidad_pedida > 0),
  cantidad_recibida numeric NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),
  precio_unitario numeric,
  proveedor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orden_compra_items TO authenticated;
GRANT ALL ON public.orden_compra_items TO service_role;
ALTER TABLE public.orden_compra_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY oci_all_staff ON public.orden_compra_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'));

CREATE INDEX IF NOT EXISTS idx_oci_orden ON public.orden_compra_items(orden_id);
CREATE INDEX IF NOT EXISTS idx_oci_item ON public.orden_compra_items(item_id);
CREATE INDEX IF NOT EXISTS idx_oci_sku ON public.orden_compra_items(sku_texto);

-- Log de cambios de estado
CREATE TABLE IF NOT EXISTS public.orden_compra_estados_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  estado_anterior public.oc_estado,
  estado_nuevo public.oc_estado NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  notas text
);
GRANT SELECT, INSERT ON public.orden_compra_estados_log TO authenticated;
GRANT ALL ON public.orden_compra_estados_log TO service_role;
ALTER TABLE public.orden_compra_estados_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY ocel_read_staff ON public.orden_compra_estados_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'));
CREATE POLICY ocel_insert_staff ON public.orden_compra_estados_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'));
CREATE INDEX IF NOT EXISTS idx_ocel_orden ON public.orden_compra_estados_log(orden_id);

-- Recepciones
CREATE TABLE IF NOT EXISTS public.orden_compra_recepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
  recibido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recibido_por_nombre text,
  recibido_at timestamptz NOT NULL DEFAULT now(),
  notas text
);
GRANT SELECT, INSERT ON public.orden_compra_recepciones TO authenticated;
GRANT ALL ON public.orden_compra_recepciones TO service_role;
ALTER TABLE public.orden_compra_recepciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY ocr_read_staff ON public.orden_compra_recepciones FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'));
CREATE POLICY ocr_insert_staff ON public.orden_compra_recepciones FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'));
CREATE INDEX IF NOT EXISTS idx_ocr_orden ON public.orden_compra_recepciones(orden_id);

CREATE TABLE IF NOT EXISTS public.orden_compra_recepcion_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recepcion_id uuid NOT NULL REFERENCES public.orden_compra_recepciones(id) ON DELETE CASCADE,
  orden_item_id uuid NOT NULL REFERENCES public.orden_compra_items(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventario_items(id) ON DELETE SET NULL,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.orden_compra_recepcion_items TO authenticated;
GRANT ALL ON public.orden_compra_recepcion_items TO service_role;
ALTER TABLE public.orden_compra_recepcion_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY ocri_read_staff ON public.orden_compra_recepcion_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'));
CREATE POLICY ocri_insert_staff ON public.orden_compra_recepcion_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'));
CREATE INDEX IF NOT EXISTS idx_ocri_recepcion ON public.orden_compra_recepcion_items(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_ocri_item ON public.orden_compra_recepcion_items(item_id);

-- ============================================================
-- Función: registrar recepción (parcial o total), actualizar
-- stock y recalcular costo promedio ponderado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.registrar_recepcion_oc(
  _orden_id uuid,
  _lineas jsonb,   -- [{orden_item_id, cantidad, costo_unitario, item_id_override}]
  _notas text DEFAULT NULL,
  _recibido_por_nombre text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec_id uuid;
  v_estado_actual public.oc_estado;
  v_line jsonb;
  v_oi_id uuid;
  v_item_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_prev_stock numeric;
  v_prev_avg numeric;
  v_new_stock numeric;
  v_new_avg numeric;
  v_orden_item RECORD;
  v_total_pedido numeric;
  v_total_recibido numeric;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'supervisor') OR public.has_role(v_uid,'tecnico')) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF _orden_id IS NULL OR _lineas IS NULL OR jsonb_array_length(_lineas) = 0 THEN
    RAISE EXCEPTION 'Debe indicar líneas a recibir';
  END IF;

  SELECT estado INTO v_estado_actual FROM public.ordenes_compra WHERE id = _orden_id FOR UPDATE;
  IF v_estado_actual IS NULL THEN RAISE EXCEPTION 'Orden no existe'; END IF;
  IF v_estado_actual IN ('cancelada','recibida') THEN
    RAISE EXCEPTION 'La orden está % y no admite recepciones', v_estado_actual;
  END IF;

  INSERT INTO public.orden_compra_recepciones(orden_id, recibido_por, recibido_por_nombre, notas)
  VALUES (_orden_id, v_uid, _recibido_por_nombre, _notas)
  RETURNING id INTO v_rec_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lineas) LOOP
    v_oi_id := (v_line->>'orden_item_id')::uuid;
    v_qty := (v_line->>'cantidad')::numeric;
    v_cost := COALESCE((v_line->>'costo_unitario')::numeric, 0);
    v_item_id := NULLIF(v_line->>'item_id_override','')::uuid;

    IF v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    SELECT * INTO v_orden_item FROM public.orden_compra_items WHERE id = v_oi_id AND orden_id = _orden_id FOR UPDATE;
    IF v_orden_item.id IS NULL THEN RAISE EXCEPTION 'Línea inválida %', v_oi_id; END IF;

    -- Usar override si vino (para resolver ítems libres); si no, la línea original.
    IF v_item_id IS NULL THEN v_item_id := v_orden_item.item_id; END IF;

    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'La línea "%" es un ítem libre. Debes crear el SKU o mapearlo a uno existente antes de recibir.', v_orden_item.nombre;
    END IF;

    -- Actualizar stock y costo promedio ponderado
    SELECT stock_actual, COALESCE(costo_promedio,0) INTO v_prev_stock, v_prev_avg
    FROM public.inventario_items WHERE id = v_item_id FOR UPDATE;
    IF v_prev_stock IS NULL THEN RAISE EXCEPTION 'Ítem de inventario no existe'; END IF;

    v_new_stock := v_prev_stock + v_qty;
    IF v_new_stock > 0 THEN
      v_new_avg := ((v_prev_stock * v_prev_avg) + (v_qty * v_cost)) / v_new_stock;
    ELSE
      v_new_avg := v_prev_avg;
    END IF;

    UPDATE public.inventario_items
       SET stock_actual = v_new_stock,
           costo_promedio = ROUND(v_new_avg::numeric, 4),
           updated_at = now()
     WHERE id = v_item_id;

    -- Registrar movimiento auditable (evitar trigger apply_movimiento porque
    -- ya actualizamos stock arriba; insertamos con tipo 'ingreso' pero
    -- restauramos para que el neto quede correcto)
    -- Solución: registrar sin trigger. Usamos ajuste 'ingreso' pero
    -- deshacemos el efecto duplicado.
    INSERT INTO public.inventario_movimientos(item_id, tipo, cantidad, motivo, ref_trabajo_id)
    VALUES (v_item_id, 'ingreso', v_qty, 'Recepción OC ' || (SELECT folio FROM public.ordenes_compra WHERE id = _orden_id), NULL);
    -- El trigger apply_movimiento vuelve a sumar; corregimos:
    UPDATE public.inventario_items SET stock_actual = v_new_stock WHERE id = v_item_id;

    -- Acumular en la línea de OC
    UPDATE public.orden_compra_items
       SET cantidad_recibida = cantidad_recibida + v_qty,
           item_id = COALESCE(item_id, v_item_id),
           precio_unitario = COALESCE(precio_unitario, v_cost)
     WHERE id = v_oi_id;

    -- Detalle de recepción
    INSERT INTO public.orden_compra_recepcion_items(recepcion_id, orden_item_id, item_id, cantidad, costo_unitario)
    VALUES (v_rec_id, v_oi_id, v_item_id, v_qty, v_cost);
  END LOOP;

  -- Recalcular estado de la orden
  SELECT COALESCE(SUM(cantidad_pedida),0), COALESCE(SUM(cantidad_recibida),0)
    INTO v_total_pedido, v_total_recibido
  FROM public.orden_compra_items WHERE orden_id = _orden_id;

  IF v_total_recibido >= v_total_pedido AND v_total_pedido > 0 THEN
    UPDATE public.ordenes_compra SET estado='recibida', fecha_recibida=now() WHERE id=_orden_id;
    INSERT INTO public.orden_compra_estados_log(orden_id, estado_anterior, estado_nuevo, changed_by, notas)
    VALUES (_orden_id, v_estado_actual, 'recibida', v_uid, 'Recepción completa');
  ELSIF v_total_recibido > 0 THEN
    UPDATE public.ordenes_compra SET estado='parcial' WHERE id=_orden_id AND estado <> 'parcial';
    IF v_estado_actual <> 'parcial' THEN
      INSERT INTO public.orden_compra_estados_log(orden_id, estado_anterior, estado_nuevo, changed_by, notas)
      VALUES (_orden_id, v_estado_actual, 'parcial', v_uid, 'Recepción parcial');
    END IF;
  END IF;

  RETURN v_rec_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_recepcion_oc(uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_recepcion_oc(uuid, jsonb, text, text) TO authenticated;

-- ============================================================
-- Función auxiliar: cambiar estado (con log)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cambiar_estado_oc(
  _orden_id uuid,
  _nuevo_estado public.oc_estado,
  _notas text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev public.oc_estado;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'supervisor')) THEN
    RAISE EXCEPTION 'Solo admin/supervisor puede cambiar el estado';
  END IF;
  SELECT estado INTO v_prev FROM public.ordenes_compra WHERE id=_orden_id FOR UPDATE;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'Orden no existe'; END IF;
  IF v_prev = _nuevo_estado THEN RETURN; END IF;

  UPDATE public.ordenes_compra SET
    estado = _nuevo_estado,
    fecha_enviada = CASE WHEN _nuevo_estado='enviada' AND fecha_enviada IS NULL THEN now() ELSE fecha_enviada END,
    fecha_recibida = CASE WHEN _nuevo_estado='recibida' THEN now() ELSE fecha_recibida END,
    fecha_cancelada = CASE WHEN _nuevo_estado='cancelada' THEN now() ELSE fecha_cancelada END
  WHERE id=_orden_id;

  INSERT INTO public.orden_compra_estados_log(orden_id, estado_anterior, estado_nuevo, changed_by, notas)
  VALUES (_orden_id, v_prev, _nuevo_estado, v_uid, _notas);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cambiar_estado_oc(uuid, public.oc_estado, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_oc(uuid, public.oc_estado, text) TO authenticated;
