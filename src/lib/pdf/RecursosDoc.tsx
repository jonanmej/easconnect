import { Document, Page, Text, View, StyleSheet, Font, Svg, Path, G, Defs, LinearGradient, Stop } from "@react-pdf/renderer";

Font.registerHyphenationCallback((word) => [word]);

const COL = {
  bg: "#2E4A87",
  primary: "#5B7FBF",
  primaryDeep: "#3B5EA8",
  text: "#1f2937",
  muted: "#64748b",
  border: "#e2e8f0",
  panel: "#f8fafc",
  ok: "#10b981",
  danger: "#ef4444",
};
const FONT_REG = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const FONT_OBL = "Helvetica-Oblique";

function EALogoMark({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 150">
      <Defs>
        <LinearGradient id="ea-grad-rec" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={COL.primary} stopOpacity={0.95} />
          <Stop offset="100%" stopColor={COL.primary} stopOpacity={0.7} />
        </LinearGradient>
      </Defs>
      <G>
        <Path d="M40 10 L190 75 L110 75 Z" fill={COL.primary} fillOpacity={0.55} />
        <Path d="M40 10 L40 140 L110 75 Z" fill={COL.primary} fillOpacity={0.55} />
        <Path d="M110 75 L190 75 L40 140 Z" fill="url(#ea-grad-rec)" />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 64, paddingBottom: 70, paddingLeft: 85, paddingRight: 45, fontSize: 10, color: COL.text, fontFamily: FONT_REG },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: COL.primary },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 12 },
  headerLeftText: { flex: 1, marginLeft: 8 },
  headerRight: { width: 160, alignItems: "flex-end" },
  headerTitle: { fontSize: 7.5, color: COL.bg, textTransform: "uppercase", letterSpacing: 1, fontFamily: FONT_BOLD },
  headerSub: { fontSize: 7, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 },
  headerRightTop: { fontSize: 8, color: COL.text, fontFamily: FONT_BOLD, textAlign: "right" },
  headerRightBot: { fontSize: 7.5, color: COL.muted, textAlign: "right", marginTop: 2, letterSpacing: 0.5 },
  pageTitle: { fontSize: 17, fontFamily: FONT_BOLD, marginBottom: 12, color: COL.bg },
  sectionTitle: { fontSize: 11.5, fontFamily: FONT_BOLD, marginTop: 14, marginBottom: 8, color: COL.bg, paddingBottom: 4, borderBottomWidth: 0.75, borderBottomColor: COL.primary },
  metaGrid: { marginBottom: 10, borderWidth: 0.5, borderColor: COL.border, borderRadius: 2, padding: 10 },
  metaRow: { flexDirection: "row", marginBottom: 5, alignItems: "flex-start" },
  metaRowLast: { flexDirection: "row", alignItems: "flex-start" },
  metaLabel: { width: 130, fontSize: 8.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 1, paddingRight: 6 },
  metaValue: { flex: 1, fontSize: 10, fontFamily: FONT_BOLD, color: COL.text },
  metaHalf: { width: "50%", flexDirection: "row", alignItems: "flex-start" },
  table: { borderWidth: 1, borderColor: COL.border, borderRadius: 3, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  th: { padding: 6, fontSize: 8, fontFamily: FONT_BOLD, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase" },
  td: { padding: 5, fontSize: 8.5, lineHeight: 1.35 },
  pageFooter: { position: "absolute", bottom: 24, left: 85, right: 45, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 6 },
  badge: { fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start", color: "#fff", marginBottom: 4 },
  signRow: { flexDirection: "row", marginTop: 40, gap: 20 },
  signCol: { flex: 1 },
  signLine: { borderTopWidth: 0.75, borderTopColor: COL.text, paddingTop: 4, fontSize: 9, color: COL.muted, textAlign: "center" },
});

export type RecursosData = {
  folio: string;
  cliente: string;
  planta: string;
  servicio: string;
  fecha: string;
  estado: string;
  tecnico?: string | null;
  notas?: string | null;
  trabajo_a_realizar?: string | null;
  fecha_entrada?: string | null;
  fecha_salida?: string | null;
  elaborado_por?: string | null;
  recursos: {
    categoria: string;
    descripcion: string;
    cantidad: number;
    unidad?: string | null;
    entregado: boolean;
    devuelto: boolean;
    notas?: string | null;
  }[];
  emitido_at: string;
  documento_id?: string;
  documento_codigo?: string;
  documento_version?: string;
  documento_clasificacion?: string;
  documento_hash?: string;
  responsable?: string | null;
  responsable_cargo?: string | null;
};

function PageHeader({ data }: { data: RecursosData }) {
  const codigo = `${data.documento_codigo ?? "EA-REC"} · v${data.documento_version ?? "1.0"}`;
  const clasif = data.documento_clasificacion ?? "Uso interno";
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        <EALogoMark size={22} />
        <View style={styles.headerLeftText}>
          <Text style={styles.headerTitle}>EA SERVICE AND CONSULTING</Text>
          <Text style={styles.headerSub}>Checklist de Recursos · OT {data.folio}</Text>
          <Text style={styles.headerSub}>ISO 9001:2015 · §7.1 / §8.5</Text>
        </View>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerRightTop}>{data.cliente}</Text>
        <Text style={styles.headerRightBot}>{data.planta}</Text>
        <Text style={styles.headerRightBot}>{codigo}</Text>
        <Text style={styles.headerRightBot}>{clasif}</Text>
      </View>
    </View>
  );
}

function PageFooter({ data }: { data: RecursosData }) {
  const responsable = data.responsable
    ? `${data.responsable}${data.responsable_cargo ? ` · ${data.responsable_cargo}` : ""}`
    : "Equipo EA Service and Consulting";
  const docId = data.documento_id ? data.documento_id.slice(0, 8).toUpperCase() : "—";
  const hash = data.documento_hash ? data.documento_hash.slice(0, 12) : null;
  return (
    <View style={styles.pageFooter} fixed>
      <View style={{ flexDirection: "column" }}>
        <Text>ID Doc: {docId}{hash ? ` · SHA-256 ${hash}…` : ""}</Text>
        <Text>Retención: 5 años · ISO 9001:2015 §7.5 · Responsable: {responsable}</Text>
      </View>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

const SECCIONES: { key: string; titulo: string }[] = [
  { key: "equipo", titulo: "EQUIPO" },
  { key: "herramienta", titulo: "HERRAMIENTA" },
  { key: "repuesto", titulo: "REPUESTOS" },
  { key: "epp", titulo: "EQUIPO DE PROTECCIÓN PERSONAL" },
  { key: "insumo", titulo: "INSUMOS" },
  { key: "otro", titulo: "OTROS" },
];

export function RecursosDoc({ data }: { data: RecursosData }) {
  const fecha = new Date();
  return (
    <Document
      title={`Checklist de recursos · ${data.folio}`}
      author={data.responsable ?? "EA SERVICE AND CONSULTING"}
      subject={`Checklist de recursos · ${data.cliente} · ${data.planta}`}
      keywords={[data.cliente, data.planta, data.folio, "Recursos", "ISO 9001:2015"].join(", ")}
      creator="EA Service Connect"
      producer="EA Service Connect — Cumplimiento ISO 9001:2015"
      creationDate={fecha}
      modificationDate={fecha}
    >
      <Page size="LETTER" style={styles.page}>
        <PageHeader data={data} />
        <Text style={styles.pageTitle}>Listado de Equipos, Herramientas y Repuestos</Text>
        <Text style={{ fontSize: 10, color: COL.muted, marginBottom: 10 }}>Cliente: {data.cliente}</Text>

        <View style={{ marginBottom: 6 }}>
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Cliente</Text><Text style={styles.metaValue}>{data.cliente}</Text></View>
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Planta</Text><Text style={styles.metaValue}>{data.planta}</Text></View>
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Trabajo a realizar</Text><Text style={styles.metaValue}>{data.trabajo_a_realizar ?? data.servicio}</Text></View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Fecha de entrada</Text>
            <Text style={[styles.metaValue, { flex: 0, width: 140 }]}>{data.fecha_entrada ?? data.fecha}</Text>
            <Text style={styles.metaLabel}>Fecha de salida</Text>
            <Text style={styles.metaValue}>{data.fecha_salida ?? data.fecha}</Text>
          </View>
          <View style={styles.metaRow}><Text style={styles.metaLabel}>OT</Text><Text style={styles.metaValue}>{data.folio}</Text></View>
        </View>

        {SECCIONES.map(({ key, titulo }) => {
          const items = data.recursos.filter((r) => r.categoria === key);
          if (items.length === 0) return null;
          return (
            <View key={key} wrap={false}>
              <Text style={styles.sectionTitle}>{titulo}</Text>
              <View style={styles.table}>
                <View style={styles.tr}>
                  <Text style={[styles.th, { width: "8%", textAlign: "center" }]}>#</Text>
                  <Text style={[styles.th, { width: "72%" }]}>Artículo</Text>
                  <Text style={[styles.th, { width: "20%", textAlign: "center" }]}>Cantidad</Text>
                </View>
                {items.map((r, i) => (
                  <View key={i} style={styles.tr} wrap={false}>
                    <Text style={[styles.td, { width: "8%", textAlign: "center" }]}>{i + 1}</Text>
                    <Text style={[styles.td, { width: "72%" }]}>
                      {r.descripcion}
                      {r.notas ? `\n${r.notas}` : ""}
                    </Text>
                    <Text style={[styles.td, { width: "20%", textAlign: "center", fontFamily: "Courier" }]}>
                      {r.cantidad}{r.unidad ? ` ${r.unidad}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {data.recursos.length === 0 && (
          <Text style={{ fontSize: 10, color: COL.muted, fontFamily: FONT_OBL, marginTop: 10 }}>
            Sin recursos asignados.
          </Text>
        )}

        {data.notas && (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>Notas de la OT</Text>
            <Text style={{ fontSize: 10, lineHeight: 1.5, color: COL.text }}>{data.notas}</Text>
          </View>
        )}

        <View style={{ marginTop: 30 }}>
          <Text style={{ fontSize: 10, marginBottom: 20 }}>
            <Text style={{ fontFamily: FONT_BOLD }}>Elaborado por: </Text>
            {data.elaborado_por ?? data.tecnico ?? data.responsable ?? "—"}
          </Text>
          <View style={{ width: 260 }}>
            <Text style={styles.signLine}>Firma</Text>
          </View>
        </View>

        <PageFooter data={data} />
      </Page>
    </Document>
  );
}