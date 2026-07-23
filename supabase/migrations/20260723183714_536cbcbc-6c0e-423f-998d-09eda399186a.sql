-- Fix: registrar_recepcion_oc referenced non-existent inventario_movimientos.ref_trabajo_id
-- Correct column is trabajo_id.

CREATE OR REPLACE FUNCTION public.registrar_recepcion_oc(_orden_id uuid, _lineas jsonb, _notas text DEFAULT NULL::text, _recibido_por_nombre text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec_id uuid;
  v_estado_actual public.oc_estado;
  v_line jsonb;
  v_oi_id uuid;
  v_item_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_moneda text;
  v_impuesto numeric;
  v_precio_esperado numeric;
  v_variacion_motivo text;
  v_prev_stock numeric;
  v_prev_avg numeric;
  v_new_stock numeric;
  v_new_avg numeric;
  v_orden_item RECORD;
  v_total_pedido numeric;
  v_total_recibido numeric;
  v_ri_id uuid;
  v_oc_moneda text;
  v_oc_impuesto numeric;
  v_uid uuid := auth.uid();
  v_pendiente numeric;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'supervisor') OR public.has_role(v_uid,'tecnico')) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF _orden_id IS NULL OR _lineas IS NULL OR jsonb_array_length(_lineas) = 0 THEN
    RAISE EXCEPTION 'Debe indicar líneas a recibir';
  END IF;

  SELECT estado, moneda, impuesto_pct
    INTO v_estado_actual, v_oc_moneda, v_oc_impuesto
  FROM public.ordenes_compra WHERE id = _orden_id FOR UPDATE;
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
    v_moneda := COALESCE(NULLIF(v_line->>'moneda',''), v_oc_moneda, 'USD');
    v_impuesto := COALESCE((v_line->>'impuesto_pct')::numeric, v_oc_impuesto, 0);
    v_precio_esperado := NULLIF(v_line->>'precio_esperado','')::numeric;
    v_variacion_motivo := NULLIF(v_line->>'variacion_motivo','');

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad debe ser mayor que 0 (recibido: %)', v_qty;
    END IF;
    IF v_cost < 0 THEN
      RAISE EXCEPTION 'Costo unitario no puede ser negativo';
    END IF;
    IF v_impuesto < 0 OR v_impuesto > 100 THEN
      RAISE EXCEPTION 'Impuesto fuera de rango (0-100): %', v_impuesto;
    END IF;

    SELECT * INTO v_orden_item FROM public.orden_compra_items WHERE id = v_oi_id AND orden_id = _orden_id FOR UPDATE;
    IF v_orden_item.id IS NULL THEN RAISE EXCEPTION 'Línea inválida %', v_oi_id; END IF;

    v_pendiente := v_orden_item.cantidad_pedida - v_orden_item.cantidad_recibida;
    IF v_qty > v_pendiente THEN
      RAISE EXCEPTION 'Sobrerrecepción en "%": pendiente=% recibiendo=%', v_orden_item.nombre, v_pendiente, v_qty;
    END IF;

    IF v_item_id IS NULL THEN v_item_id := v_orden_item.item_id; END IF;
    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'La línea "%" es un ítem libre. Debes crear el SKU o mapearlo a uno existente antes de recibir.', v_orden_item.nombre;
    END IF;

    IF v_precio_esperado IS NULL THEN
      v_precio_esperado := v_orden_item.precio_unitario;
    END IF;

    IF (v_precio_esperado IS NOT NULL AND abs(v_precio_esperado - v_cost) > 0.0001)
       OR (v_moneda IS DISTINCT FROM COALESCE(v_oc_moneda,'USD'))
       OR (v_impuesto IS DISTINCT FROM COALESCE(v_oc_impuesto,0))
    THEN
      IF v_variacion_motivo IS NULL OR length(btrim(v_variacion_motivo)) < 3 THEN
        RAISE EXCEPTION 'Variación detectada en "%": ingresa un motivo (precio esperado % · recibido % · moneda %/% · impuesto %/%).',
          v_orden_item.nombre, v_precio_esperado, v_cost, COALESCE(v_oc_moneda,'USD'), v_moneda, COALESCE(v_oc_impuesto,0), v_impuesto;
      END IF;
    END IF;

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

    INSERT INTO public.inventario_movimientos(item_id, tipo, cantidad, motivo, trabajo_id)
    VALUES (v_item_id, 'ingreso', v_qty, 'Recepción OC ' || (SELECT folio FROM public.ordenes_compra WHERE id = _orden_id), NULL);
    UPDATE public.inventario_items SET stock_actual = v_new_stock WHERE id = v_item_id;

    UPDATE public.orden_compra_items
       SET cantidad_recibida = cantidad_recibida + v_qty,
           item_id = COALESCE(item_id, v_item_id),
           precio_unitario = COALESCE(precio_unitario, v_cost)
     WHERE id = v_oi_id;

    INSERT INTO public.orden_compra_recepcion_items(
      recepcion_id, orden_item_id, item_id, cantidad, costo_unitario,
      moneda, impuesto_pct, precio_esperado, variacion_motivo
    ) VALUES (
      v_rec_id, v_oi_id, v_item_id, v_qty, v_cost,
      v_moneda, v_impuesto, v_precio_esperado, v_variacion_motivo
    ) RETURNING id INTO v_ri_id;

    IF v_precio_esperado IS NOT NULL AND abs(v_precio_esperado - v_cost) > 0.0001 THEN
      INSERT INTO public.orden_compra_variaciones(recepcion_item_id, orden_id, tipo, valor_esperado, valor_recibido, motivo, registrado_por)
      VALUES (v_ri_id, _orden_id, 'precio', v_precio_esperado::text, v_cost::text, v_variacion_motivo, v_uid);
    END IF;
    IF v_moneda IS DISTINCT FROM COALESCE(v_oc_moneda,'USD') THEN
      INSERT INTO public.orden_compra_variaciones(recepcion_item_id, orden_id, tipo, valor_esperado, valor_recibido, motivo, registrado_por)
      VALUES (v_ri_id, _orden_id, 'moneda', COALESCE(v_oc_moneda,'USD'), v_moneda, v_variacion_motivo, v_uid);
    END IF;
    IF v_impuesto IS DISTINCT FROM COALESCE(v_oc_impuesto,0) THEN
      INSERT INTO public.orden_compra_variaciones(recepcion_item_id, orden_id, tipo, valor_esperado, valor_recibido, motivo, registrado_por)
      VALUES (v_ri_id, _orden_id, 'impuesto', COALESCE(v_oc_impuesto,0)::text, v_impuesto::text, v_variacion_motivo, v_uid);
    END IF;
  END LOOP;

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
$function$;


CREATE OR REPLACE FUNCTION public.editar_recepcion_item_oc(_recepcion_item_id uuid, _nueva_cantidad numeric, _nuevo_costo numeric, _motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ri RECORD;
  v_oi RECORD;
  v_oc RECORD;
  v_delta_qty numeric;
  v_pendiente numeric;
  v_prev_stock numeric;
  v_prev_avg numeric;
  v_new_stock numeric;
  v_new_avg numeric;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'supervisor')) THEN
    RAISE EXCEPTION 'Solo admin/supervisor puede editar recepciones';
  END IF;
  IF _nueva_cantidad IS NULL OR _nueva_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad editada debe ser mayor que 0';
  END IF;
  IF _nuevo_costo < 0 THEN
    RAISE EXCEPTION 'El costo no puede ser negativo';
  END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 3 THEN
    RAISE EXCEPTION 'Debes indicar un motivo para editar la recepción';
  END IF;

  SELECT * INTO v_ri FROM public.orden_compra_recepcion_items WHERE id = _recepcion_item_id FOR UPDATE;
  IF v_ri.id IS NULL THEN RAISE EXCEPTION 'Línea de recepción no existe'; END IF;

  SELECT * INTO v_oi FROM public.orden_compra_items WHERE id = v_ri.orden_item_id FOR UPDATE;
  SELECT * INTO v_oc FROM public.ordenes_compra WHERE id = v_oi.orden_id FOR UPDATE;
  IF v_oc.estado = 'cancelada' THEN
    RAISE EXCEPTION 'No se puede editar recepciones de una orden cancelada';
  END IF;

  v_delta_qty := _nueva_cantidad - v_ri.cantidad;

  v_pendiente := v_oi.cantidad_pedida - v_oi.cantidad_recibida;
  IF v_delta_qty > v_pendiente THEN
    RAISE EXCEPTION 'La edición supera lo pedido en "%": pendiente=% delta=%', v_oi.nombre, v_pendiente, v_delta_qty;
  END IF;

  SELECT stock_actual, COALESCE(costo_promedio,0) INTO v_prev_stock, v_prev_avg
  FROM public.inventario_items WHERE id = v_ri.item_id FOR UPDATE;
  IF v_prev_stock IS NULL THEN RAISE EXCEPTION 'Ítem de inventario no existe'; END IF;

  v_new_stock := v_prev_stock - v_ri.cantidad;
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'La reversión dejaría stock negativo en el SKU. Ajusta el inventario antes de editar.';
  END IF;
  IF (v_new_stock + _nueva_cantidad) > 0 THEN
    v_new_avg := ((v_new_stock * v_prev_avg) + (_nueva_cantidad * _nuevo_costo)) / (v_new_stock + _nueva_cantidad);
  ELSE
    v_new_avg := v_prev_avg;
  END IF;
  v_new_stock := v_new_stock + _nueva_cantidad;

  UPDATE public.inventario_items
     SET stock_actual = v_new_stock,
         costo_promedio = ROUND(v_new_avg::numeric, 4),
         updated_at = now()
   WHERE id = v_ri.item_id;

  INSERT INTO public.inventario_movimientos(item_id, tipo, cantidad, motivo, trabajo_id)
  VALUES (v_ri.item_id, 'ajuste', v_new_stock,
          'Edición recepción OC ' || v_oc.folio || ' (Δ=' || v_delta_qty::text || ')', NULL);
  UPDATE public.inventario_items SET stock_actual = v_new_stock WHERE id = v_ri.item_id;

  UPDATE public.orden_compra_items
     SET cantidad_recibida = cantidad_recibida + v_delta_qty
   WHERE id = v_oi.id;

  UPDATE public.orden_compra_recepcion_items
     SET cantidad = _nueva_cantidad,
         costo_unitario = _nuevo_costo,
         variacion_motivo = _motivo
   WHERE id = _recepcion_item_id;

  INSERT INTO public.orden_compra_variaciones(recepcion_item_id, orden_id, tipo, valor_esperado, valor_recibido, motivo, registrado_por)
  VALUES (_recepcion_item_id, v_oc.id, 'cantidad', v_ri.cantidad::text, _nueva_cantidad::text, _motivo, v_uid);
  IF abs(v_ri.costo_unitario - _nuevo_costo) > 0.0001 THEN
    INSERT INTO public.orden_compra_variaciones(recepcion_item_id, orden_id, tipo, valor_esperado, valor_recibido, motivo, registrado_por)
    VALUES (_recepcion_item_id, v_oc.id, 'precio', v_ri.costo_unitario::text, _nuevo_costo::text, _motivo, v_uid);
  END IF;

  DECLARE
    v_total_pedido numeric; v_total_recibido numeric;
  BEGIN
    SELECT COALESCE(SUM(cantidad_pedida),0), COALESCE(SUM(cantidad_recibida),0)
      INTO v_total_pedido, v_total_recibido
    FROM public.orden_compra_items WHERE orden_id = v_oc.id;

    IF v_total_recibido >= v_total_pedido AND v_total_pedido > 0 THEN
      IF v_oc.estado <> 'recibida' THEN
        UPDATE public.ordenes_compra SET estado='recibida', fecha_recibida=now() WHERE id = v_oc.id;
        INSERT INTO public.orden_compra_estados_log(orden_id, estado_anterior, estado_nuevo, changed_by, notas)
        VALUES (v_oc.id, v_oc.estado, 'recibida', v_uid, 'Reconciliación por edición');
      END IF;
    ELSIF v_total_recibido > 0 THEN
      IF v_oc.estado <> 'parcial' THEN
        UPDATE public.ordenes_compra SET estado='parcial', fecha_recibida=NULL WHERE id = v_oc.id;
        INSERT INTO public.orden_compra_estados_log(orden_id, estado_anterior, estado_nuevo, changed_by, notas)
        VALUES (v_oc.id, v_oc.estado, 'parcial', v_uid, 'Reconciliación por edición');
      END IF;
    ELSE
      IF v_oc.estado NOT IN ('borrador','enviada','cancelada') THEN
        UPDATE public.ordenes_compra SET estado='enviada', fecha_recibida=NULL WHERE id = v_oc.id;
        INSERT INTO public.orden_compra_estados_log(orden_id, estado_anterior, estado_nuevo, changed_by, notas)
        VALUES (v_oc.id, v_oc.estado, 'enviada', v_uid, 'Reconciliación por edición (sin recepciones)');
      END IF;
    END IF;
  END;
END;
$function$;