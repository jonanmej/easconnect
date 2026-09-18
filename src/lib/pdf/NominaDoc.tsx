import { Document, Page, Text, View, StyleSheet, Image, Font } from "@react-pdf/renderer";
import { BRAND_LOGO_URLS } from "@/components/BrandLogo";
import { NOTA_LEGAL_NOMINA, fmtUSD } from "@/lib/nomina";

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
  text: "#1f2937",
  muted: "#64748b",
  border: "#e2e8f0",
  panel: "#f8fafc",
  ok: "#10b981",
  warn: "#b45309",
};

const s = StyleSheet.create({
  page: { paddingTop: 90, paddingBottom: 78, paddingLeft: 42, paddingRight: 38, fontSize: 8.5, color: COL.text, fontFamily: FONT_REG },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: COL.primary },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 },
  headerLeftText: { flex: 1 },
  headerRight: { width: 180, alignItems: "flex-end" },
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
  section: { fontSize: 9, fontFamily: FONT_BOLD, color: COL.bg, marginTop: 12, marginBottom: 4 },
  table: { borderWidth: 1, borderColor: COL.border, borderRadius: 3, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  th: { padding: 5, fontSize: 6.5, fontFamily: FONT_BOLD, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase" },
  td: { padding: 4, fontSize: 7, lineHeight: 1.3 },
  nota: { marginTop: 10, fontSize: 6.5, color: COL.muted, lineHeight: 1.4 },
});

export type NominaPersona = {
  tecnico_id: string;
  colaborador: string;
  salario_mensual: number;
  valor_hora: number;
  dias: number;
  sin_salario: boolean;
  horas_totales: number;
  horas_ord_diurnas: number;
  horas_ord_nocturnas: number;
  horas_extra_diurnas: number;
  horas_extra_nocturnas: number;
  horas_descanso: number;
  horas_feriado: number;
  pago_ordinario: number;
  pago_extras: number;
  pago_descanso: number;
  pago_feriado: number;
  total_a_pagar: number;
};

export type NominaData = {
  desde: string;
  hasta: string;
  alcance: string;
  personal: NominaPersona[];
  totales: {
    horas_totales: number;
    horas_extra_diurnas: number;
    horas_extra_nocturnas: number;
    horas_descanso: number;
    horas_feriado: number;
    pago_ordinario: number;
    pago_extras: number;
    pago_descanso: number;
    pago_feriado: number;
    total_a_pagar: number;
  };
  emitido_at: string;
  documento_id?: string;
  documento_codigo?: string;
  documento_version?: string;
  documento_clasificacion?: string;
  documento_hash?: string;
};

function DocHeader({ data }: { data: NominaData }) {
  const codigo = `${data.documento_codigo ?? "EA-NOM-02"} · v${data.documento_version ?? "1.0"}`;
  const clasif = data.documento_clasificacion ?? "Confidencial · RRHH";
  return (
    <View fixed style={{ position: "absolute", top: 22, left: 42, right: 38 }}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Image src={LOGO_EA()} style={s.logoEa} />
          <View style={s.headerLeftText}>
            <Text style={s.headerTitle}>EA SERVICE AND CONSULTING</Text>
            <Text style={s.headerSub}>Planilla de pago · Cálculo de nómina</Text>
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

function DocFooter({ data }: { data: NominaData }) {
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
        <Text>Planilla de pago · ISO 9001:2015</Text>
      </View>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function NominaDoc({ data }: { data: NominaData }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <DocHeader data={data} />
        <Text style={s.title}>Cálculo de pago por colaborador</Text>
        <Text style={s.subtitle}>
          {data.alcance} · Del {data.desde} al {data.hasta} · Montos en dólares de los Estados Unidos (USD)
        </Text>
        <View style={s.titleRule} />

        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Pago ordinario</Text>
            <Text style={s.summaryValue}>{fmtUSD(data.totales.pago_ordinario)}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Horas extras</Text>
            <Text style={[s.summaryValue, { color: COL.warn }]}>{fmtUSD(data.totales.pago_extras)}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Domingos</Text>
            <Text style={s.summaryValue}>{fmtUSD(data.totales.pago_descanso)}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Feriados</Text>
            <Text style={s.summaryValue}>{fmtUSD(data.totales.pago_feriado)}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Total a pagar</Text>
            <Text style={[s.summaryValue, { color: COL.ok }]}>{fmtUSD(data.totales.total_a_pagar)}</Text>
          </View>
        </View>

        <Text style={s.section}>Detalle por colaborador</Text>
        <View style={s.table}>
          <View style={s.tr} fixed>
            <Text style={[s.th, { flex: 2.4 }]}>Colaborador</Text>
            <Text style={[s.th, { flex: 1.1, textAlign: "right" }]}>Salario mens.</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Hora ord.</Text>
            <Text style={[s.th, { flex: 0.8, textAlign: "right" }]}>Días</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>H. ord.</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Extra diu.</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Extra noc.</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>H. dom.</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>H. fer.</Text>
            <Text style={[s.th, { flex: 1.2, textAlign: "right" }]}>Pago ord.</Text>
            <Text style={[s.th, { flex: 1.2, textAlign: "right" }]}>Pago extras</Text>
            <Text style={[s.th, { flex: 1.2, textAlign: "right" }]}>Dom./Fer.</Text>
            <Text style={[s.th, { flex: 1.4, textAlign: "right" }]}>Total</Text>
          </View>
          {data.personal.map((p, i) => (
            <View key={p.tecnico_id} wrap={false} style={[s.tr, i === data.personal.length - 1 ? { borderBottomWidth: 0 } : {}]}>
              <Text style={[s.td, { flex: 2.4 }]}>
                {p.colaborador}{p.sin_salario ? " (sin salario registrado)" : ""}
              </Text>
              <Text style={[s.td, { flex: 1.1, textAlign: "right", fontFamily: "Courier" }]}>{fmtUSD(p.salario_mensual)}</Text>
              <Text style={[s.td, { flex: 1, textAlign: "right", fontFamily: "Courier" }]}>{fmtUSD(p.valor_hora)}</Text>
              <Text style={[s.td, { flex: 0.8, textAlign: "right", fontFamily: "Courier" }]}>{p.dias}</Text>
              <Text style={[s.td, { flex: 1, textAlign: "right", fontFamily: "Courier" }]}>
                {(p.horas_ord_diurnas + p.horas_ord_nocturnas).toFixed(2)}
              </Text>
              <Text style={[s.td, { flex: 1, textAlign: "right", fontFamily: "Courier" }]}>{p.horas_extra_diurnas.toFixed(2)}</Text>
              <Text style={[s.td, { flex: 1, textAlign: "right", fontFamily: "Courier" }]}>{p.horas_extra_nocturnas.toFixed(2)}</Text>
              <Text style={[s.td, { flex: 1, textAlign: "right", fontFamily: "Courier" }]}>{p.horas_descanso.toFixed(2)}</Text>
              <Text style={[s.td, { flex: 1, textAlign: "right", fontFamily: "Courier" }]}>{p.horas_feriado.toFixed(2)}</Text>
              <Text style={[s.td, { flex: 1.2, textAlign: "right", fontFamily: "Courier" }]}>{fmtUSD(p.pago_ordinario)}</Text>
              <Text style={[s.td, { flex: 1.2, textAlign: "right", fontFamily: "Courier", color: COL.warn }]}>{fmtUSD(p.pago_extras)}</Text>
              <Text style={[s.td, { flex: 1.2, textAlign: "right", fontFamily: "Courier" }]}>
                {fmtUSD(p.pago_descanso + p.pago_feriado)}
              </Text>
              <Text style={[s.td, { flex: 1.4, textAlign: "right", fontFamily: FONT_BOLD }]}>{fmtUSD(p.total_a_pagar)}</Text>
            </View>
          ))}
          {data.personal.length === 0 && (
            <View style={s.tr}>
              <Text style={[s.td, { flex: 1, textAlign: "center", color: COL.muted }]}>
                Sin marcaciones registradas en el período seleccionado.
              </Text>
            </View>
          )}
        </View>

        <Text style={s.nota}>{NOTA_LEGAL_NOMINA}</Text>
        <Text style={s.nota}>
          Los montos corresponden al pago bruto del período, antes de descuentos de ley (ISSS, AFP, renta) y de
          cualquier otra deducción o bonificación. El salario mensual es el registrado manualmente para cada colaborador.
        </Text>

        <DocFooter data={data} />
      </Page>
    </Document>
  );
}
