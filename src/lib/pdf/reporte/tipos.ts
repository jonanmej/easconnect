


export type ReporteData = {
  titulo: string;
  cliente: string;
  planta: string;
  periodo: string;
  emitido_at: string;
  modelo: string | null;
  resumen: string;
  hallazgos: string[];
  recomendaciones: string[];
  kpis: { label: string; value: string }[];
  trabajos: { folio: string; servicio: string; fecha: string; estado: string; tecnico?: string | null; notas?: string | null }[];
  evidencias: { trabajo: string; descripcion?: string | null; dataUrl: string; aspect?: number | null; categoria?: string | null }[];
  reportes_diarios?: {
    fecha: string;
    folio?: string | null;
    tecnicos?: string | null;
    aportes?: number | null;
    hora_inicio?: string | null;
    hora_fin?: string | null;
    avance_pct?: number | null;
    paneles_limpiados?: number | null;
    watts_panel?: number | null;
    watts_totales?: number | null;
    tds_ppm?: number | null;
    angulo_inclinacion?: number | null;
    presion_agua_psi?: number | null;
    agua_galones?: number | null;
    horas_trabajadas?: number | null;
  }[];
  /** Desglose opcional por técnico; los totales por día siguen consolidados. */
  desglose_tecnico?: {
    fecha: string;
    folio?: string | null;
    tecnico: string;
    hora_inicio?: string | null;
    hora_fin?: string | null;
    paneles_limpiados?: number | null;
    agua_galones?: number | null;
    horas_trabajadas?: number | null;
    avance_pct?: number | null;
  }[];
  mapas_diarios?: {
    fecha: string;
    folio?: string | null;
    planta?: string | null;
    dataUrl?: string | null;
    basemap?: {
      tiles: { src: string; x: number; y: number; w?: number; h?: number }[];
      w: number; h: number; z: number; ox: number; oy: number; tile: number;
    } | null;
    zonas?: { nombre: string; poligono: { lat: number; lng: number }[]; estado: string | null }[];
    completadas: number;
    en_proceso: number;
    total: number;
  }[];
  graficas?: {
    titulo: string;
    descripcion?: string;
    fuente: string;
    series: { label: string; value: number }[];
    unidad?: string;
  }[];
  responsable?: string | null;
  responsable_cargo?: string | null;
  documento_id?: string;
  documento_codigo?: string;
  documento_version?: string;
  /** Folio de la OT: el reporte se identifica por código + folio + versión. */
  folio_ot?: string | null;
  documento_clasificacion?: string;
  documento_hash?: string;
  modo: "ejecutivo" | "interno";
  /** Tema visual del documento — controla la variante del logo. Por defecto "light". */
  theme?: "light" | "dark";
  /** Color de acento personalizable por cliente (hex #RRGGBB). Reemplaza el azul EA. */
  color_acento?: string | null;
  /** Resumen agrupado por planta (aparece en el reporte ejecutivo). */
  resumen_por_planta?: { planta: string; total: number; completados: number; servicios: string }[];
  /** Resumen agrupado por servicio/equipo (aparece en el reporte ejecutivo). */
  resumen_por_servicio?: { servicio: string; total: number; completados: number }[];
};

/** Dibujo vectorial del layout de la planta con las zonas marcadas del día. */
