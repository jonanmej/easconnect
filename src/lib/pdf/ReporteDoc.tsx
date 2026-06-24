import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

const COL = {
  bg: "#0F172A",
  primary: "#F59E0B",
  primarySoft: "#FEF3C7",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  panel: "#f8fafc",
  ok: "#10b981",
  danger: "#ef4444",
};

const styles = StyleSheet.create({
  // Página tamaño carta (US Letter) — márgenes pensados para perforar y anexar a AMPO:
  // izq. 85pt (~3 cm) para folio de perforación, der. 40pt, sup. 54pt, inf. 64pt.
  page: { paddingTop: 54, paddingBottom: 64, paddingLeft: 85, paddingRight: 40, fontSize: 10, color: COL.text, fontFamily: "Helvetica" },
  // Portada
  cover: { padding: 0 },
  coverBar: { position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: COL.primary },
  coverInner: { paddingTop: 90, paddingLeft: 85, paddingRight: 56 },
  brand: { flexDirection: "row", alignItems: "center", marginBottom: 80 },
  logoBox: { width: 28, height: 28, backgroundColor: COL.primary, marginRight: 10 },
  brandText: { fontSize: 16, fontWeight: 700, letterSpacing: 1 },
  coverTag: { fontSize: 9, color: COL.muted, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" },
  coverTitle: { fontSize: 32, fontWeight: 700, lineHeight: 1.2, marginBottom: 16, maxWidth: 420 },
  coverMeta: { marginTop: 60, borderTopWidth: 1, borderTopColor: COL.border, paddingTop: 18 },
  metaRow: { flexDirection: "row", marginBottom: 6 },
  metaLabel: { width: 110, fontSize: 9, color: COL.muted, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { flex: 1, fontSize: 11, fontWeight: 600 },
  coverFooter: { position: "absolute", bottom: 48, left: 85, right: 56, flexDirection: "row", justifyContent: "space-between", fontSize: 9, color: COL.muted },

  // Contenido
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COL.border },
  headerTitle: { fontSize: 9, color: COL.muted, textTransform: "uppercase", letterSpacing: 1 },
  pageTitle: { fontSize: 18, fontWeight: 700, marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 16, marginBottom: 8, color: COL.text, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: COL.border },
  paragraph: { fontSize: 10, lineHeight: 1.55, marginBottom: 8, color: "#1f2937", textAlign: "justify" },
  bullet: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 10, fontSize: 10, color: COL.primary, fontWeight: 700 },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.5, textAlign: "justify" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  kpiCard: { width: "48%", padding: 10, borderWidth: 1, borderColor: COL.border, borderRadius: 4, backgroundColor: COL.panel },
  kpiLabel: { fontSize: 8, color: COL.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  kpiValue: { fontSize: 16, fontWeight: 700, color: COL.text },
  table: { borderWidth: 1, borderColor: COL.border, borderRadius: 3, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  trLast: { flexDirection: "row" },
  th: { padding: 6, fontSize: 8, fontWeight: 700, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase", letterSpacing: 0.5 },
  td: { padding: 6, fontSize: 9 },
  pageFooter: { position: "absolute", bottom: 24, left: 85, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: COL.muted, borderTopWidth: 0.5, borderTopColor: COL.border, paddingTop: 6 },
  evidGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  evidImg: { width: "48%", height: 200, objectFit: "cover", borderRadius: 3 },
  badge: { fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start", color: "#fff", marginBottom: 4 },
  // Gráficas
  chartBlock: { marginBottom: 14, padding: 10, borderWidth: 0.5, borderColor: COL.border, borderRadius: 3, backgroundColor: COL.panel },
  chartTitle: { fontSize: 10, fontWeight: 700, marginBottom: 2 },
  chartCaption: { fontSize: 8, color: COL.muted, marginBottom: 8 },
  chartRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  chartLabel: { width: 110, fontSize: 9, color: COL.text },
  chartTrack: { flex: 1, height: 10, backgroundColor: "#fff", borderWidth: 0.5, borderColor: COL.border, borderRadius: 2, overflow: "hidden" },
  chartBar: { height: "100%", backgroundColor: COL.primary },
  chartValue: { width: 60, textAlign: "right", fontSize: 9, color: COL.text, fontFamily: "Courier" },
  chartSource: { fontSize: 7, color: COL.muted, marginTop: 6, fontStyle: "italic" },
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
  evidencias: { trabajo: string; descripcion?: string | null; dataUrl: string }[];
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
  retencion?: string;
  modo: "ejecutivo" | "interno";
};

function PageHeader({ data, pageName }: { data: ReporteData; pageName: string }) {
  return (
    <View style={styles.header} fixed>
      <View>
        <Text style={styles.headerTitle}>EA SERVICE AND CONSULTING · {data.modo === "ejecutivo" ? "Reporte Ejecutivo" : "Reporte Interno"} · {pageName}</Text>
        <Text style={[styles.headerTitle, { marginTop: 2 }]}>
          Doc. {data.documento_codigo ?? "REP"} · v{data.documento_version ?? "1.0"} · {data.documento_clasificacion ?? "Uso interno"} · ISO 9001:2015 · ISO 15489-1:2016
        </Text>
      </View>
      <Text style={styles.headerTitle}>{data.cliente} · {data.periodo}</Text>
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
      <View style={{ flexDirection: "column" }}>
        <Text>ID Doc: {docId}{hash ? ` · SHA-256 ${hash}…` : ""}</Text>
        <Text>{data.retencion ?? "Retención: 5 años · ISO 9001:2015 §7.5 · ISO 15489-1:2016 §5–9"} · Responsable: {responsable}</Text>
      </View>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function estadoColor(s: string) {
  if (s === "completado") return COL.ok;
  if (s === "cancelado") return COL.danger;
  if (s === "en_progreso") return COL.primary;
  return COL.muted;
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
  const keywords = [data.cliente, data.planta, data.periodo, "ISO 9001:2015", "ISO 15489-1:2016", ejec ? "Ejecutivo" : "Interno"]
    .filter(Boolean).join(", ");
  return (
    <Document
      title={data.titulo}
      author={data.responsable ?? "EA SERVICE AND CONSULTING"}
      subject={`Reporte ${ejec ? "ejecutivo" : "interno"} · ${data.cliente} · ${data.periodo}`}
      keywords={keywords}
      creator="EA Service Connect"
      producer="EA Service Connect — Cumplimiento ISO 9001:2015 e ISO 15489-1:2016"
      creationDate={fechaEmision}
      modificationDate={fechaEmision}
    >
      {ejec && (
        <Page size="LETTER" style={styles.cover}>
          <View style={styles.coverBar} />
          <View style={styles.coverInner}>
            <View style={styles.brand}>
              <View style={styles.logoBox} />
              <Text style={styles.brandText}>EA SERVICE AND CONSULTING</Text>
            </View>
            <Text style={styles.coverTag}>Reporte Ejecutivo · {data.periodo}</Text>
            <Text style={styles.coverTitle}>{data.titulo}</Text>
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
              <View style={styles.metaRow}><Text style={styles.metaLabel}>Clasificación</Text><Text style={styles.metaValue}>{data.documento_clasificacion ?? "Uso interno"} · ISO 9001:2015 · ISO 15489-1:2016</Text></View>
            </View>
          </View>
          <View style={styles.coverFooter} fixed>
            <Text>Confidencial · Uso del Cliente</Text>
            <Text>SGC ISO 9001:2015 · Gestión Documental ISO 15489-1:2016</Text>
          </View>
        </Page>
      )}

      <Page size="LETTER" style={styles.page}>
        <PageHeader data={data} pageName={ejec ? "Resumen Ejecutivo" : "Resumen Interno"} />
        <Text style={styles.pageTitle}>{ejec ? "Resumen Ejecutivo" : "Reporte Interno"}</Text>
        {ejec && data.resumen && <Text style={styles.paragraph}>{data.resumen}</Text>}

        <Text style={styles.sectionTitle}>Indicadores Clave</Text>
        <View style={styles.kpiRow}>
          {data.kpis.map((k, i) => (
            <View key={i} style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>{k.label}</Text>
              <Text style={styles.kpiValue}>{k.value}</Text>
            </View>
          ))}
        </View>

        {data.graficas && data.graficas.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Análisis Gráfico de Datos</Text>
            {data.graficas.map((g, i) => <Grafica key={i} g={g} />)}
          </>
        )}

        {ejec && data.hallazgos.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Hallazgos</Text>
            {data.hallazgos.map((h, i) => (
              <View key={i} style={styles.bullet}><Text style={styles.bulletDot}>›</Text><Text style={styles.bulletText}>{h}</Text></View>
            ))}
          </>
        )}
        {ejec && data.recomendaciones.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recomendaciones Priorizadas</Text>
            {data.recomendaciones.map((h, i) => (
              <View key={i} style={styles.bullet}><Text style={styles.bulletDot}>›</Text><Text style={styles.bulletText}>{h}</Text></View>
            ))}
          </>
        )}
        {ejec && data.responsable && (
          <View style={{ marginTop: 14, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: COL.border }}>
            <Text style={{ fontSize: 9, color: COL.muted, textTransform: "uppercase", letterSpacing: 1 }}>Generado por</Text>
            <Text style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>{data.responsable}</Text>
            {data.responsable_cargo && (
              <Text style={{ fontSize: 10, color: COL.muted }}>{data.responsable_cargo}</Text>
            )}
          </View>
        )}
        <PageFooter data={data} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader data={data} pageName="Detalle de Trabajos" />
        <Text style={styles.pageTitle}>Detalle de Trabajos del Periodo</Text>
        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.th, { width: "14%" }]}>Folio</Text>
            <Text style={[styles.th, { width: "30%" }]}>Servicio</Text>
            <Text style={[styles.th, { width: "18%" }]}>Fecha</Text>
            <Text style={[styles.th, { width: "16%" }]}>Estado</Text>
            <Text style={[styles.th, { width: "22%" }]}>Técnico</Text>
          </View>
          {data.trabajos.length === 0 ? (
            <View style={styles.trLast}><Text style={[styles.td, { width: "100%", color: COL.muted, fontStyle: "italic" }]}>Sin trabajos registrados en este periodo.</Text></View>
          ) : data.trabajos.map((t, i) => (
            <View key={i} style={i === data.trabajos.length - 1 ? styles.trLast : styles.tr}>
              <Text style={[styles.td, { width: "14%", fontFamily: "Courier" }]}>{t.folio}</Text>
              <Text style={[styles.td, { width: "30%" }]}>{t.servicio}</Text>
              <Text style={[styles.td, { width: "18%" }]}>{t.fecha}</Text>
              <Text style={[styles.td, { width: "16%", color: estadoColor(t.estado), fontWeight: 700 }]}>{t.estado}</Text>
              <Text style={[styles.td, { width: "22%", color: COL.muted }]}>{t.tecnico ?? "—"}</Text>
            </View>
          ))}
        </View>
        {!ejec && data.trabajos.some((t) => t.notas) && (
          <>
            <Text style={styles.sectionTitle}>Notas de Campo</Text>
            {data.trabajos.filter((t) => t.notas).map((t, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 9, fontWeight: 700 }}>{t.folio} · {t.servicio}</Text>
                <Text style={{ fontSize: 9, color: "#1f2937", textAlign: "justify" }}>{t.notas}</Text>
              </View>
            ))}
          </>
        )}
        <PageFooter data={data} />
      </Page>

      {data.evidencias.length > 0 && (
        <Page size="LETTER" style={styles.page} wrap>
          <PageHeader data={data} pageName="Evidencias" />
          <Text style={styles.pageTitle}>Evidencias Fotográficas</Text>
          <View style={styles.evidGrid}>
            {data.evidencias.slice(0, ejec ? 8 : 30).map((e, i) => (
              <View key={i} style={{ width: "48%", marginBottom: 10 }} wrap={false}>
                <Image src={e.dataUrl} style={styles.evidImg} />
                <Text style={{ fontSize: 8, color: COL.muted, marginTop: 3 }}>{e.trabajo}{e.descripcion ? ` — ${e.descripcion}` : ""}</Text>
              </View>
            ))}
          </View>
          <PageFooter data={data} />
        </Page>
      )}

      {ejec && (
        <Page size="LETTER" style={styles.page}>
          <PageHeader data={data} pageName="Cierre" />
          <Text style={styles.pageTitle}>Cierre y Firma</Text>
          <Text style={styles.paragraph}>
            El presente reporte fue elaborado a partir de información operativa real registrada en la plataforma EA SERVICE AND CONSULTING durante el periodo indicado. Los hallazgos, indicadores y recomendaciones se sustentan en los registros de trabajos, mantenimientos, evidencias y reportes técnicos disponibles, en conformidad con el Sistema de Gestión de la Calidad bajo ISO 9001:2015 (cláusulas 7.5 Información documentada, 8.5 Producción y prestación del servicio, 9.1 Seguimiento, medición, análisis y evaluación, y 10 Mejora).
          </Text>
          <Text style={styles.paragraph}>
            Asimismo, este documento es gestionado conforme a ISO 15489-1:2016 (Información y documentación — Gestión de documentos), garantizando los atributos de autenticidad, fiabilidad, integridad y disponibilidad mediante identificador único, código y versión controlados, sello de tiempo, firma del responsable, huella criptográfica SHA-256 y plan de retención documental.
          </Text>
          <Text style={[styles.paragraph, { fontSize: 9, color: COL.muted }]}>
            Documento controlado · ISO 9001:2015 §7.5 · ISO 15489-1:2016 §5–9. Identificador único: {(data.documento_id ?? "").toUpperCase() || "—"}.
            Código: {data.documento_codigo ?? "REP"} v{data.documento_version ?? "1.0"}. Clasificación: {data.documento_clasificacion ?? "Uso interno"}.
            Integridad: SHA-256 {data.documento_hash ?? "—"}. {data.retencion ?? "Retención: 5 años."}
          </Text>
          <View style={{ marginTop: 80, flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ width: "45%" }}>
              <View style={{ borderTopWidth: 1, borderTopColor: COL.text, paddingTop: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: 700 }}>{data.responsable ?? "Equipo EA SERVICE AND CONSULTING"}</Text>
                <Text style={{ fontSize: 9, color: COL.muted }}>{data.responsable_cargo ?? "Responsable Operativo"}</Text>
              </View>
            </View>
            <View style={{ width: "45%" }}>
              <View style={{ borderTopWidth: 1, borderTopColor: COL.text, paddingTop: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: 700 }}>{data.cliente}</Text>
                <Text style={{ fontSize: 9, color: COL.muted }}>Recepción Cliente</Text>
              </View>
            </View>
          </View>
          <PageFooter data={data} />
        </Page>
      )}
    </Document>
  );
}