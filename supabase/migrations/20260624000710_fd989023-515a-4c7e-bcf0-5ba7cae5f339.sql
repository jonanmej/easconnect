
-- 1) Perfil de usuario: campos para completar perfil
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nombres TEXT,
  ADD COLUMN IF NOT EXISTS apellidos TEXT,
  ADD COLUMN IF NOT EXISTS cargo TEXT,
  ADD COLUMN IF NOT EXISTS perfil_completado BOOLEAN NOT NULL DEFAULT false;

-- Backfill: usuarios existentes ya están "completados" para no romper sesiones
UPDATE public.profiles SET perfil_completado = true WHERE perfil_completado = false;

-- 2) handle_new_user: marca nuevos usuarios como pendientes de completar perfil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, perfil_completado)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 3) RPC agregada para KPIs del dashboard empresarial (rendimiento: una sola ida y vuelta)
CREATE OR REPLACE FUNCTION public.dashboard_kpis_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today_start TIMESTAMPTZ := date_trunc('day', now());
  v_today_end   TIMESTAMPTZ := v_today_start + interval '1 day';
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'trabajos_hoy', (
      SELECT count(*) FROM public.trabajos
      WHERE fecha_programada >= v_today_start AND fecha_programada < v_today_end
    ),
    'trabajos_total', (SELECT count(*) FROM public.trabajos),
    'equipos_total', (SELECT count(*) FROM public.equipos),
    'equipos_operativos', (SELECT count(*) FROM public.equipos WHERE estado = 'operativo'),
    'eficiencia', (
      SELECT COALESCE(round(avg(salud)::numeric, 1)::text, '--') FROM public.equipos WHERE salud IS NOT NULL
    ),
    'alertas', (
      SELECT count(*) FROM public.equipos WHERE estado IN ('mantenimiento','fuera_servicio')
    ),
    'inv_bajo_stock', (
      SELECT count(*) FROM public.inventario_items WHERE stock_actual < stock_minimo
    ),
    'reportes_borrador', (
      SELECT count(*) FROM public.reportes WHERE estado = 'borrador'
    ),
    'paneles_limpiados', (
      SELECT COALESCE(sum(paneles_limpiados), 0)::int FROM public.trabajo_reportes
    ),
    'paneles_parque', (
      SELECT COALESCE(sum(paneles), 0)::int FROM public.plantas
    ),
    'agua_galones', (
      SELECT COALESCE(round(sum(agua_galones))::int, 0) FROM public.trabajo_reportes
    ),
    'anomalias_detectadas', (
      SELECT count(*) FROM public.trabajo_evidencias WHERE categoria = 'anomalia'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dashboard_kpis_v1() TO authenticated;
