import { Document, Page, Text, View, StyleSheet, Image, Font } from "@react-pdf/renderer";

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
  page: { paddingTop: 48, paddingBottom: 64, paddingHorizontal: 48, fontSize: 10, color: COL.text, fontFamily: "Helvetica" },
  // Portada
  cover: { padding: 0 },
  coverBar: { position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: COL.primary },
  coverInner: { paddingTop: 90, paddingHorizontal: 56 },
  brand: { flexDirection: "row", alignItems: "center", marginBottom: 80 },
  logoBox: { width: 28, height: 28, backgroundColor: COL.primary, marginRight: 10 },
  brandText: { fontSize: 16, fontWeight: 700, letterSpacing: 1 },
  coverTag: { fontSize: 9, color: COL.muted, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" },
  coverTitle: { fontSize: 32, fontWeight: 700, lineHeight: 1.2, marginBottom: 16, maxWidth: 420 },
  coverMeta: { marginTop: 60, borderTopWidth: 1, borderTopColor: COL.border, paddingTop: 18 },
  metaRow: { flexDirection: "row", marginBottom: 6 },
  metaLabel: { width: 110, fontSize: 9, color: COL.muted, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { flex: 1, fontSize: 11, fontWeight: 600 },
  coverFooter: { position: "absolute", bottom: 48, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", fontSize: 9, color: COL.muted },

  // Contenido
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COL.border },
  headerTitle: { fontSize: 9, color: COL.muted, textTransform: "uppercase", letterSpacing: 1 },
  pageTitle: { fontSize: 18, fontWeight: 700, marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 16, marginBottom: 8, color: COL.text, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: COL.border },
  paragraph: { fontSize: 10, lineHeight: 1.55, marginBottom: 8, color: "#1f2937" },
  bullet: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 10, fontSize: 10, color: COL.primary, fontWeight: 700 },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.5 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  kpiCard: { width: "48%", padding: 10, borderWidth: 1, borderColor: COL.border, borderRadius: 4, backgroundColor: COL.panel },
  kpiLabel: { fontSize: 8, color: COL.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  kpiValue: { fontSize: 16, fontWeight: 700, color: COL.text },
  table: { borderWidth: 1, borderColor: COL.border, borderRadius: 3, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  trLast: { flexDirection: "row" },
  th: { padding: 6, fontSize: 8, fontWeight: 700, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase", letterSpacing: 0.5 },
  td: { padding: 6, fontSize: 9 },
  pageFooter: { position: "absolute", bottom: 24, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: COL.muted, borderTopWidth: 0.5, borderTopColor: COL.border, paddingTop: 6 },
  evidGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  evidImg: { width: "48%", height: 200, objectFit: "cover", borderRadius: 3 },
  badge: { fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start", color: "#fff", marginBottom: 4 },
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
  responsable?: string | null;
  modo: "ejecutivo" | "interno";
};

function PageHeader({ data, pageName }: { data: ReporteData; pageName: string }) {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.headerTitle}>SOLAROS · {data.modo === "ejecutivo" ? "Reporte Ejecutivo" : "Reporte Interno"} · {pageName}</Text>
      <Text style={styles.headerTitle}>{data.cliente} · {data.periodo}</Text>
    </View>
  );
}

function PageFooter() {
  return (
    <View style={styles.pageFooter} fixed>
      <Text>SOLAROS · Gestión Operativa</Text>
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

export function ReporteDoc({ data }: { data: ReporteData }) {
  const ejec = data.modo === "ejecutivo";
  return (
    <Document title={data.titulo} author="SOLAROS">
      {ejec && (
        <Page size="A4" style={styles.cover}>
          <View style={styles.coverBar} />
          <View style={styles.coverInner}>
            <View style={styles.brand}>
              <View style={styles.logoBox} />
              <Text style={styles.brandText}>SOLAROS</Text>
            </View>
            <Text style={styles.coverTag}>Reporte Ejecutivo · {data.periodo}</Text>
            <Text style={styles.coverTitle}>{data.titulo}</Text>
            <View style={styles.coverMeta}>
              <View style={styles.metaRow}><Text style={styles.metaLabel}>Cliente</Text><Text style={styles.metaValue}>{data.cliente}</Text></View>
              <View style={styles.metaRow}><Text style={styles.metaLabel}>Planta</Text><Text style={styles.metaValue}>{data.planta}</Text></View>
              <View style={styles.metaRow}><Text style={styles.metaLabel}>Periodo</Text><Text style={styles.metaValue}>{data.periodo}</Text></View>
              <View style={styles.metaRow}><Text style={styles.metaLabel}>Emitido</Text><Text style={styles.metaValue}>{data.emitido_at}</Text></View>
              {data.responsable && (
                <View style={styles.metaRow}><Text style={styles.metaLabel}>Responsable</Text><Text style={styles.metaValue}>{data.responsable}</Text></View>
              )}
            </View>
          </View>
          <View style={styles.coverFooter} fixed>
            <Text>Confidencial · Uso del Cliente</Text>
            <Text>{data.modelo ? `Asistido por ${data.modelo}` : ""}</Text>
          </View>
        </Page>
      )}

      <Page size="A4" style={styles.page}>
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
        <PageFooter />
      </Page>

      <Page size="A4" style={styles.page}>
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
                <Text style={{ fontSize: 9, color: "#1f2937" }}>{t.notas}</Text>
              </View>
            ))}
          </>
        )}
        <PageFooter />
      </Page>

      {data.evidencias.length > 0 && (
        <Page size="A4" style={styles.page} wrap>
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
          <PageFooter />
        </Page>
      )}

      {ejec && (
        <Page size="A4" style={styles.page}>
          <PageHeader data={data} pageName="Cierre" />
          <Text style={styles.pageTitle}>Cierre y Firma</Text>
          <Text style={styles.paragraph}>
            El presente reporte fue generado a partir de información operativa real registrada en la plataforma SOLAROS durante el periodo indicado. Los hallazgos y recomendaciones han sido elaborados con asistencia de inteligencia artificial sobre los datos provistos.
          </Text>
          <View style={{ marginTop: 80, flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ width: "45%" }}>
              <View style={{ borderTopWidth: 1, borderTopColor: COL.text, paddingTop: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: 700 }}>{data.responsable ?? "Equipo SOLAROS"}</Text>
                <Text style={{ fontSize: 9, color: COL.muted }}>Responsable Operativo</Text>
              </View>
            </View>
            <View style={{ width: "45%" }}>
              <View style={{ borderTopWidth: 1, borderTopColor: COL.text, paddingTop: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: 700 }}>{data.cliente}</Text>
                <Text style={{ fontSize: 9, color: COL.muted }}>Recepción Cliente</Text>
              </View>
            </View>
          </View>
          <PageFooter />
        </Page>
      )}
    </Document>
  );
}