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

Font.registerHyphenationCallback((word) => [word]);

const FONT_REG = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

const COL = {
  bg: "#2E4A87",
  primary: "#5B7FBF",
  primarySoft: "#DDE6F4",
  text: "#1f2937",
  muted: "#64748b",
  border: "#e2e8f0",
  panel: "#f8fafc",
  ok: "#10b981",
  danger: "#ef4444",
};

const s = StyleSheet.create({
  page: { paddingTop: 90, paddingBottom: 78, paddingLeft: 42, paddingRight: 38, fontSize: 8.5, color: COL.text, fontFamily: FONT_REG },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: COL.primary },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 },
  headerLeftText: { flex: 1 },
  headerRight: { width: 165, alignItems: "flex-end" },
  headerTitle: { fontSize: 7, color: COL.bg, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: FONT_BOLD },
  headerSub: { fontSize: 6.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 },
  headerRightTop: { fontSize: 7.5, color: COL.text, fontFamily: FONT_BOLD, textAlign: "right" },
  headerRightBot: { fontSize: 7, color: COL.muted, textAlign: "right", marginTop: 2, letterSpacing: 0.5 },
  logoEa: { height: 30, objectFit: "contain", marginRight: 8 },
  footerLogoPv: { height: 14, objectFit: "contain" },
  footerLogoCh: { height: 11, objectFit: "contain" },
  pageFooter: { position: "absolute", bottom: 22, left: 42, right: 38, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 7, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 5 },
  pageFooterLogos: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 14, fontFamily: FONT_BOLD, marginBottom: 3, color: COL.bg },
  subtitle: { fontSize: 8, color: COL.muted, marginBottom: 10 },
  titleRule: { width: 36, height: 2, backgroundColor: COL.primary, marginBottom: 12 },
  summaryRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  summaryCard: { flex: 1, padding: 8, borderWidth: 0.75, borderColor: COL.border, borderLeftWidth: 3, borderLeftColor: COL.primary, borderRadius: 3, backgroundColor: COL.panel },
  summaryLabel: { fontSize: 6.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3, fontFamily: FONT_BOLD },
  summaryValue: { fontSize: 12, fontFamily: FONT_BOLD, color: COL.bg },
  table: { borderWidth: 1, borderColor: COL.border, borderRadius: 3, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  th: { padding: 5, fontSize: 6.5, fontFamily: FONT_BOLD, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase" },
  td: { padding: 4, fontSize: 7, lineHeight: 1.3 },
  nota: { marginTop: 10, fontSize: 6.5, color: COL.muted, lineHeight: 1.4 },
});

export type JornadaFila = {
  id: string;
  fecha: string;
  colaborador: string;
  entrada: string;
  salida: string;
  almuerzo: string;
  almuerzo_min: number;
  almuerzo_excedido: boolean;
  horas_efectivas: number;
  notas?: string | null;
};

export type JornadasData = {
  desde: string;
  hasta: string;
  alcance: string;
  filas: JornadaFila[];
  total_horas: number;
  total_jornadas: number;
  total_excedidos: number;
  emitido_at: string;
  documento_id?: string;
  documento_codigo?: string;
  documento_version?: string;
  documento_clasificacion?: string;
  documento_hash?: string;
};

function PageHeader({ data }: { data: JornadasData }) {
  const codigo = `${data.documento_codigo ?? "EA-JOR"} · v${data.documento_version ?? "1.0"}`;
  const clasif = data.documento_clasificacion ?? "Uso interno";
  return (
    <View fixed style={{ position: "absolute", top: 22, left: 42, right: 38 }}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Image src={LOGO_EA()} style={s.logoEa} />
          <View style={s.headerLeftText}>
            <Text style={s.headerTitle}>EA SERVICE AND CONSULTING</Text>
            <Text style={s.headerSub}>Control de marcación de jornada laboral</Text>
          </View>
        </View>
        <View style={s.headerRight}>
          <Text style={s.headerRightTop}>{data.alcance}</Text>
          <Text style={s.headerRightBot}>Período: {data.desde} a {data.hasta}</Text>
          <Text style={s.headerRightBot}>Emitido: {data.emitido_at}</Text>
          <Text style={s.headerRightBot}>{codigo} · {clasif}</Text>
        </View>
      </View>
    </View>
  );
}

function PageFooter({ data }: { data: JornadasData }) {
  const docId = data.documento_id ? data.documento_id.slice(0, 8).toUpperCase() : "—";
  const hash = data.documento_hash ? data.documento_hash.slice(0, 12) : null;
  return (
    <View style={s.pageFooter} fixed>
      <View style={s.pageFooterLogos}>
        <Image src={LOGO_PVSTOP()} style={s.footerLogoPv} />
        <Image src={LOGO_CHEMITEK()} style={s.footerLogoCh} />
      </View>
      <View style={{ flexDirection: "column", flex: 1, paddingLeft: 12 }}>
        <Text>ID Doc: {docId}{hash ? ` · SHA-256 ${hash}…` : ""}</Text>
        <Text>Registro de asistencia · ISO 9001:2015</Text>
      </View>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function JornadasDoc({ data }: { data: JornadasData }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <PageHeader data={data} />
        <Text style={s.title}>Control de marcación de jornada</Text>
        <Text style={s.subtitle}>
          {data.alcance} · Del {data.desde} al {data.hasta}
        </Text>
        <View style={s.titleRule} />

        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Marcaciones</Text>
            <Text style={s.summaryValue}>{data.total_jornadas}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Horas efectivas</Text>
            <Text style={s.summaryValue}>{data.total_horas.toFixed(2)}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Almuerzos excedidos</Text>
            <Text style={[s.summaryValue, { color: data.total_excedidos > 0 ? COL.danger : COL.ok }]}>
              {data.total_excedidos}
            </Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.tr} fixed>
            <Text style={[s.th, { flex: 1.1 }]}>Fecha</Text>
            <Text style={[s.th, { flex: 2.2 }]}>Colaborador</Text>
            <Text style={[s.th, { flex: 0.9 }]}>Entrada</Text>
            <Text style={[s.th, { flex: 0.9 }]}>Salida</Text>
            <Text style={[s.th, { flex: 1.6 }]}>Almuerzo</Text>
            <Text style={[s.th, { flex: 0.9, textAlign: "right" }]}>Alm. (min)</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Horas efect.</Text>
            <Text style={[s.th, { flex: 2.4 }]}>Notas</Text>
          </View>
          {data.filas.map((f, i) => (
            <View key={f.id} wrap={false} style={[s.tr, i === data.filas.length - 1 ? { borderBottomWidth: 0 } : {}]}>
              <Text style={[s.td, { flex: 1.1, fontFamily: "Courier" }]}>{f.fecha}</Text>
              <Text style={[s.td, { flex: 2.2 }]}>{f.colaborador}</Text>
              <Text style={[s.td, { flex: 0.9, fontFamily: "Courier" }]}>{f.entrada}</Text>
              <Text style={[s.td, { flex: 0.9, fontFamily: "Courier" }]}>{f.salida}</Text>
              <Text style={[s.td, { flex: 1.6, fontFamily: "Courier" }]}>{f.almuerzo}</Text>
              <Text
                style={[
                  s.td,
                  { flex: 0.9, textAlign: "right", fontFamily: FONT_BOLD, color: f.almuerzo_excedido ? COL.danger : COL.text },
                ]}
              >
                {f.almuerzo_min}
              </Text>
              <Text style={[s.td, { flex: 1, textAlign: "right", fontFamily: "Courier" }]}>
                {f.horas_efectivas.toFixed(2)}
              </Text>
              <Text style={[s.td, { flex: 2.4 }]}>{f.notas ?? "—"}</Text>
            </View>
          ))}
          {data.filas.length === 0 && (
            <View style={s.tr}>
              <Text style={[s.td, { flex: 1, textAlign: "center", color: COL.muted }]}>
                Sin marcaciones registradas en el período seleccionado.
              </Text>
            </View>
          )}
        </View>

        <Text style={s.nota}>
          Las horas efectivas descuentan el tiempo de almuerzo registrado. El límite establecido de almuerzo es de
          60 minutos; los excesos se resaltan y se notifican automáticamente a la administración.
        </Text>

        <PageFooter data={data} />
      </Page>
    </Document>
  );
}
