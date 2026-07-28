import { Document, Page, Text, View, StyleSheet, Image, Font } from "@react-pdf/renderer";
import { BRAND_LOGO_URLS } from "@/components/BrandLogo";

function absUrl(path: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://easconnect.lovable.app";
  return `${origin}${path}`;
}
const LOGO_EA = () => absUrl(BRAND_LOGO_URLS["ea-main"].light);
const LOGO_PVSTOP = () => absUrl(BRAND_LOGO_URLS.pvstop.light);
const LOGO_CHEMITEK = () => absUrl(BRAND_LOGO_URLS.chemitek.light);

// ---------------------------------------------------------------------------
// Tipografía: forzamos Helvetica-Bold real (no "fake bold") y desactivamos
// hifenación automática para evitar cortes como "Man- tenimiento".
// ---------------------------------------------------------------------------
Font.registerHyphenationCallback((word) => [word]);

// Cabecera institucional: el logo EA aparece en el encabezado de cada
// página; los logos de PVSTOP y Chemitek se ubican en el pie institucional.

// Fuentes PDF estándar (Helvetica-Bold es una fuente real embebida en PDF,
// no negrita sintética). Esto garantiza nitidez en Acrobat, Chrome, Safari,
// Preview y visores móviles sin dependencias de red.
const FONT_REG = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const FONT_OBL = "Helvetica-Oblique";

// Paleta oficial EA Service & Consulting tomada del logotipo original
// (triángulo "play" en degradado azul cornflower sobre wordmark azul).
const COL = {
  bg: "#2E4A87",          // Azul EA profundo (titulares, cabeceras de tabla)
  bgSoft: "#5B7FBF",      // Azul medio del triángulo
  primary: "#5B7FBF",     // Azul corporativo principal del logo EA
  primaryDeep: "#3B5EA8", // Azul profundo para bordes/acentos formales
  primarySoft: "#DDE6F4", // Azul muy claro (tono del triángulo claro)
  text: "#1f2937",
  muted: "#64748b",
  border: "#e2e8f0",
  panel: "#f8fafc",
  ok: "#10b981",
  danger: "#ef4444",
};

const styles = StyleSheet.create({
  // Página A4 — márgenes pensados para perforar y anexar a AMPO (izq. amplio).
  // paddingTop reserva el alto de la cabecera fija (logo EA + meta),
  // paddingBottom reserva el pie con los logos institucionales secundarios.
  page: { paddingTop: 96, paddingBottom: 84, paddingLeft: 96, paddingRight: 54, fontSize: 10, color: COL.text, fontFamily: FONT_REG },
  // Portada
  cover: { padding: 0 },
  coverBar: { position: "absolute", top: 0, left: 0, right: 0, height: 10, backgroundColor: COL.primary },
  coverSide: { position: "absolute", top: 0, bottom: 0, left: 0, width: 14, backgroundColor: COL.bg },
 coverInner: { paddingTop: 90, paddingBottom: 110, paddingLeft: 108, paddingRight: 60 },
  brand: { flexDirection: "row", alignItems: "center", marginBottom: 90 },
  brandText: { fontSize: 15, fontFamily: FONT_BOLD, letterSpacing: 1, color: COL.bg, marginLeft: 14 },
  brandSub: { fontSize: 8, color: COL.muted, letterSpacing: 2, marginLeft: 14, marginTop: 2, textTransform: "uppercase" },
  coverTag: { fontSize: 9, color: COL.primaryDeep, letterSpacing: 2, marginBottom: 10, textTransform: "uppercase", fontFamily: FONT_BOLD },
  coverTitle: { fontSize: 28, fontFamily: FONT_BOLD, lineHeight: 1.25, marginBottom: 18, color: COL.bg, maxWidth: 430 },
  coverRule: { width: 60, height: 3, backgroundColor: COL.primary, marginBottom: 24 },
 coverMeta: { marginTop: 30, borderTopWidth: 1, borderTopColor: COL.border, paddingTop: 14 },
 metaRow: { flexDirection: "row", marginBottom: 5, alignItems: "flex-start" },
 metaLabel: { width: 110, fontSize: 8.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 1, paddingRight: 6 },
 metaValue: { flex: 1, fontSize: 10, fontFamily: FONT_BOLD, color: COL.text },
  coverFooter: { position: "absolute", bottom: 40, left: 108, right: 60, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 10 },

  // Contenido
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: COL.primary },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 12 },
  headerLeftText: { flex: 1 },
  headerRight: { width: 150, alignItems: "flex-end" },
  headerTitle: { fontSize: 7.5, color: COL.bg, textTransform: "uppercase", letterSpacing: 1, fontFamily: FONT_BOLD },
  headerSub: { fontSize: 7, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 },
  headerRightTop: { fontSize: 8, color: COL.text, fontFamily: FONT_BOLD, textAlign: "right" },
  headerRightBot: { fontSize: 7.5, color: COL.muted, textAlign: "right", marginTop: 2, letterSpacing: 0.5 },
  pageTitle: { fontSize: 17, fontFamily: FONT_BOLD, marginBottom: 12, color: COL.bg },
  pageTitleRule: { width: 40, height: 2.5, backgroundColor: COL.primary, marginBottom: 14, marginTop: -8 },
  sectionTitle: { fontSize: 11.5, fontFamily: FONT_BOLD, marginTop: 16, marginBottom: 8, color: COL.bg, paddingBottom: 4, borderBottomWidth: 0.75, borderBottomColor: COL.primary },
  // Wrapper que agrupa "título + primer contenido" para que nunca se
  // separen entre páginas. El `minPresenceAhead` reserva espacio suficiente
  // debajo del título antes de permitir un salto de página.
  sectionBlock: { marginTop: 0 },
  paragraph: { fontSize: 10, lineHeight: 1.55, marginBottom: 8, color: "#1f2937", textAlign: "justify" },
  bullet: { flexDirection: "row", marginBottom: 5 },
  bulletDot: { width: 12, fontSize: 10, color: COL.primary, fontFamily: FONT_BOLD },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.5, textAlign: "justify" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  kpiCard: { width: "48%", padding: 10, borderWidth: 0.75, borderColor: COL.border, borderLeftWidth: 3, borderLeftColor: COL.primary, borderRadius: 3, backgroundColor: COL.panel },
  kpiLabel: { fontSize: 7.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontFamily: FONT_BOLD },
  kpiValue: { fontSize: 16, fontFamily: FONT_BOLD, color: COL.bg },
  table: { borderWidth: 1, borderColor: COL.border, borderRadius: 3, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  trLast: { flexDirection: "row" },
  th: { padding: 6, fontSize: 8, fontFamily: FONT_BOLD, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase" },
  td: { padding: 5, fontSize: 8.5, lineHeight: 1.35 },
  pageFooter: { position: "absolute", bottom: 20, left: 96, right: 54, flexDirection: "column", fontSize: 6.8, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 6 },
  pageFooterTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  pageFooterLogos: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0 },
  pageFooterMeta: { marginTop: 4, width: "100%" },
  pageFooterMetaLine: { fontSize: 6.6, lineHeight: 1.2 },
  pageFooterPage: { flexShrink: 0, textAlign: "right", width: 70, fontSize: 7 },
  evidGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3, marginTop: 2 },
  evidTile: {
    width: "50%",
    paddingHorizontal: 3,
    marginBottom: 8,
  },
  evidFrame: {
    borderWidth: 0.75,
    borderColor: COL.border,
    borderRadius: 3,
    padding: 3,
    backgroundColor: "#ffffff",
  },
  evidImgLandscape: { width: "100%", height: 150, objectFit: "cover", borderRadius: 2 },
  evidImgPortrait: { width: "100%", height: 210, objectFit: "cover", borderRadius: 2 },
  evidCaption: { fontSize: 7.5, color: COL.muted, marginTop: 4, lineHeight: 1.3 },
  badge: { fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start", color: "#fff", marginBottom: 4 },
  // Gráficas
  chartBlock: { marginBottom: 14, padding: 10, borderWidth: 0.5, borderColor: COL.border, borderRadius: 3, backgroundColor: COL.panel },
  chartTitle: { fontSize: 10, fontFamily: FONT_BOLD, marginBottom: 2, color: COL.bg },
  chartCaption: { fontSize: 8, color: COL.muted, marginBottom: 8, fontFamily: FONT_OBL },
  chartRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  chartLabel: { width: 110, fontSize: 9, color: COL.text },
  chartTrack: { flex: 1, height: 10, backgroundColor: "#fff", borderWidth: 0.5, borderColor: COL.border, borderRadius: 2, overflow: "hidden" },
  chartBar: { height: "100%", backgroundColor: COL.primary },
  chartValue: { width: 60, textAlign: "right", fontSize: 9, color: COL.text, fontFamily: "Courier" },
  chartSource: { fontSize: 7, color: COL.muted, marginTop: 6, fontFamily: FONT_OBL },
});

// Logo institucional en la cabecera de cada página (solo EA).
const brandStyles = StyleSheet.create({
  logoEa: { height: 34, objectFit: "contain" },
  footerLogoPv: { height: 16, objectFit: "contain" },
  footerLogoCh: { height: 12, objectFit: "contain" },
});

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
    paneles_limpiados?: number | null;
    watts_panel?: number | null;
    watts_totales?: number | null;
    tds_ppm?: number | null;
    angulo_inclinacion?: number | null;
    presion_agua_psi?: number | null;
    agua_galones?: number | null;
    horas_trabajadas?: number | null;
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

function PageHeader({ data, pageName }: { data: ReporteData; pageName: string }) {
  const codigo = `${data.documento_codigo ?? "REP"} · v${data.documento_version ?? "1.0"}`;
  const clasif = data.documento_clasificacion ?? "Uso interno";
  return (
    <View fixed style={{ position: "absolute", top: 24, left: 96, right: 54 }}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image src={LOGO_EA()} style={[brandStyles.logoEa, { marginRight: 10 }]} />
          <View style={styles.headerLeftText}>
            <Text style={styles.headerTitle}>EA SERVICE AND CONSULTING</Text>
            <Text style={styles.headerSub}>{(data.modo === "ejecutivo" ? "Reporte Ejecutivo" : "Reporte Interno")} · {pageName}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerRightTop}>{data.cliente}</Text>
          <Text style={styles.headerRightBot}>{data.periodo}</Text>
          <Text style={styles.headerRightBot}>{codigo}</Text>
          <Text style={styles.headerRightBot}>{clasif}</Text>
        </View>
      </View>
    </View>
  );
}

function PageFooter({ data }: { data: ReporteData }) {
  const responsable = data.responsable
    ? `${data.responsable}${data.responsable_cargo ? ` · ${data.responsable_cargo}` : ""}`
    : "Equipo EA Service and Consulting";
  const docId = data.documento_id ? data.documento_id.slice(0, 8).toUpperCase() : "—";
  const hash = data.documento_hash ? data.documento_hash.slice(0, 12) : null;
  return (
    <View style={styles.pageFooter} fixed>
      <View style={styles.pageFooterTop}>
        <View style={styles.pageFooterLogos}>
          <Image src={LOGO_PVSTOP()} style={brandStyles.footerLogoPv} />
          <Image src={LOGO_CHEMITEK()} style={brandStyles.footerLogoCh} />
        </View>
        <Text style={styles.pageFooterPage} render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} fixed />
      </View>
      <View style={styles.pageFooterMeta}>
        <Text style={styles.pageFooterMetaLine}>ID Doc: {docId}{hash ? ` · SHA-256 ${hash}…` : ""}</Text>
        <Text style={styles.pageFooterMetaLine}>Responsable: {responsable}</Text>
      </View>
    </View>
  );
}

function estadoColor(s: string) {
  const k = String(s ?? "").toLowerCase();
  if (k === "completado" || k === "completada") return COL.ok;
  if (k === "cancelado" || k === "cancelada") return COL.danger;
  if (k === "en_progreso" || k === "en progreso" || k === "en_proceso" || k === "en proceso") return COL.primary;
  return COL.muted;
}

function estadoTexto(s: string) {
  const k = String(s ?? "").toLowerCase();
  const map: Record<string, string> = {
    completado: "Completado",
    completada: "Completada",
    cancelado: "Cancelado",
    cancelada: "Cancelada",
    en_progreso: "En progreso",
    en_proceso: "En proceso",
    programado: "Programado",
    programada: "Programada",
    pendiente: "Pendiente",
    borrador: "Borrador",
  };
  if (map[k]) return map[k];
  return k.replace(/_+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function Grafica({ g }: { g: NonNullable<ReporteData["graficas"]>[number] }) {
  const max = Math.max(1, ...g.series.map((s) => s.value));
  return (
    <View style={styles.chartBlock} wrap={false}>
      <Text style={styles.chartTitle}>{g.titulo}</Text>
      {g.descripcion && <Text style={styles.chartCaption}>{g.descripcion}</Text>}
      {g.series.map((s, i) => {
        const pct = Math.round((s.value / max) * 100);
        return (
          <View key={i} style={styles.chartRow}>
            <Text style={styles.chartLabel}>{s.label}</Text>
            <View style={styles.chartTrack}>
              <View style={[styles.chartBar, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.chartValue}>{s.value}{g.unidad ? ` ${g.unidad}` : ""}</Text>
          </View>
        );
      })}
      <Text style={styles.chartSource}>Fuente: {g.fuente}</Text>
    </View>
  );
}


export function ReporteDoc({ data }: { data: ReporteData }) {
  const ejec = data.modo === "ejecutivo";
  const fechaEmision = new Date();
  // Aplicar color de acento personalizable por cliente (mutación segura:
  // el render de @react-pdf es síncrono, no concurre con otros renders).
  if (data.color_acento && /^#[0-9a-fA-F]{6}$/.test(data.color_acento)) {
    const accent = data.color_acento;
    styles.coverBar.backgroundColor = accent;
    styles.coverSide.backgroundColor = accent;
    styles.coverRule.backgroundColor = accent;
    styles.coverFooter.borderTopColor = accent;
    styles.header.borderBottomColor = accent;
    styles.pageTitleRule.backgroundColor = accent;
    styles.sectionTitle.borderBottomColor = accent;
    styles.pageFooter.borderTopColor = accent;
    styles.kpiCard.borderLeftColor = accent;
    (styles.bulletDot as any).color = accent;
    styles.chartBar.backgroundColor = accent;
    styles.th.backgroundColor = accent;
  } else {
    // Restaurar defaults por si un render previo mutó los estilos.
    styles.coverBar.backgroundColor = COL.primary;
    styles.coverSide.backgroundColor = COL.bg;
    styles.coverRule.backgroundColor = COL.primary;
    styles.coverFooter.borderTopColor = COL.primary;
    styles.header.borderBottomColor = COL.primary;
    styles.pageTitleRule.backgroundColor = COL.primary;
    styles.sectionTitle.borderBottomColor = COL.primary;
    styles.pageFooter.borderTopColor = COL.primary;
    styles.kpiCard.borderLeftColor = COL.primary;
    (styles.bulletDot as any).color = COL.primary;
    styles.chartBar.backgroundColor = COL.primary;
    styles.th.backgroundColor = COL.bg;
  }
  const keywords = [data.cliente, data.planta, data.periodo, ejec ? "Ejecutivo" : "Interno"]
    .filter(Boolean).join(", ");
  return (
    <Document
      title={data.titulo}
      author={data.responsable ?? "EA SERVICE AND CONSULTING"}
      subject={`Reporte ${ejec ? "ejecutivo" : "interno"} · ${data.cliente} · ${data.periodo}`}
      keywords={keywords}
      creator="EA Service Connect"
      producer="EA Service Connect"
      creationDate={fechaEmision}
      modificationDate={fechaEmision}
    >
      {ejec && (
        <Page size="A4" style={styles.cover}>
          <View style={styles.coverBar} />
          <View style={styles.coverSide} />
          <View style={styles.coverInner}>
            <View style={[styles.brand, { alignItems: "center" }]}>
              <Image src={LOGO_EA()} style={{ height: 60, objectFit: "contain" }} />
              <View style={{ marginLeft: 0 }}>
                <Text style={[styles.brandText, { marginLeft: 0 }]}>EA SERVICE AND CONSULTING</Text>
                <Text style={[styles.brandSub, { marginLeft: 0 }]}>Solar Operations · Quality Management</Text>
              </View>
            </View>
            <Text style={styles.coverTag}>Reporte Ejecutivo · {data.periodo}</Text>
            <Text style={styles.coverTitle}>{data.titulo}</Text>
            <View style={styles.coverRule} />
            <View style={styles.coverMeta}>
              <View style={styles.metaRow}><Text style={styles.metaLabel}>Cliente</Text><Text style={styles.metaValue}>{data.cliente}</Text></View>
              <View style={styles.metaRow}><Text style={styles.metaLabel}>Planta</Text><Text style={styles.metaValue}>{data.planta}</Text></View>
              <View style={styles.metaRow}><Text style={styles.metaLabel}>Periodo</Text><Text style={styles.metaValue}>{data.periodo}</Text></View>
              <View style={styles.metaRow}><Text style={styles.metaLabel}>Emitido</Text><Text style={styles.metaValue}>{data.emitido_at}</Text></View>
              {data.responsable && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Responsable</Text>
                  <Text style={styles.metaValue}>
                    {data.responsable}{data.responsable_cargo ? ` — ${data.responsable_cargo}` : ""}
                  </Text>
                </View>
              )}
              <View style={styles.metaRow}><Text style={styles.metaLabel}>ID Doc.</Text><Text style={styles.metaValue}>{(data.documento_id ?? "").slice(0, 8).toUpperCase() || "—"}</Text></View>
              <View style={styles.metaRow}><Text style={styles.metaLabel}>Código</Text><Text style={styles.metaValue}>{data.documento_codigo ?? "REP"} · v{data.documento_version ?? "1.0"}</Text></View>
              <View style={styles.metaRow}><Text style={styles.metaLabel}>Clasificación</Text><Text style={styles.metaValue}>{data.documento_clasificacion ?? "Uso interno"}</Text></View>
            </View>
          </View>
          <View style={styles.coverFooter} fixed>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Image src={LOGO_PVSTOP()} style={{ height: 22, objectFit: "contain" }} />
              <Image src={LOGO_CHEMITEK()} style={{ height: 16, objectFit: "contain" }} />
            </View>
            <Text>Confidencial · Uso del Cliente</Text>
          </View>
        </Page>
      )}

      <Page size="A4" style={styles.page}>
        <PageHeader data={data} pageName={ejec ? "Resumen Ejecutivo" : "Resumen Interno"} />
        <Text style={styles.pageTitle}>{ejec ? "Resumen Ejecutivo" : "Reporte Interno"}</Text>
        {ejec && data.resumen && <Text style={styles.paragraph}>{data.resumen}</Text>}

        <View wrap={false}>
          <Text style={styles.sectionTitle}>Indicadores Clave</Text>
          <Text style={{ fontSize: 8, color: COL.muted, marginBottom: 6, lineHeight: 1.4 }}>
            Nota: los porcentajes de avance corresponden al cumplimiento de la meta diaria comprometida para cada trabajo (paneles y actividades planificados por jornada), no al porcentaje del parque total de la planta.
          </Text>
          {data.kpis.length > 0 && (
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{data.kpis[0].label}</Text>
                <Text style={styles.kpiValue}>{data.kpis[0].value}</Text>
              </View>
              {data.kpis[1] && (
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{data.kpis[1].label}</Text>
                  <Text style={styles.kpiValue}>{data.kpis[1].value}</Text>
                </View>
              )}
            </View>
          )}
        </View>
        {data.kpis.length > 2 && (
          <View style={styles.kpiRow}>
            {data.kpis.slice(2).map((k, i) => (
              <View key={i} style={styles.kpiCard} wrap={false}>
                <Text style={styles.kpiLabel}>{k.label}</Text>
                <Text style={styles.kpiValue}>{k.value}</Text>
              </View>
            ))}
          </View>
        )}

        {data.graficas && data.graficas.length > 0 && (
          <>
            <View wrap={false}>
              <Text style={styles.sectionTitle}>Análisis Gráfico de Datos</Text>
              <Text style={{ fontSize: 8, color: COL.muted, marginBottom: 6, lineHeight: 1.4 }}>
                Los porcentajes graficados miden el cumplimiento de la meta diaria planificada de cada trabajo; no representan el avance sobre el total del parque instalado.
              </Text>
              <Grafica g={data.graficas[0]} />
            </View>
            {data.graficas.slice(1).map((g, i) => <Grafica key={i} g={g} />)}
          </>
        )}

        {ejec && data.hallazgos.length > 0 && (
          <>
            <View wrap={false}>
              <Text style={styles.sectionTitle}>Hallazgos</Text>
              <View style={styles.bullet}><Text style={styles.bulletDot}>›</Text><Text style={styles.bulletText}>{data.hallazgos[0]}</Text></View>
            </View>
            {data.hallazgos.slice(1).map((h, i) => (
              <View key={i} style={styles.bullet} wrap={false}><Text style={styles.bulletDot}>›</Text><Text style={styles.bulletText}>{h}</Text></View>
            ))}
          </>
        )}
        {ejec && data.recomendaciones.length > 0 && (
          <>
            <View wrap={false}>
              <Text style={styles.sectionTitle}>Recomendaciones Priorizadas</Text>
              <View style={styles.bullet}><Text style={styles.bulletDot}>›</Text><Text style={styles.bulletText}>{data.recomendaciones[0]}</Text></View>
            </View>
            {data.recomendaciones.slice(1, -1).map((h, i) => (
              <View key={i} style={styles.bullet} wrap={false}><Text style={styles.bulletDot}>›</Text><Text style={styles.bulletText}>{h}</Text></View>
            ))}
            {/* El último bullet se agrupa con "Generado por" para que el bloque de firma nunca quede solo en su propia página. */}
            <View wrap={false}>
              {data.recomendaciones.length > 1 && (
                <View style={styles.bullet}><Text style={styles.bulletDot}>›</Text><Text style={styles.bulletText}>{data.recomendaciones[data.recomendaciones.length - 1]}</Text></View>
              )}
              {ejec && data.responsable && (
                <View style={{ marginTop: 14, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: COL.border }}>
                  <Text style={{ fontSize: 9, color: COL.muted, textTransform: "uppercase", letterSpacing: 1 }}>Generado por</Text>
                  <Text style={{ fontSize: 11, fontFamily: FONT_BOLD, marginTop: 2 }}>{data.responsable}</Text>
                  {data.responsable_cargo && (
                    <Text style={{ fontSize: 10, color: COL.muted }}>{data.responsable_cargo}</Text>
                  )}
                </View>
              )}
            </View>
          </>
        )}
        {ejec && data.recomendaciones.length === 0 && data.responsable && (
          <View wrap={false} style={{ marginTop: 14, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: COL.border }}>
            <Text style={{ fontSize: 9, color: COL.muted, textTransform: "uppercase", letterSpacing: 1 }}>Generado por</Text>
            <Text style={{ fontSize: 11, fontFamily: FONT_BOLD, marginTop: 2 }}>{data.responsable}</Text>
            {data.responsable_cargo && (
              <Text style={{ fontSize: 10, color: COL.muted }}>{data.responsable_cargo}</Text>
            )}
          </View>
        )}
        <PageFooter data={data} />
      </Page>

      <Page size="A4" style={styles.page}>
        <PageHeader data={data} pageName="Detalle de Trabajos" />
        <Text style={styles.pageTitle}>Detalle de Trabajos del Periodo</Text>
        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.th, { width: "24%" }]}>Folio</Text>
            <Text style={[styles.th, { width: "26%" }]}>Servicio</Text>
            <Text style={[styles.th, { width: "14%" }]}>Fecha</Text>
            <Text style={[styles.th, { width: "14%" }]}>Estado</Text>
            <Text style={[styles.th, { width: "22%" }]}>Técnico</Text>
          </View>
          {data.trabajos.length === 0 ? (
            <View style={styles.trLast}><Text style={[styles.td, { width: "100%", color: COL.muted, fontFamily: FONT_OBL }]}>Sin trabajos registrados en este periodo.</Text></View>
          ) : data.trabajos.map((t, i) => (
            <View key={i} style={i === data.trabajos.length - 1 ? styles.trLast : styles.tr} wrap={false}>
              <Text style={[styles.td, { width: "24%", fontFamily: "Courier", fontSize: 7.5 }]}>{t.folio}</Text>
              <Text style={[styles.td, { width: "26%" }]}>{t.servicio}</Text>
              <Text style={[styles.td, { width: "14%" }]}>{t.fecha}</Text>
              <Text style={[styles.td, { width: "14%", color: estadoColor(t.estado), fontFamily: FONT_BOLD }]}>{estadoTexto(t.estado)}</Text>
              <Text style={[styles.td, { width: "22%", color: COL.muted }]}>{t.tecnico ?? "—"}</Text>
            </View>
          ))}
        </View>
        {ejec && ((data.resumen_por_planta && data.resumen_por_planta.length > 0) || (data.resumen_por_servicio && data.resumen_por_servicio.length > 0)) && (
          <>
            {data.resumen_por_planta && data.resumen_por_planta.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Resumen por Planta</Text>
                <View style={styles.table}>
                  <View style={styles.tr}>
                    <Text style={[styles.th, { width: "32%" }]}>Planta</Text>
                    <Text style={[styles.th, { width: "16%" }]}>Trabajos</Text>
                    <Text style={[styles.th, { width: "18%" }]}>Completados</Text>
                    <Text style={[styles.th, { width: "34%" }]}>Servicios</Text>
                  </View>
                  {data.resumen_por_planta.map((p, i, arr) => (
                    <View key={i} style={i === arr.length - 1 ? styles.trLast : styles.tr} wrap={false}>
                      <Text style={[styles.td, { width: "32%" }]}>{p.planta}</Text>
                      <Text style={[styles.td, { width: "16%" }]}>{p.total}</Text>
                      <Text style={[styles.td, { width: "18%" }]}>{p.completados}</Text>
                      <Text style={[styles.td, { width: "34%", color: COL.muted }]}>{p.servicios}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
            {data.resumen_por_servicio && data.resumen_por_servicio.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Resumen por Servicio / Equipo</Text>
                <View style={styles.table}>
                  <View style={styles.tr}>
                    <Text style={[styles.th, { width: "60%" }]}>Servicio</Text>
                    <Text style={[styles.th, { width: "20%" }]}>Trabajos</Text>
                    <Text style={[styles.th, { width: "20%" }]}>Completados</Text>
                  </View>
                  {data.resumen_por_servicio.map((s, i, arr) => (
                    <View key={i} style={i === arr.length - 1 ? styles.trLast : styles.tr} wrap={false}>
                      <Text style={[styles.td, { width: "60%" }]}>{s.servicio}</Text>
                      <Text style={[styles.td, { width: "20%" }]}>{s.total}</Text>
                      <Text style={[styles.td, { width: "20%" }]}>{s.completados}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
        {!ejec && data.trabajos.some((t) => t.notas) && (() => {
          const notas = data.trabajos.filter((t) => t.notas);
          return (
            <>
              <View wrap={false}>
                <Text style={styles.sectionTitle}>Notas de Campo</Text>
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 9, fontFamily: FONT_BOLD }}>{notas[0].folio} · {notas[0].servicio}</Text>
                  <Text style={{ fontSize: 9, color: "#1f2937", textAlign: "justify" }}>{notas[0].notas}</Text>
                </View>
              </View>
              {notas.slice(1).map((t, i) => (
                <View key={i} style={{ marginBottom: 6 }} wrap={false}>
                  <Text style={{ fontSize: 9, fontFamily: FONT_BOLD }}>{t.folio} · {t.servicio}</Text>
                  <Text style={{ fontSize: 9, color: "#1f2937", textAlign: "justify" }}>{t.notas}</Text>
                </View>
              ))}
            </>
          );
        })()}
        {data.reportes_diarios && data.reportes_diarios.length > 0 && (
          <>
            <View wrap={false}>
              <Text style={styles.sectionTitle}>Detalle diario de campo</Text>
              <Text style={{ fontSize: 8.5, color: COL.muted, marginBottom: 6, fontFamily: FONT_OBL }}>
                Registro operativo por día: paneles limpiados, potencia recuperada y parámetros de calidad de limpieza (TDS, ángulo, presión).
              </Text>
              <View style={styles.table}>
                <View style={styles.tr}>
                  <Text style={[styles.th, { width: "12%" }]}>Fecha</Text>
                  <Text style={[styles.th, { width: "16%" }]}>Folio</Text>
                  <Text style={[styles.th, { width: "10%" }]}>Paneles</Text>
                  <Text style={[styles.th, { width: "10%" }]}>W/panel</Text>
                  <Text style={[styles.th, { width: "12%" }]}>W totales</Text>
                  <Text style={[styles.th, { width: "10%" }]}>TDS (ppm)</Text>
                  <Text style={[styles.th, { width: "10%" }]}>Ángulo (°)</Text>
                  <Text style={[styles.th, { width: "10%" }]}>Presión (PSI)</Text>
                  <Text style={[styles.th, { width: "10%" }]}>Horas</Text>
                </View>
                {data.reportes_diarios.map((d, i, arr) => (
                  <View key={i} style={i === arr.length - 1 ? styles.trLast : styles.tr} wrap={false}>
                    <Text style={[styles.td, { width: "12%" }]}>{d.fecha}</Text>
                    <Text style={[styles.td, { width: "16%", fontFamily: "Courier", fontSize: 7.5 }]}>{d.folio ?? "—"}</Text>
                    <Text style={[styles.td, { width: "10%" }]}>{d.paneles_limpiados ?? "—"}</Text>
                    <Text style={[styles.td, { width: "10%" }]}>{d.watts_panel ?? "—"}</Text>
                    <Text style={[styles.td, { width: "12%" }]}>{d.watts_totales ?? "—"}</Text>
                    <Text style={[styles.td, { width: "10%" }]}>{d.tds_ppm ?? "—"}</Text>
                    <Text style={[styles.td, { width: "10%" }]}>{d.angulo_inclinacion ?? "—"}</Text>
                    <Text style={[styles.td, { width: "10%" }]}>{d.presion_agua_psi ?? "—"}</Text>
                    <Text style={[styles.td, { width: "10%" }]}>{d.horas_trabajadas ?? "—"}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
        <PageFooter data={data} />
      </Page>

      {data.evidencias.length > 0 && (() => {
        // Ordenamos por categoría (ANTES → DURANTE → DESPUÉS → ANOMALÍAS)
        // y dentro de cada categoría por orientación (apaisadas primero)
        // para mantener la grilla uniforme.
        const catOrden: Record<string, number> = {
          antes: 0, durante: 1, despues: 2, "después": 2, anomalia: 3, anomalía: 3, mediciones: 4,
        };
        const ordenadas = [...data.evidencias].sort((a, b) => {
          const ca = catOrden[String(a.categoria ?? "").toLowerCase()] ?? 9;
          const cb = catOrden[String(b.categoria ?? "").toLowerCase()] ?? 9;
          if (ca !== cb) return ca - cb;
          const ar = (a.aspect ?? 1) >= 1 ? 0 : 1;
          const br = (b.aspect ?? 1) >= 1 ? 0 : 1;
          return ar - br;
        });
        return (
          <Page size="A4" style={styles.page} wrap>
            <PageHeader data={data} pageName="Evidencias" />
            <Text style={styles.pageTitle}>Evidencias Fotográficas</Text>
            <View style={styles.pageTitleRule} />
            <View style={styles.evidGrid}>
              {ordenadas.map((e, i) => {
                const isPortrait = (e.aspect ?? 1) < 0.95;
                return (
                  <View key={i} style={styles.evidTile} wrap={false}>
                    <View style={styles.evidFrame}>
                      <Image
                        src={e.dataUrl}
                        style={isPortrait ? styles.evidImgPortrait : styles.evidImgLandscape}
                      />
                    </View>
                    <Text style={styles.evidCaption}>
                      {(() => {
                        const c = String(e.categoria ?? "durante").toLowerCase();
                        const leyenda =
                          c === "antes" ? "Fotografía ANTES DE LIMPIEZA" :
                          c === "durante" ? "Fotografía DURANTE LIMPIEZA" :
                          c === "despues" || c === "después" ? "Fotografía DESPUÉS DE LIMPIEZA" :
                          c === "anomalia" || c === "anomalía" ? "Fotografía HALLAZGO O ANOMALÍA" :
                          c === "mediciones" ? "Fotografía MEDICIONES OPERATIVAS" :
                          "Fotografía";
                        return `${leyenda} — ${e.trabajo}`;
                      })()}
                    </Text>
                  </View>
                );
              })}
            </View>
            <PageFooter data={data} />
          </Page>
        );
      })()}

      <Page size="A4" style={styles.page} wrap>
        <PageHeader data={data} pageName={ejec ? "Cierre y Cumplimiento" : "Cumplimiento Documental"} />
        <Text style={styles.pageTitle}>{ejec ? "Cierre, Política Documental y Cumplimiento" : "Política Documental y Cumplimiento"}</Text>

        {ejec && (
          <Text style={styles.paragraph}>
            El presente reporte fue elaborado a partir de información operativa real registrada en la plataforma EA SERVICE AND CONSULTING durante el periodo indicado. Los hallazgos, indicadores y recomendaciones se sustentan en los registros de trabajos, mantenimientos, evidencias y reportes técnicos disponibles.
          </Text>
        )}


        

        <View style={{ marginTop: 10, padding: 8, borderWidth: 0.5, borderColor: COL.border, borderRadius: 3, backgroundColor: COL.panel }}>
          <Text style={{ fontSize: 8.5, fontFamily: FONT_BOLD, color: COL.bg, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Control del documento</Text>
          <View style={{ flexDirection: "column" }}>
            <View style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={{ fontSize: 7.5, color: COL.muted, width: 80 }}>Identificador</Text>
              <Text style={{ fontSize: 7.5, fontFamily: "Courier", color: COL.text, flex: 1 }}>{(data.documento_id ?? "").toUpperCase() || "—"}</Text>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={{ fontSize: 7.5, color: COL.muted, width: 80 }}>Código</Text>
              <Text style={{ fontSize: 7.5, fontFamily: "Courier", color: COL.text, flex: 1 }}>{data.documento_codigo ?? "REP"} v{data.documento_version ?? "1.0"}</Text>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={{ fontSize: 7.5, color: COL.muted, width: 80 }}>Clasificación</Text>
              <Text style={{ fontSize: 7.5, color: COL.text, flex: 1 }}>{data.documento_clasificacion ?? "Uso interno"}</Text>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={{ fontSize: 7.5, color: COL.muted, width: 80 }}>Integridad</Text>
              <Text style={{ fontSize: 7.5, fontFamily: "Courier", color: COL.text, flex: 1 }}>SHA-256 {data.documento_hash ? data.documento_hash.slice(0, 24) + "…" : "—"}</Text>
            </View>
          </View>
        </View>

        {ejec && (
          <View style={{ marginTop: 40, flexDirection: "row", justifyContent: "space-between" }} wrap={false}>
            <View style={{ width: "45%" }}>
              <View style={{ borderTopWidth: 1, borderTopColor: COL.text, paddingTop: 6 }}>
                <Text style={{ fontSize: 10, fontFamily: FONT_BOLD }}>{data.responsable ?? "Equipo EA SERVICE AND CONSULTING"}</Text>
                <Text style={{ fontSize: 9, color: COL.muted }}>{data.responsable_cargo ?? "Responsable Operativo"}</Text>
              </View>
            </View>
            <View style={{ width: "45%" }}>
              <View style={{ borderTopWidth: 1, borderTopColor: COL.text, paddingTop: 6 }}>
                <Text style={{ fontSize: 10, fontFamily: FONT_BOLD }}>{data.cliente}</Text>
                <Text style={{ fontSize: 9, color: COL.muted }}>Recepción Cliente</Text>
              </View>
            </View>
          </View>
        )}
        <PageFooter data={data} />
      </Page>
    </Document>
  );
}