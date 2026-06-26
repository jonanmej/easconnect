-- DELETE policy: cada usuario puede borrar sus notificaciones
GRANT DELETE ON public.notificaciones_usuario TO authenticated;

DROP POLICY IF EXISTS "user borra sus notif" ON public.notificaciones_usuario;
CREATE POLICY "user borra sus notif"
  ON public.notificaciones_usuario FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Auto-limpieza: cuando trabajo se resuelve (completado/cancelado) borrar notificaciones vinculadas
CREATE OR REPLACE FUNCTION public.cleanup_notificaciones_trabajo_resuelto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado IN ('completado','cancelado')
     AND (OLD.estado IS DISTINCT FROM NEW.estado) THEN
    DELETE FROM public.notificaciones_usuario WHERE trabajo_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cleanup_notificaciones_trabajo_resuelto() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_cleanup_notif_trabajo ON public.trabajos;
CREATE TRIGGER trg_cleanup_notif_trabajo
AFTER UPDATE OF estado ON public.trabajos
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_notificaciones_trabajo_resuelto();