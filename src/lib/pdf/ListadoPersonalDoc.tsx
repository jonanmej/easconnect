import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";
import { BRAND_LOGO_URLS } from "@/components/BrandLogo";

function absUrl(path: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://easconnect.lovable.app";
  return `${origin}${path}`;
}

Font.registerHyphenationCallback((w) => [w]);

const PRIMARY = "#2E4A87";
const BORDER = "#94a3b8";
const MUTED = "#64748b";

const s = StyleSheet.create({
  page: { paddingTop: 92, paddingBottom: 74, paddingHorizontal: 46, fontSize: 10, fontFamily: "Helvetica", color: "#1f2937" },
  header: { position: "absolute", top: 24, left: 46, right: 46, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: PRIMARY, paddingBottom: 5 },
  logo: { height: 32, objectFit: "contain" },
  hRight: { alignItems: "flex-end" },
  hTop: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  hBot: { fontSize: 7, color: MUTED, marginTop: 2 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 10 },
  meta: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 3 },
  table: { borderWidth: 1, borderColor: BORDER, marginTop: 14 },
  row: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: BORDER },
  th: { backgroundColor: PRIMARY, color: "#fff", fontFamily: "Helvetica-Bold", padding: 5 },
  td: { padding: 5 },
  c1: { flex: 3, borderRightWidth: 0.75, borderRightColor: BORDER },
  c2: { flex: 1.4 },
  footer: { position: "absolute", bottom: 22, left: 46, right: 46, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 7, color: MUTED, borderTopWidth: 0.75, borderTopColor: PRIMARY, paddingTop: 5 },
  fLogos: { flexDirection: "row", alignItems: "center", gap: 10 },
});

export type ListadoPdf = {
  proyecto: string;
  cliente: string;
  folio: string;
  planta: string;
  fecha: string;
  personal: { nombre: string; dui: string }[];
  vehiculos: { modelo: string; placa: string }[];
};

export type ListadoPersonalData = {
  listados: ListadoPdf[];
  emitido_at: string;
  documento_id?: string;
  documento_hash?: string;
};

function Tabla({ h1, h2, rows }: { h1: string; h2: string; rows: [string, string][] }) {
  return (
    <View style={s.table}>
      <View style={s.row} wrap={false}>
        <Text style={[s.th, s.c1]}>{h1}</Text>
        <Text style={[s.th, s.c2]}>{h2}</Text>
      </View>
      {rows.map(([a, b], i) => (
        <View key={i} style={s.row} wrap={false}>
          <Text style={[s.td, s.c1]}>{a}</Text>
          <Text style={[s.td, s.c2]}>{b || "—"}</Text>
        </View>
      ))}
    </View>
  );
}

export function ListadoPersonalDoc({ data }: { data: ListadoPersonalData }) {
  const docId = data.documento_id ? data.documento_id.slice(0, 8).toUpperCase() : "—";
  const hash = data.documento_hash ? data.documento_hash.slice(0, 12) : null;
  return (
    <Document title="Listado de personal" author="EA Service and Consulting">
      {data.listados.map((l, i) => (
        <Page key={i} size="A4" style={s.page}>
          <View style={s.header} fixed>
            <Image src={absUrl(BRAND_LOGO_URLS["ea-main"].light)} style={s.logo} />
            <View style={s.hRight}>
              <Text style={s.hTop}>OT {l.folio} · {l.planta}</Text>
              <Text style={s.hBot}>Fecha: {l.fecha} · Emitido: {data.emitido_at}</Text>
              <Text style={s.hBot}>EA-RH-02 · v1.0 · Uso externo</Text>
            </View>
          </View>
          <View style={s.footer} fixed>
            <View style={s.fLogos}>
              <Image src={absUrl(BRAND_LOGO_URLS.pvstop.light)} style={{ height: 14, objectFit: "contain" }} />
              <Image src={absUrl(BRAND_LOGO_URLS.chemitek.light)} style={{ height: 11, objectFit: "contain" }} />
            </View>
            <View style={{ flex: 1, paddingLeft: 12 }}>
              <Text>ID Doc: {docId}{hash ? ` · SHA-256 ${hash}…` : ""}</Text>
              <Text>Listado de personal en sitio · ISO 9001:2015</Text>
            </View>
            <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
          </View>

          <Text style={s.title}>LISTADO PERSONAL EA SERVICE</Text>
          <Text style={s.meta}>PROYECTO: {l.proyecto.toUpperCase()}</Text>
          <Text style={s.meta}>CLIENTE: {l.cliente.toUpperCase()}</Text>

          <Tabla h1="NOMBRE" h2="DUI" rows={l.personal.map((p) => [p.nombre, p.dui])} />
          {l.vehiculos.length > 0 && (
            <Tabla h1="VEHÍCULO" h2="PLACA" rows={l.vehiculos.map((v) => [v.modelo, v.placa])} />
          )}
        </Page>
      ))}
    </Document>
  );
}
