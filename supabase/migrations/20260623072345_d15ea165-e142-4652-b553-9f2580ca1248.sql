
CREATE OR REPLACE FUNCTION public.gen_inventario_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE cat_code text;
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

CREATE OR REPLACE FUNCTION public.gen_equipo_codigo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE tipo_code text;
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' OR NEW.codigo ~ '^AUTO' THEN
    tipo_code := upper(regexp_replace(coalesce(NEW.tipo, 'GEN'), '[^A-Za-z0-9]', '', 'g'));
    tipo_code := left(coalesce(nullif(tipo_code, ''), 'GEN'), 3);
    NEW.codigo := 'EQP-' || tipo_code || '-' || lpad(nextval('public.equipos_codigo_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

GRANT USAGE ON SEQUENCE public.inventario_sku_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.equipos_codigo_seq TO authenticated;
