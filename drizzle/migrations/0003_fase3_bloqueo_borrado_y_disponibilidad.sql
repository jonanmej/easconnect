CREATE OR REPLACE FUNCTION public.reportes_bloquear_borrado()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.estado IN ('enviado','aprobado') THEN
    RAISE EXCEPTION 'REPORTE_EMITIDO_NO_ELIMINABLE: el reporte % está % y no se puede eliminar; solo se eliminan borradores o rechazados', COALESCE(OLD.codigo_documento, OLD.titulo), OLD.estado
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_reportes_bloquear_borrado ON public.reportes;
CREATE TRIGGER trg_reportes_bloquear_borrado BEFORE DELETE ON public.reportes
FOR EACH ROW EXECUTE FUNCTION public.reportes_bloquear_borrado();

CREATE OR REPLACE FUNCTION public.disponibilidad_calendario(_desde date, _hasta date)
RETURNS TABLE(fecha_inicio timestamptz, duracion_dias integer, propio boolean, folio text, servicio text, planta_nombre text, estado text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cli uuid; _staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  _staff := has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor');
  _cli := current_cliente_id();
  IF NOT _staff AND (_cli IS NULL OR NOT has_role(auth.uid(),'cliente')) THEN
    RAISE EXCEPTION 'Sin permiso para consultar disponibilidad';
  END IF;
  IF _hasta < _desde OR _hasta - _desde > 400 THEN RAISE EXCEPTION 'Rango inválido'; END IF;
  RETURN QUERY
  SELECT t.fecha_programada,
         GREATEST(1, t.duracion_dias),
         (_staff OR p.cliente_id = _cli),
         CASE WHEN _staff OR p.cliente_id = _cli THEN t.folio ELSE NULL END,
         CASE WHEN _staff OR p.cliente_id = _cli THEN t.servicio ELSE NULL END,
         CASE WHEN _staff OR p.cliente_id = _cli THEN p.nombre ELSE 'Ocupado/Reservado' END,
         CASE WHEN _staff OR p.cliente_id = _cli THEN t.estado::text ELSE NULL END
  FROM trabajos t JOIN plantas p ON p.id = t.planta_id
  WHERE t.estado <> 'cancelado'
    AND t.fecha_programada >= (_desde - 30)::timestamptz
    AND t.fecha_programada < (_hasta + 1)::timestamptz;
END $$;

REVOKE ALL ON FUNCTION public.disponibilidad_calendario(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disponibilidad_calendario(date, date) TO authenticated;