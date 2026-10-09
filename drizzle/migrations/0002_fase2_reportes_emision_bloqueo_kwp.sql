-- A3/A2: columnas de emisión controlada, indicadores calculados y revisión de texto IA
ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS fecha_emision timestamptz,
  ADD COLUMN IF NOT EXISTS codigo_documento text,
  ADD COLUMN IF NOT EXISTS version_label text,
  ADD COLUMN IF NOT EXISTS indicadores jsonb,
  ADD COLUMN IF NOT EXISTS revision_ia_pendiente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revision_ia_detalle jsonb;

CREATE OR REPLACE FUNCTION public.codigo_reporte_ejecutivo(_ts timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 'EA-REP-EJE-Q' || extract(quarter FROM (_ts AT TIME ZONE 'America/El_Salvador'))::int
         || extract(year FROM (_ts AT TIME ZONE 'America/El_Salvador'))::int
$$;

-- Backfill de reportes ya emitidos (antes de activar el bloqueo)
UPDATE public.reportes r SET
  fecha_emision = COALESCE(
    (SELECT min(a.created_at) FROM public.reporte_auditoria a
      WHERE a.reporte_id = r.id AND a.estado_nuevo IN ('enviado','aprobado')),
    r.enviado_at, r.aprobado_at, r.updated_at)
WHERE r.estado IN ('enviado','aprobado') AND r.fecha_emision IS NULL;
UPDATE public.reportes SET
  codigo_documento = public.codigo_reporte_ejecutivo(fecha_emision),
  version_label = 'v' || COALESCE(version,1) || '.0'
WHERE fecha_emision IS NOT NULL AND codigo_documento IS NULL;

CREATE OR REPLACE FUNCTION public.reportes_control_emision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pv integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- La versión de una revisión siempre es la del padre + 1.
    IF NEW.reporte_padre_id IS NOT NULL THEN
      SELECT version INTO _pv FROM public.reportes WHERE id = NEW.reporte_padre_id;
      NEW.version := COALESCE(_pv, 1) + 1;
    ELSE
      NEW.version := COALESCE(NEW.version, 1);
    END IF;
    NEW.fecha_emision := NULL; NEW.codigo_documento := NULL; NEW.version_label := NULL;
  ELSE
    -- Campos de emisión: nunca editables a mano.
    NEW.fecha_emision := OLD.fecha_emision;
    NEW.codigo_documento := OLD.codigo_documento;
    NEW.version_label := OLD.version_label;
    NEW.version := OLD.version;
    NEW.reporte_padre_id := OLD.reporte_padre_id;

    -- A4: reporte emitido -> solo cambios de estado del flujo.
    IF OLD.estado IN ('enviado','aprobado') THEN
      IF NEW.titulo IS DISTINCT FROM OLD.titulo
        OR NEW.contenido_markdown IS DISTINCT FROM OLD.contenido_markdown
        OR NEW.insight_resumen IS DISTINCT FROM OLD.insight_resumen
        OR NEW.indicadores IS DISTINCT FROM OLD.indicadores
        OR NEW.periodo IS DISTINCT FROM OLD.periodo
        OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
        OR NEW.planta_id IS DISTINCT FROM OLD.planta_id
        OR NEW.desde IS DISTINCT FROM OLD.desde
        OR NEW.hasta IS DISTINCT FROM OLD.hasta
        OR NEW.generado_por IS DISTINCT FROM OLD.generado_por
        OR NEW.model_used IS DISTINCT FROM OLD.model_used
        OR NEW.revision_ia_pendiente IS DISTINCT FROM OLD.revision_ia_pendiente
        OR NEW.revision_ia_detalle IS DISTINCT FROM OLD.revision_ia_detalle
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'El reporte ya fue emitido (%): no se puede modificar su contenido. Crea una nueva versión.', OLD.estado
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF NEW.estado IN ('enviado','aprobado') THEN
    IF NEW.revision_ia_pendiente AND (TG_OP = 'INSERT' OR OLD.estado NOT IN ('enviado','aprobado')) THEN
      RAISE EXCEPTION 'El texto del reporte tiene cifras sin verificar. Revísalo antes de emitirlo.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.fecha_emision IS NULL THEN
      NEW.fecha_emision := now();
      NEW.codigo_documento := public.codigo_reporte_ejecutivo(NEW.fecha_emision);
      NEW.version_label := 'v' || COALESCE(NEW.version,1) || '.0';
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.reportes_control_emision() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_reportes_control_emision ON public.reportes;
CREATE TRIGGER trg_reportes_control_emision
  BEFORE INSERT OR UPDATE ON public.reportes
  FOR EACH ROW EXECUTE FUNCTION public.reportes_control_emision();

-- M6: capacidad numérica en kWp (se conserva la columna de texto)
ALTER TABLE public.plantas ADD COLUMN IF NOT EXISTS capacidad_kwp numeric;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS capacidad_kwp numeric;

UPDATE public.plantas SET capacidad_kwp = CASE
    WHEN lower(substring(capacidad from '(?i)([km])wp?\s*$')) = 'm'
      THEN (substring(capacidad from '^\s*([0-9]+(?:\.[0-9]+)?)'))::numeric * 1000
    ELSE (substring(capacidad from '^\s*([0-9]+(?:\.[0-9]+)?)'))::numeric END
WHERE capacidad_kwp IS NULL AND capacidad ~* '^\s*[0-9]+(\.[0-9]+)?\s*[km]wp?\s*$';

UPDATE public.clientes SET capacidad_kwp = CASE
    WHEN lower(substring(capacidad from '(?i)([km])wp?\s*$')) = 'm'
      THEN (substring(capacidad from '^\s*([0-9]+(?:\.[0-9]+)?)'))::numeric * 1000
    ELSE (substring(capacidad from '^\s*([0-9]+(?:\.[0-9]+)?)'))::numeric END
WHERE capacidad_kwp IS NULL AND capacidad ~* '^\s*[0-9]+(\.[0-9]+)?\s*[km]wp?\s*$';

COMMENT ON COLUMN public.plantas.capacidad IS 'Texto libre heredado; la fuente oficial es capacidad_kwp';
COMMENT ON COLUMN public.clientes.capacidad IS 'Texto libre heredado; la fuente oficial es capacidad_kwp';