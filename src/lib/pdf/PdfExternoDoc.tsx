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
  text: "#1f2937",
  muted: "#64748b",
  border: "#e2e8f0",
  panel: "#f8fafc",
};

const s = StyleSheet.create({
  page: { paddingTop: 96, paddingBottom: 84, paddingLeft: 96, paddingRight: 54, fontSize: 10, color: COL.text, fontFamily: FONT_REG },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: COL.primary },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 12 },
  headerLeftText: { flex: 1 },
  headerRight: { width: 160, alignItems: "flex-end" },
  headerTitle: { fontSize: 7.5, color: COL.bg, textTransform: "uppercase", letterSpacing: 1, fontFamily: FONT_BOLD },
  headerSub: { fontSize: 7, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 },
  headerRightTop: { fontSize: 8, color: COL.text, fontFamily: FONT_BOLD, textAlign: "right" },
  headerRightBot: { fontSize: 7.5, color: COL.muted, textAlign: "right", marginTop: 2, letterSpacing: 0.5 },
  logoEa: { height: 34, objectFit: "contain", marginRight: 10 },
  footerLogoPv: { height: 16, objectFit: "contain" },
  footerLogoCh: { height: 12, objectFit: "contain" },
  pageFooter: { position: "absolute", bottom: 24, left: 96, right: 54, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 7.5, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 6 },
  pageFooterLogos: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 17, fontFamily: FONT_BOLD, marginBottom: 8, color: COL.bg },
  titleRule: { width: 40, height: 2.5, backgroundColor: COL.primary, marginBottom: 14 },
  metaBox: { borderWidth: 0.75, borderColor: COL.border, borderLeftWidth: 3, borderLeftColor: COL.primary, borderRadius: 3, backgroundColor: COL.panel, padding: 10, marginBottom: 14 },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 90, fontSize: 8.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { flex: 1, fontSize: 9.5, fontFamily: FONT_BOLD, color: COL.text },
  paragraph: { fontSize: 10, lineHeight: 1.55, marginBottom: 8, textAlign: "justify" },
  sectionTitle: { fontSize: 10, fontFamily: FONT_BOLD, color: COL.bg, marginTop: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 },
});

export type PdfExternoData = {
  titulo: string;
  cliente?: string | null;
  planta?: string | null;
  folio?: string | null;
  servicio?: string | null;
  fecha: string;
  nombre_original: string;
  notas?: string | null;
  texto: string;
  documento_id?: string;
  documento_codigo?: string;
  documento_version?: string;
  documento_clasificacion?: string;
  documento_hash?: string;
};

function PageHeader({ data }: { data: PdfExternoData }) {
  const codigo = `${data.documento_codigo ?? "EA-REP-EXT"} · v${data.documento_version ?? "1.0"}`;
  const clasif = data.documento_clasificacion ?? "Uso interno";
  return (
    <View fixed style={{ position: "absolute", top: 24, left: 96, right: 54 }}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Image src={LOGO_EA()} style={s.logoEa} />
          <View style={s.headerLeftText}>
            <Text style={s.headerTitle}>EA SERVICE AND CONSULTING</Text>
            <Text style={s.headerSub}>Reporte Externo · Formato Institucional</Text>
          </View>
        </View>
        <View style={s.headerRight}>
          <Text style={s.headerRightTop}>{data.cliente ?? "—"}</Text>
          <Text style={s.headerRightBot}>{data.fecha}</Text>
          <Text style={s.headerRightBot}>{codigo}</Text>
          <Text style={s.headerRightBot}>{clasif}</Text>
        </View>
      </View>
    </View>
  );
}

function PageFooter({ data }: { data: PdfExternoData }) {
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
        <Text>Contenido original preservado · Reformateado por EA Service & Consulting</Text>
      </View>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function PdfExternoDoc({ data }: { data: PdfExternoData }) {
  // Dividimos el texto en párrafos por dobles saltos de línea. Cada
  // párrafo se renderiza como <Text>, preservando saltos simples.
  const parrafos = data.texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PageHeader data={data} />
        <Text style={s.title}>{data.titulo}</Text>
        <View style={s.titleRule} />
        <View style={s.metaBox}>
          <View style={s.metaRow}><Text style={s.metaLabel}>Cliente</Text><Text style={s.metaValue}>{data.cliente ?? "—"}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Planta</Text><Text style={s.metaValue}>{data.planta ?? "—"}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Folio OT</Text><Text style={s.metaValue}>{data.folio ?? "—"}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Servicio</Text><Text style={s.metaValue}>{data.servicio ?? "—"}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Fecha</Text><Text style={s.metaValue}>{data.fecha}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Archivo</Text><Text style={s.metaValue}>{data.nombre_original}</Text></View>
        </View>
        {data.notas && (
          <>
            <Text style={s.sectionTitle}>Notas del técnico</Text>
            <Text style={s.paragraph}>{data.notas}</Text>
          </>
        )}
        <Text style={s.sectionTitle}>Contenido del reporte (transcripción íntegra)</Text>
        {parrafos.map((p, i) => (
          <Text key={i} style={s.paragraph}>{p}</Text>
        ))}
        <PageFooter data={data} />
      </Page>
    </Document>
  );
}