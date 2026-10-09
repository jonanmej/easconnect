CREATE OR REPLACE FUNCTION public.proteger_campos_perfil()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la empresa asignada a un usuario';
  END IF;
  IF NEW.debe_cambiar_password = true AND OLD.debe_cambiar_password = false THEN
    NEW.debe_cambiar_password := OLD.debe_cambiar_password;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.proteger_campos_perfil() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_proteger_campos_perfil ON public.profiles;
CREATE TRIGGER trg_proteger_campos_perfil BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.proteger_campos_perfil();