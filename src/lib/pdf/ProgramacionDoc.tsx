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
};

export type ProgramacionTrabajo = {
  id: string;
  folio: string;
  cliente_nombre?: string | null;
  planta_nombre?: string | null;
  servicio: string;
  estado: string;
  fecha_programada: string;
  duracion_dias?: number | null;
};

export type ProgramacionData = {
  vista: "semana" | "mes" | "anio";
  headerTitle: string;
  trabajos: ProgramacionTrabajo[];
  filtros?: { label: string; value: string }[];
  paper: "A4" | "A3";
  orientation: "landscape" | "portrait";
  emitido_at: string;
  documento_id?: string;
  documento_codigo?: string;
  documento_version?: string;
  documento_clasificacion?: string;
};

const s = StyleSheet.create({
  page: { paddingTop: 84, paddingBottom: 60, paddingLeft: 40, paddingRight: 40, fontSize: 8.5, color: COL.text, fontFamily: FONT_REG },
  header: { position: "absolute", top: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: COL.primary },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 },
  headerLeftText: { flex: 1 },
  headerRight: { width: 170, alignItems: "flex-end" },
  headerTitle: { fontSize: 7, color: COL.bg, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: FONT_BOLD },
  headerSub: { fontSize: 6.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 },
  headerRightTop: { fontSize: 7.5, color: COL.text, fontFamily: FONT_BOLD, textAlign: "right" },
  headerRightBot: { fontSize: 7, color: COL.muted, textAlign: "right", marginTop: 2, letterSpacing: 0.5 },
  logoEa: { height: 28, objectFit: "contain", marginRight: 8 },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 7, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 5 },
  footerLogos: { flexDirection: "row", alignItems: "center", gap: 10 },
  footerLogoPv: { height: 14, objectFit: "contain" },
  footerLogoCh: { height: 11, objectFit: "contain" },
  title: { fontSize: 13, fontFamily: FONT_BOLD, color: COL.bg },
  subtitle: { fontSize: 8, color: COL.muted, marginBottom: 6 },
  titleRule: { width: 36, height: 2, backgroundColor: COL.primary, marginBottom: 8 },
  filtrosRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 8 },
  filtroChip: { fontSize: 6.5, color: COL.bg, backgroundColor: COL.primarySoft, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 2, fontFamily: FONT_BOLD, textTransform: "uppercase", letterSpacing: 0.5 },
  totalLine: { fontSize: 8, color: COL.muted, marginBottom: 8 },
  dayBlock: { marginBottom: 8 },
  dayTitle: { fontSize: 9, fontFamily: FONT_BOLD, color: COL.bg, backgroundColor: COL.primarySoft, paddingVertical: 3, paddingHorizontal: 5, textTransform: "capitalize" },
  table: { borderWidth: 0.5, borderColor: COL.border, borderTopWidth: 0 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  th: { padding: 4, fontSize: 6.5, fontFamily: FONT_BOLD, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase" },
  td: { padding: 3.5, fontSize: 7.5, lineHeight: 1.25 },
  empty: { fontSize: 8, color: COL.muted, fontStyle: "italic", padding: 6 },
});

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-SV", {
    timeZone: "America/El_Salvador",
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" });
}
function estadoTexto(e: string) {
  return String(e ?? "").replace(/_/g, " ");
}

function agruparPorFecha(items: ProgramacionTrabajo[]) {
  const map = new Map<string, ProgramacionTrabajo[]>();
  items.forEach((t) => {
    const d = new Date(t.fecha_programada);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, items]) => ({
      fecha,
      items: items.sort((a, b) => +new Date(a.fecha_programada) - +new Date(b.fecha_programada)),
    }));
}

function agruparPorMes(items: ProgramacionTrabajo[]) {
  const map = new Map<string, ProgramacionTrabajo[]>();
  items.forEach((t) => {
    const d = new Date(t.fecha_programada);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, its]) => ({ mes, items: its.sort((a, b) => +new Date(a.fecha_programada) - +new Date(b.fecha_programada)) }));
}

function fmtMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-SV", { month: "long", year: "numeric" });
}

function PageChrome({ data }: { data: ProgramacionData }) {
  return (
    <>
      <View style={s.header} fixed>
        <View style={s.headerLeft}>
          <Image src={LOGO_EA()} style={s.logoEa} />
          <View style={s.headerLeftText}>
            <Text style={s.headerTitle}>EA Service Connect · Programación</Text>
            <Text style={s.headerSub}>{data.documento_codigo ?? "EA-PRG"} · v{data.documento_version ?? "1.0"} · {data.documento_clasificacion ?? "Uso interno"}</Text>
          </View>
        </View>
        <View style={s.headerRight}>
          <Text style={s.headerRightTop}>{data.headerTitle}</Text>
          <Text style={s.headerRightBot}>Emitido: {data.emitido_at}</Text>
        </View>
      </View>
      <View style={s.footer} fixed>
        <View style={s.footerLogos}>
          <Image src={LOGO_PVSTOP()} style={s.footerLogoPv} />
          <Image src={LOGO_CHEMITEK()} style={s.footerLogoCh} />
        </View>
        <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
      </View>
    </>
  );
}

export function ProgramacionDoc({ data }: { data: ProgramacionData }) {
  const size = data.paper;
  const orientation = data.orientation;
  return (
    <Document title={`Programación · ${data.headerTitle}`} author="EA Service Connect">
      <Page size={size} orientation={orientation} style={s.page}>
        <PageChrome data={data} />
        <Text style={s.title}>Programación de trabajos</Text>
        <View style={s.titleRule} />
        <Text style={s.subtitle}>
          {data.vista === "semana" ? "Vista semanal" : data.vista === "mes" ? "Vista mensual" : "Vista anual"} · {data.headerTitle}
        </Text>
        {data.filtros && data.filtros.length > 0 && (
          <View style={s.filtrosRow}>
            {data.filtros.map((f, i) => (
              <Text key={i} style={s.filtroChip}>{f.label}: {f.value}</Text>
            ))}
          </View>
        )}
        <Text style={s.totalLine}>{data.trabajos.length} trabajo{data.trabajos.length === 1 ? "" : "s"} en el rango seleccionado.</Text>

        {data.trabajos.length === 0 && <Text style={s.empty}>Sin trabajos programados.</Text>}

        {data.vista === "anio"
          ? <AnioSecciones data={data} />
          : <DiaSecciones items={data.trabajos} />
        }
      </Page>
    </Document>
  );
}

function DiaSecciones({ items }: { items: ProgramacionTrabajo[] }) {
  const grupos = agruparPorFecha(items);
  return (
    <>
      {grupos.map((g) => (
        <View key={g.fecha} style={s.dayBlock} wrap={false}>
          <Text style={s.dayTitle}>{fmtDate(g.fecha)}</Text>
          <View style={s.table}>
            <View style={s.tr}>
              <Text style={[s.th, { width: "9%" }]}>Hora</Text>
              <Text style={[s.th, { width: "14%" }]}>OT</Text>
              <Text style={[s.th, { width: "24%" }]}>Cliente</Text>
              <Text style={[s.th, { width: "23%" }]}>Planta</Text>
              <Text style={[s.th, { width: "20%" }]}>Servicio</Text>
              <Text style={[s.th, { width: "10%" }]}>Estado</Text>
            </View>
            {g.items.map((t) => (
              <View key={t.id + "-" + t.fecha_programada} style={s.tr}>
                <Text style={[s.td, { width: "9%" }]}>{fmtTime(t.fecha_programada)}</Text>
                <Text style={[s.td, { width: "14%" }]}>{t.folio}</Text>
                <Text style={[s.td, { width: "24%" }]}>{t.cliente_nombre ?? "—"}</Text>
                <Text style={[s.td, { width: "23%" }]}>{t.planta_nombre ?? "—"}</Text>
                <Text style={[s.td, { width: "20%" }]}>{t.servicio}</Text>
                <Text style={[s.td, { width: "10%", textTransform: "capitalize" }]}>{estadoTexto(t.estado)}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

function AnioSecciones({ data }: { data: ProgramacionData }) {
  const meses = agruparPorMes(data.trabajos);
  return (
    <>
      {meses.map((m) => (
        <View key={m.mes} style={{ marginBottom: 10 }} wrap>
          <Text style={[s.dayTitle, { textTransform: "capitalize", fontSize: 10 }]}>{fmtMonth(m.mes)}</Text>
          <View style={s.table}>
            <View style={s.tr}>
              <Text style={[s.th, { width: "10%" }]}>Fecha</Text>
              <Text style={[s.th, { width: "14%" }]}>OT</Text>
              <Text style={[s.th, { width: "24%" }]}>Cliente</Text>
              <Text style={[s.th, { width: "22%" }]}>Planta</Text>
              <Text style={[s.th, { width: "20%" }]}>Servicio</Text>
              <Text style={[s.th, { width: "10%" }]}>Estado</Text>
            </View>
            {m.items.map((t) => {
              const d = new Date(t.fecha_programada);
              const fecha = d.toLocaleDateString("es-SV", { day: "2-digit", month: "short", weekday: "short" });
              return (
                <View key={t.id + "-" + t.fecha_programada} style={s.tr}>
                  <Text style={[s.td, { width: "10%" }]}>{fecha}</Text>
                  <Text style={[s.td, { width: "14%" }]}>{t.folio}</Text>
                  <Text style={[s.td, { width: "24%" }]}>{t.cliente_nombre ?? "—"}</Text>
                  <Text style={[s.td, { width: "22%" }]}>{t.planta_nombre ?? "—"}</Text>
                  <Text style={[s.td, { width: "20%" }]}>{t.servicio}</Text>
                  <Text style={[s.td, { width: "10%", textTransform: "capitalize" }]}>{estadoTexto(t.estado)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </>
  );
}