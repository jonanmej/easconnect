UPDATE public.profiles
SET perfil_completado = false
WHERE perfil_completado IS DISTINCT FROM false
  AND (
    nombres IS NULL OR length(btrim(nombres)) = 0
    OR apellidos IS NULL OR length(btrim(apellidos)) = 0
    OR cargo IS NULL OR length(btrim(cargo)) = 0
  );