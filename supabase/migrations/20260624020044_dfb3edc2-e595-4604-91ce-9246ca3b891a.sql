
DO $$
DECLARE
  v_planta uuid := 'dde5b825-0560-4e06-9e20-4d2ba102c868';
  v_tecnico uuid := '288113af-df67-4d57-8522-57cefae968c0';
  v_trabajo uuid := gen_random_uuid();
  v_fecha_prog timestamptz := now() - interval '2 days';
  v_fecha_comp timestamptz := now() - interval '2 days' + interval '6 hours';
BEGIN
  INSERT INTO public.trabajos (id, folio, planta_id, servicio, fecha_programada, fecha_completado, tecnico_id, estado, notas, duracion_dias, origen, firmado_at, firmado_por)
  VALUES (
    v_trabajo,
    'SIM-LIMP-' || to_char(now(), 'YYYYMMDD-HH24MI'),
    v_planta, 'Limpieza de paneles solares',
    v_fecha_prog, v_fecha_comp, v_tecnico, 'completado',
    'Limpieza integral de los 3,843 paneles del parque PMA. Se utilizó agua desmineralizada y cepillos rotatorios. Sin novedades de seguridad.',
    1, 'simulacion', v_fecha_comp, 'Carlos Mendoza'
  );

  INSERT INTO public.trabajo_reportes (
    trabajo_id, condiciones_sitio, trabajo_realizado, hallazgos, recomendaciones,
    mediciones, materiales_usados, tecnico_nombre, cliente_recibe_nombre, cliente_recibe_cargo,
    cliente_observaciones, paneles_limpiados, agua_galones
  ) VALUES (
    v_trabajo,
    'Día soleado, temperatura ambiente 31°C, viento leve del NE. Acceso a azotea despejado, EPP completo verificado antes del ingreso.',
    'Se realizó limpieza húmeda de la totalidad de los 3,843 paneles distribuidos en 4 secciones de la cubierta. Se aplicó agua desmineralizada (TDS < 20 ppm) con cepillos rotatorios de cerda suave. Inspección visual por string y registro fotográfico antes/después.',
    'Se identificaron 2 paneles con micro-fisuras en la sección B-12 (sin afectación operativa por ahora) y acumulación de excremento de aves concentrado en bordes este. Conexiones MC4 sin signos de corrosión.',
    'Programar reemplazo preventivo de los 2 paneles con micro-fisuras dentro de los próximos 60 días. Evaluar instalación de disuasores de aves en el perímetro este. Mantener cadencia de limpieza trimestral.',
    '{"irradiancia_w_m2": 920, "tdiff_panel_amb_c": 18, "voc_string_promedio_v": 612, "isc_string_promedio_a": 9.8, "ganancia_estimada_post_limpieza_pct": 7.4}'::jsonb,
    'Agua desmineralizada (450 gal), detergente neutro biodegradable (2 L), paños microfibra (12 un), cepillos rotatorios suaves.',
    'Jonathan Mejía', 'Carlos Mendoza', 'Jefe de Mantenimiento - COESAR',
    'Trabajo recibido conforme. Personal cumplió con protocolos de seguridad y orden y limpieza al finalizar.',
    3843, 450
  );

  INSERT INTO public.trabajo_recursos (trabajo_id, categoria, descripcion, cantidad, unidad, entregado, devuelto, notas) VALUES
    (v_trabajo, 'insumo', 'Agua desmineralizada (TDS < 20 ppm)', 450, 'gal', true, false, 'Consumo total registrado'),
    (v_trabajo, 'insumo', 'Detergente neutro biodegradable', 2, 'L', true, false, 'Apto para módulos FV'),
    (v_trabajo, 'herramienta', 'Cepillo rotatorio telescópico', 2, 'un', true, true, 'En buen estado al devolver'),
    (v_trabajo, 'herramienta', 'Manguera presurizada 50 m', 1, 'un', true, true, NULL),
    (v_trabajo, 'epp', 'Arnés de seguridad anticaídas', 3, 'un', true, true, 'Inspeccionado pre y post jornada'),
    (v_trabajo, 'epp', 'Casco dieléctrico con barboquejo', 3, 'un', true, true, NULL),
    (v_trabajo, 'repuesto', 'Conectores MC4 (stock contingencia)', 4, 'un', true, true, 'No utilizados');

  INSERT INTO public.trabajo_evidencias (trabajo_id, storage_path, descripcion, categoria, subido_por) VALUES
    (v_trabajo, 'simulacion/pma/antes-seccion-a.jpg', 'Sección A antes de la limpieza - acumulación de polvo visible', 'antes', v_tecnico),
    (v_trabajo, 'simulacion/pma/antes-seccion-b.jpg', 'Sección B antes - residuos de aves en bordes este', 'antes', v_tecnico),
    (v_trabajo, 'simulacion/pma/durante-cepillado.jpg', 'Aplicación de agua desmineralizada con cepillo rotatorio', 'durante', v_tecnico),
    (v_trabajo, 'simulacion/pma/despues-seccion-a.jpg', 'Sección A después - superficie limpia uniforme', 'despues', v_tecnico),
    (v_trabajo, 'simulacion/pma/despues-seccion-b.jpg', 'Sección B después de la limpieza', 'despues', v_tecnico),
    (v_trabajo, 'simulacion/pma/anomalia-microfisuras.jpg', 'Microfisuras detectadas en 2 paneles de sección B-12', 'anomalia', v_tecnico),
    (v_trabajo, 'simulacion/pma/mediciones-multimetro.jpg', 'Registro de Voc/Isc por string post-limpieza', 'despues', v_tecnico);

  INSERT INTO public.trabajo_aprobaciones (
    trabajo_id, token, expira_at, firmado_at, firmante_nombre, creado_por
  ) VALUES (
    v_trabajo,
    'SIM-' || encode(gen_random_bytes(16), 'hex'),
    now() + interval '30 days',
    v_fecha_comp,
    'Carlos Mendoza',
    v_tecnico
  );
END $$;
