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
  page: { paddingTop: 96, paddingBottom: 84, paddingLeft: 60, paddingRight: 54, fontSize: 10, color: COL.text, fontFamily: FONT_REG },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: COL.primary },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 12 },
  headerLeftText: { flex: 1 },
  headerRight: { width: 170, alignItems: "flex-end" },
  headerTitle: { fontSize: 7.5, color: COL.bg, textTransform: "uppercase", letterSpacing: 1, fontFamily: FONT_BOLD },
  headerSub: { fontSize: 7, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 },
  headerRightTop: { fontSize: 8, color: COL.text, fontFamily: FONT_BOLD, textAlign: "right" },
  headerRightBot: { fontSize: 7.5, color: COL.muted, textAlign: "right", marginTop: 2, letterSpacing: 0.5 },
  logoEa: { height: 34, objectFit: "contain", marginRight: 10 },
  footerLogoPv: { height: 16, objectFit: "contain" },
  footerLogoCh: { height: 12, objectFit: "contain" },
  pageFooter: { position: "absolute", bottom: 24, left: 60, right: 54, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 7.5, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 6 },
  pageFooterLogos: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 17, fontFamily: FONT_BOLD, marginBottom: 4, color: COL.bg },
  subtitle: { fontSize: 9, color: COL.muted, marginBottom: 12 },
  titleRule: { width: 40, height: 2.5, backgroundColor: COL.primary, marginBottom: 14 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  summaryCard: { flex: 1, padding: 10, borderWidth: 0.75, borderColor: COL.border, borderLeftWidth: 3, borderLeftColor: COL.primary, borderRadius: 3, backgroundColor: COL.panel },
  summaryLabel: { fontSize: 7.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontFamily: FONT_BOLD },
  summaryValue: { fontSize: 15, fontFamily: FONT_BOLD, color: COL.bg },
  progressTrack: { height: 8, backgroundColor: COL.primarySoft, borderRadius: 3, overflow: "hidden", marginBottom: 14 },
  progressBar: { height: "100%", backgroundColor: COL.primary },
  table: { borderWidth: 1, borderColor: COL.border, borderRadius: 3, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  th: { padding: 6, fontSize: 8, fontFamily: FONT_BOLD, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase" },
  td: { padding: 5, fontSize: 8.5, lineHeight: 1.35 },
});

export type CumplimientoFila = {
  contrato_id: string;
  planta_nombre: string;
  servicio: string;
  cantidad_anual: number;
  completados: number;
  programados: number;
  cumplimiento_pct: number;
  proxima_fecha: string | null;
};

export type CumplimientoData = {
  cliente: string;
  anio: number;
  filas: CumplimientoFila[];
  total_contratado: number;
  total_completado: number;
  total_programado: number;
  cumplimiento_pct: number;
  emitido_at: string;
  documento_id?: string;
  documento_codigo?: string;
  documento_version?: string;
  documento_clasificacion?: string;
  documento_hash?: string;
};

function PageHeader({ data }: { data: CumplimientoData }) {
  const codigo = `${data.documento_codigo ?? "EA-CUM"} · v${data.documento_version ?? "1.0"}`;
  const clasif = data.documento_clasificacion ?? "Uso interno";
  return (
    <View fixed style={{ position: "absolute", top: 24, left: 60, right: 54 }}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Image src={LOGO_EA()} style={s.logoEa} />
          <View style={s.headerLeftText}>
            <Text style={s.headerTitle}>EA SERVICE AND CONSULTING</Text>
            <Text style={s.headerSub}>Cumplimiento de Servicios Contratados · {data.anio}</Text>
          </View>
        </View>
        <View style={s.headerRight}>
          <Text style={s.headerRightTop}>{data.cliente}</Text>
          <Text style={s.headerRightBot}>Emitido: {data.emitido_at}</Text>
          <Text style={s.headerRightBot}>{codigo}</Text>
          <Text style={s.headerRightBot}>{clasif}</Text>
        </View>
      </View>
    </View>
  );
}

function PageFooter({ data }: { data: CumplimientoData }) {
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
        <Text>Cumplimiento anual · Ejercicio {data.anio}</Text>
      </View>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function toneColor(pct: number) {
  if (pct >= 90) return COL.ok;
  if (pct >= 70) return COL.primary;
  return COL.danger;
}

export function CumplimientoDoc({ data }: { data: CumplimientoData }) {
  const pct = Math.max(0, Math.min(100, data.cumplimiento_pct));
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <PageHeader data={data} />
        <Text style={s.title}>Cumplimiento de servicios contratados</Text>
        <Text style={s.subtitle}>{data.cliente} · Ejercicio {data.anio}</Text>
        <View style={s.titleRule} />

        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Contratados</Text>
            <Text style={s.summaryValue}>{data.total_contratado}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Completados</Text>
            <Text style={s.summaryValue}>{data.total_completado}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Programados</Text>
            <Text style={s.summaryValue}>{data.total_programado}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Cumplimiento</Text>
            <Text style={[s.summaryValue, { color: toneColor(pct) }]}>{pct}%</Text>
          </View>
        </View>

        <View style={s.progressTrack}>
          <View style={[s.progressBar, { width: `${pct}%`, backgroundColor: toneColor(pct) }]} />
        </View>

        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, { flex: 2.8 }]}>Planta</Text>
            <Text style={[s.th, { flex: 2 }]}>Servicio</Text>
            <Text style={[s.th, { flex: 1.3, textAlign: "right" }]}>Contrat.</Text>
            <Text style={[s.th, { flex: 1.3, textAlign: "right" }]}>Complet.</Text>
            <Text style={[s.th, { flex: 1.3, textAlign: "right" }]}>Program.</Text>
            <Text style={[s.th, { flex: 0.9, textAlign: "right" }]}>%</Text>
            <Text style={[s.th, { flex: 1.7 }]}>Próxima</Text>
          </View>
          {data.filas.map((f, i) => (
            <View key={f.contrato_id} style={[s.tr, i === data.filas.length - 1 ? { borderBottomWidth: 0 } : {}]}>
              <Text style={[s.td, { flex: 2.8 }]}>{f.planta_nombre}</Text>
              <Text style={[s.td, { flex: 2 }]}>{f.servicio}</Text>
              <Text style={[s.td, { flex: 1.3, textAlign: "right", fontFamily: "Courier" }]}>{f.cantidad_anual}</Text>
              <Text style={[s.td, { flex: 1.3, textAlign: "right", fontFamily: "Courier", color: COL.ok }]}>{f.completados}</Text>
              <Text style={[s.td, { flex: 1.3, textAlign: "right", fontFamily: "Courier" }]}>{f.programados}</Text>
              <Text style={[s.td, { flex: 0.9, textAlign: "right", fontFamily: FONT_BOLD, color: toneColor(Number(f.cumplimiento_pct)) }]}>{Number(f.cumplimiento_pct)}%</Text>
              <Text style={[s.td, { flex: 1.7 }]}>{f.proxima_fecha ? new Date(f.proxima_fecha).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" }) : "—"}</Text>
            </View>
          ))}
          {data.filas.length === 0 && (
            <View style={s.tr}>
              <Text style={[s.td, { flex: 1, textAlign: "center", color: COL.muted }]}>Sin contratos vigentes para el año en curso.</Text>
            </View>
          )}
        </View>

        <PageFooter data={data} />
      </Page>
    </Document>
  );
}