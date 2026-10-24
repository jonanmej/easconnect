CREATE OR REPLACE FUNCTION public.reportes_limpiar_copia_ia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.system_config WHERE key = 'report_ai_input:' || OLD.id::text;
    RETURN OLD;
  END IF;
  IF NEW.estado IN ('enviado','aprobado') THEN
    DELETE FROM public.system_config WHERE key = 'report_ai_input:' || NEW.id::text;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.reportes_limpiar_copia_ia() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_reportes_limpiar_copia_ia AFTER UPDATE OF estado OR DELETE ON public.reportes
  FOR EACH ROW EXECUTE FUNCTION public.reportes_limpiar_copia_ia();

CREATE OR REPLACE FUNCTION public.system_config_historial_ia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key text := COALESCE(NEW.key, OLD.key);
BEGIN
  IF _key = 'report_ai_provider' AND TG_OP IN ('INSERT','UPDATE') THEN
    INSERT INTO public.auditoria_log(entidad, accion, antes, despues, actor)
    VALUES ('ia_reportes', 'cambiar_proveedor',
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.value END, NEW.value, auth.uid());
  ELSIF _key = 'report_ai_terminal_block' AND TG_OP = 'DELETE' THEN
    INSERT INTO public.auditoria_log(entidad, accion, antes, despues, actor)
    VALUES ('ia_reportes', 'reanudar', OLD.value, NULL, auth.uid());
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE EXECUTE ON FUNCTION public.system_config_historial_ia() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_system_config_historial_ia AFTER INSERT OR UPDATE OR DELETE ON public.system_config
  FOR EACH ROW EXECUTE FUNCTION public.system_config_historial_ia();