
CREATE OR REPLACE FUNCTION public.verificar_conflicto_tecnico(_tecnico_id uuid, _fecha timestamp with time zone, _duracion_dias integer, _excluir_trabajo_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, folio text, fecha_programada timestamp with time zone, duracion_dias integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.folio, t.fecha_programada, t.duracion_dias
  FROM public.trabajos t
  WHERE t.tecnico_id = _tecnico_id
    AND t.estado <> 'cancelado'
    AND (_excluir_trabajo_id IS NULL OR t.id <> _excluir_trabajo_id)
    AND daterange(
          (t.fecha_programada AT TIME ZONE 'UTC')::date,
          ((t.fecha_programada AT TIME ZONE 'UTC')::date + GREATEST(COALESCE(t.duracion_dias,1),1)),
          '[)'
        ) && daterange(
          (_fecha AT TIME ZONE 'UTC')::date,
          ((_fecha AT TIME ZONE 'UTC')::date + GREATEST(COALESCE(_duracion_dias,1),1)),
          '[)'
        );
$function$;
