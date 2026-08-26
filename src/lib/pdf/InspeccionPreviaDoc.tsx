import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";
import { BRAND_LOGO_URLS } from "@/components/BrandLogo";
import {
  AREA_LABEL,
  NIVEL_LABEL,
  RIESGO_LABEL,
  SEVERIDAD_LABEL,
} from "@/lib/inspeccion-previa-catalogo";

function absUrl(path: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://easconnect.lovable.app";
  return `${origin}${path}`;
}
const LOGO_EA = () => absUrl(BRAND_LOGO_URLS["ea-main"].light);
const LOGO_PVSTOP = () => absUrl(BRAND_LOGO_URLS.pvstop.light);
const LOGO_CHEMITEK = () => absUrl(BRAND_LOGO_URLS.chemitek.light);

Font.registerHyphenationCallback((word) => [word]);

const COL = {
  bg: "#2E4A87",
  primary: "#5B7FBF",
  text: "#1f2937",
  muted: "#64748b",
  border: "#e2e8f0",
  panel: "#f8fafc",
  ok: "#16a34a",
  warn: "#ea580c",
  danger: "#dc2626",
};
const FONT_REG = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const FONT_OBL = "Helvetica-Oblique";

const styles = StyleSheet.create({
  page: { paddingTop: 96, paddingBottom: 84, paddingLeft: 96, paddingRight: 54, fontSize: 10, color: COL.text, fontFamily: FONT_REG },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1.5, borderBottomColor: COL.primary },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 12 },
  headerLeftText: { flex: 1, marginLeft: 8 },
  headerRight: { width: 170, alignItems: "flex-end" },
  headerTitle: { fontSize: 7.5, color: COL.bg, textTransform: "uppercase", letterSpacing: 1, fontFamily: FONT_BOLD },
  headerSub: { fontSize: 7, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 },
  headerRightTop: { fontSize: 8, color: COL.text, fontFamily: FONT_BOLD, textAlign: "right" },
  headerRightBot: { fontSize: 7.5, color: COL.muted, textAlign: "right", marginTop: 2, letterSpacing: 0.5 },
  pageTitle: { fontSize: 16, fontFamily: FONT_BOLD, marginBottom: 10, color: COL.bg },
  sectionTitle: { fontSize: 11.5, fontFamily: FONT_BOLD, marginTop: 14, marginBottom: 8, color: COL.bg, paddingBottom: 4, borderBottomWidth: 0.75, borderBottomColor: COL.primary },
  metaGrid: { marginBottom: 10, borderWidth: 0.5, borderColor: COL.border, borderRadius: 2, padding: 10 },
  metaRow: { flexDirection: "row", marginBottom: 5, alignItems: "flex-start" },
  metaLabel: { width: 130, fontSize: 8.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 1, paddingRight: 6 },
  metaValue: { flex: 1, fontSize: 10, fontFamily: FONT_BOLD, color: COL.text },
  metaHalf: { width: "50%", flexDirection: "row", alignItems: "flex-start" },
  table: { borderWidth: 1, borderColor: COL.border, borderRadius: 3, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  th: { padding: 6, fontSize: 8, fontFamily: FONT_BOLD, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase" },
  td: { padding: 5, fontSize: 8.5, lineHeight: 1.35 },
  chip: { fontSize: 8, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, borderWidth: 0.5, borderColor: COL.border, backgroundColor: COL.panel, marginRight: 4, marginBottom: 4 },
  pageFooter: { position: "absolute", bottom: 24, left: 96, right: 54, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 7.5, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 6 },
  signLine: { borderTopWidth: 0.75, borderTopColor: COL.text, paddingTop: 4, fontSize: 9, color: COL.muted, textAlign: "center" },
  foto: { width: "48%", marginBottom: 10, marginRight: "2%" },
});

export type InspeccionPreviaData = {
  folio: string;
  cliente: string;
  planta: string;
  ubicacion?: string | null;
  paneles?: number | null;
  servicio: string;
  fecha: string;
  fecha_programada?: string | null;
  tecnico?: string | null;
  cubierta_tipo?: string | null;
  cubierta_estado?: string | null;
  estructura_estado?: string | null;
  accesos_estado?: string | null;
  circundante_estado?: string | null;
  riesgos: string[];
  techo_detalle?: string | null;
  accesos_detalle?: string | null;
  circundante_detalle?: string | null;
  observaciones?: string | null;
  apto: boolean;
  restricciones?: string | null;
  hallazgos: {
    area: string;
    severidad: string;
    descripcion: string;
    zona?: string | null;
  }[];
  fotos?: { descripcion?: string | null; dataUrl: string; aspect?: number | null }[];
  emitido_at: string;
  documento_id?: string;
  documento_codigo?: string;
  documento_version?: string;
  documento_clasificacion?: string;
  documento_hash?: string;
  responsable?: string | null;
  theme?: "light" | "dark";
};

function colorNivel(n?: string | null) {
  if (n === "bueno") return COL.ok;
  if (n === "regular") return "#ca8a04";
  if (n === "malo") return COL.warn;
  if (n === "critico") return COL.danger;
  return COL.muted;
}

function PageHeader({ data }: { data: InspeccionPreviaData }) {
  const codigo = `${data.documento_codigo ?? "EA-INS-PRE"} · v${data.documento_version ?? "1.0"}`;
  return (
    <View fixed style={{ position: "absolute", top: 24, left: 96, right: 54 }}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image src={LOGO_EA()} style={{ height: 34, objectFit: "contain", marginRight: 10 }} />
          <View style={styles.headerLeftText}>
            <Text style={styles.headerTitle}>EA SERVICE AND CONSULTING</Text>
            <Text style={styles.headerSub}>Estado previo a trabajos · OT {data.folio}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerRightTop}>{data.cliente}</Text>
          <Text style={styles.headerRightBot}>{data.planta}</Text>
          <Text style={styles.headerRightBot}>{codigo}</Text>
          <Text style={styles.headerRightBot}>{data.documento_clasificacion ?? "Uso interno"}</Text>
          <Text style={styles.headerRightBot}>ISO 9001:2015 §8.5.1</Text>
        </View>
      </View>
    </View>
  );
}

function PageFooter({ data }: { data: InspeccionPreviaData }) {
  const docId = data.documento_id ? data.documento_id.slice(0, 8).toUpperCase() : "—";
  const hash = data.documento_hash ? data.documento_hash.slice(0, 12) : null;
  return (
    <View style={styles.pageFooter} fixed>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Image src={LOGO_PVSTOP()} style={{ height: 16, objectFit: "contain" }} />
        <Image src={LOGO_CHEMITEK()} style={{ height: 12, objectFit: "contain" }} />
      </View>
      <View style={{ flexDirection: "column", flex: 1, paddingLeft: 12 }}>
        <Text>ID Doc: {docId}{hash ? ` · SHA-256 ${hash}…` : ""}</Text>
        <Text>
          Retención documental §7.5 · {data.responsable ? `Responsable: ${data.responsable}` : "Equipo EA Service and Consulting"}
        </Text>
      </View>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Estado({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <View style={styles.metaHalf}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, { color: colorNivel(valor) }]}>
        {valor ? (NIVEL_LABEL[valor] ?? valor) : "No evaluado"}
      </Text>
    </View>
  );
}

export function InspeccionPreviaDoc({ data }: { data: InspeccionPreviaData }) {
  const fecha = new Date();
  return (
    <Document
      title={`Estado previo · ${data.planta} · ${data.folio}`}
      author={data.responsable ?? "EA SERVICE AND CONSULTING"}
      subject={`Reporte de estado previo a trabajos · ${data.cliente} · ${data.planta}`}
      keywords={[data.cliente, data.planta, data.folio, "Estado previo", "Inspección"].join(", ")}
      creator="EA Service Connect"
      producer="EA Service Connect"
      creationDate={fecha}
      modificationDate={fecha}
    >
      <Page size="LETTER" style={styles.page}>
        <PageHeader data={data} />
        <Text style={styles.pageTitle}>Reporte de Estado Previo a Trabajos</Text>
        <Text style={{ fontSize: 9, color: COL.muted, marginBottom: 10 }}>
          Inspección de techos / áreas con instalaciones fotovoltaicas y sectores circundantes,
          realizada antes de iniciar labores.
        </Text>

        <View style={styles.metaGrid}>
          <View style={styles.metaRow}>
            <View style={styles.metaHalf}>
              <Text style={styles.metaLabel}>Cliente</Text>
              <Text style={styles.metaValue}>{data.cliente}</Text>
            </View>
            <View style={styles.metaHalf}>
              <Text style={styles.metaLabel}>Planta</Text>
              <Text style={styles.metaValue}>{data.planta}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaHalf}>
              <Text style={styles.metaLabel}>OT</Text>
              <Text style={styles.metaValue}>{data.folio}</Text>
            </View>
            <View style={styles.metaHalf}>
              <Text style={styles.metaLabel}>Servicio</Text>
              <Text style={styles.metaValue}>{data.servicio}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaHalf}>
              <Text style={styles.metaLabel}>Fecha inspección</Text>
              <Text style={styles.metaValue}>{data.fecha}</Text>
            </View>
            <View style={styles.metaHalf}>
              <Text style={styles.metaLabel}>Inspeccionó</Text>
              <Text style={styles.metaValue}>{data.tecnico ?? "—"}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Ubicación</Text>
            <Text style={styles.metaValue}>{data.ubicacion ?? "—"}</Text>
          </View>
          <View style={{ flexDirection: "row" }}>
            <Text style={styles.metaLabel}>Tipo de cubierta</Text>
            <Text style={styles.metaValue}>{data.cubierta_tipo ?? "—"}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>1. Condición general evaluada</Text>
        <View style={styles.metaGrid}>
          <View style={styles.metaRow}>
            <Estado label="Techo / cubierta" valor={data.cubierta_estado} />
            <Estado label="Estructura montaje" valor={data.estructura_estado} />
          </View>
          <View style={{ flexDirection: "row" }}>
            <Estado label="Accesos y seguridad" valor={data.accesos_estado} />
            <Estado label="Sector circundante" valor={data.circundante_estado} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>2. Riesgos y condiciones detectadas</Text>
        {data.riesgos.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {data.riesgos.map((r, i) => (
              <Text key={i} style={styles.chip}>{RIESGO_LABEL[r] ?? r}</Text>
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: 9.5, color: COL.muted, fontFamily: FONT_OBL }}>
            No se registraron riesgos ni condiciones adversas.
          </Text>
        )}

        <Text style={styles.sectionTitle}>3. Hallazgos por zona</Text>
        {data.hallazgos.length ? (
          <View style={styles.table}>
            <View style={styles.tr}>
              <Text style={[styles.th, { width: "6%", textAlign: "center" }]}>#</Text>
              <Text style={[styles.th, { width: "20%" }]}>Área</Text>
              <Text style={[styles.th, { width: "20%" }]}>Zona</Text>
              <Text style={[styles.th, { width: "14%", textAlign: "center" }]}>Severidad</Text>
              <Text style={[styles.th, { width: "40%" }]}>Descripción</Text>
            </View>
            {data.hallazgos.map((h, i) => (
              <View key={i} style={styles.tr} wrap={false}>
                <Text style={[styles.td, { width: "6%", textAlign: "center" }]}>{i + 1}</Text>
                <Text style={[styles.td, { width: "20%" }]}>{AREA_LABEL[h.area] ?? h.area}</Text>
                <Text style={[styles.td, { width: "20%" }]}>{h.zona ?? "General"}</Text>
                <Text
                  style={[
                    styles.td,
                    {
                      width: "14%",
                      textAlign: "center",
                      fontFamily: FONT_BOLD,
                      color: h.severidad === "critico" ? COL.danger : h.severidad === "moderado" ? COL.warn : COL.text,
                    },
                  ]}
                >
                  {SEVERIDAD_LABEL[h.severidad] ?? h.severidad}
                </Text>
                <Text style={[styles.td, { width: "40%" }]}>{h.descripcion}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: 9.5, color: COL.muted, fontFamily: FONT_OBL }}>
            Sin hallazgos registrados.
          </Text>
        )}

        <Text style={styles.sectionTitle}>4. Detalle por sector</Text>
        <View style={{ gap: 6 }}>
          <View>
            <Text style={{ fontSize: 9, fontFamily: FONT_BOLD, color: COL.bg }}>Techo / cubierta</Text>
            <Text style={{ fontSize: 9.5, lineHeight: 1.45 }}>{data.techo_detalle ?? "Sin observaciones."}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 9, fontFamily: FONT_BOLD, color: COL.bg }}>Accesos y seguridad</Text>
            <Text style={{ fontSize: 9.5, lineHeight: 1.45 }}>{data.accesos_detalle ?? "Sin observaciones."}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 9, fontFamily: FONT_BOLD, color: COL.bg }}>Sectores circundantes</Text>
            <Text style={{ fontSize: 9.5, lineHeight: 1.45 }}>{data.circundante_detalle ?? "Sin observaciones."}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>5. Conclusión</Text>
        <View
          style={{
            borderWidth: 0.75,
            borderColor: data.apto ? COL.ok : COL.danger,
            borderRadius: 3,
            padding: 8,
            backgroundColor: COL.panel,
          }}
        >
          <Text style={{ fontSize: 10, fontFamily: FONT_BOLD, color: data.apto ? COL.ok : COL.danger }}>
            {data.apto
              ? "Área APTA para ejecutar los trabajos programados."
              : "Área NO APTA: se requiere acción correctiva antes de ejecutar los trabajos."}
          </Text>
          {data.restricciones && (
            <Text style={{ fontSize: 9.5, marginTop: 4, lineHeight: 1.45 }}>
              Restricciones / condiciones: {data.restricciones}
            </Text>
          )}
          {data.observaciones && (
            <Text style={{ fontSize: 9.5, marginTop: 4, lineHeight: 1.45 }}>
              Observaciones: {data.observaciones}
            </Text>
          )}
        </View>

        <View style={{ flexDirection: "row", marginTop: 36, gap: 24 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.signLine}>{data.tecnico ?? "Técnico responsable"}</Text>
            <Text style={{ fontSize: 7.5, color: COL.muted, textAlign: "center", marginTop: 2 }}>
              Inspección realizada por
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.signLine}>Revisó / autorizó</Text>
            <Text style={{ fontSize: 7.5, color: COL.muted, textAlign: "center", marginTop: 2 }}>
              Supervisión EA Service and Consulting
            </Text>
          </View>
        </View>

        <PageFooter data={data} />
      </Page>

      {!!data.fotos?.length && (
        <Page size="LETTER" style={styles.page}>
          <PageHeader data={data} />
          <Text style={styles.pageTitle}>Registro fotográfico del estado previo</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {data.fotos.map((f, i) => (
              <View key={i} style={styles.foto} wrap={false}>
                <Image src={f.dataUrl} style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 2 }} />
                <Text style={{ fontSize: 8, color: COL.muted, marginTop: 3 }}>
                  {i + 1}. {f.descripcion ?? "Sin descripción"}
                </Text>
              </View>
            ))}
          </View>
          <PageFooter data={data} />
        </Page>
      )}
    </Document>
  );
}
