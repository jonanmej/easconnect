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
};

const s = StyleSheet.create({
  page: { paddingTop: 90, paddingBottom: 78, paddingLeft: 40, paddingRight: 36, fontSize: 8.5, color: COL.text, fontFamily: FONT_REG },
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
  pageFooter: { position: "absolute", bottom: 22, left: 40, right: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 7, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 5 },
  pageFooterLogos: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 14, fontFamily: FONT_BOLD, marginBottom: 3, color: COL.bg },
  subtitle: { fontSize: 8, color: COL.muted, marginBottom: 8 },
  titleRule: { width: 36, height: 2, backgroundColor: COL.primary, marginBottom: 10 },
  filtros: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10, padding: 6, backgroundColor: COL.panel, borderWidth: 0.75, borderColor: COL.border, borderRadius: 3 },
  filtro: { fontSize: 7, color: COL.muted },
  summaryRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  summaryCard: { flex: 1, padding: 8, borderWidth: 0.75, borderColor: COL.border, borderLeftWidth: 3, borderLeftColor: COL.primary, borderRadius: 3, backgroundColor: COL.panel },
  summaryLabel: { fontSize: 6.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3, fontFamily: FONT_BOLD },
  summaryValue: { fontSize: 12, fontFamily: FONT_BOLD, color: COL.bg },
  clienteBlock: { marginBottom: 14 },
  clienteHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: COL.primarySoft, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 3, marginBottom: 4 },
  clienteName: { fontSize: 9, fontFamily: FONT_BOLD, color: COL.bg },
  clienteMeta: { fontSize: 7, color: COL.muted },
  plantaName: { fontSize: 7.5, fontFamily: FONT_BOLD, color: COL.text, marginTop: 5, marginBottom: 2 },
  table: { borderWidth: 1, borderColor: COL.border, borderRadius: 3 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  th: { padding: 4, fontSize: 6.5, fontFamily: FONT_BOLD, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase" },
  td: { padding: 4, fontSize: 7, lineHeight: 1.3 },
});

export type FinalizadoFila = {
  id: string;
  folio: string;
  servicio: string;
  planta_nombre: string;
  cliente_nombre: string;
  fecha_programada: string;
  fecha_completado: string;
  duracion_dias: number;
  firmado_at?: string | null;
  firmado_por?: string | null;
  tecnico?: string | null;
};

export type FinalizadosData = {
  filas: FinalizadoFila[];
  periodo: string;
  filtros: { label: string; value: string }[];
  emitido_at: string;
  documento_id?: string;
  documento_codigo?: string;
  documento_version?: string;
  documento_clasificacion?: string;
  documento_hash?: string;
};

const TZ = "America/El_Salvador";

function fechaLarga(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-SV", {
      timeZone: TZ,
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function hora(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("es-SV", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function PageHeaderView({ data }: { data: FinalizadosData }) {
  const codigo = `${data.documento_codigo ?? "EA-FIN"} · v${data.documento_version ?? "1.0"}`;
  return (
    <View fixed style={{ position: "absolute", top: 22, left: 40, right: 36 }}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Image src={LOGO_EA()} style={s.logoEa} />
          <View style={s.headerLeftText}>
            <Text style={s.headerTitle}>EA SERVICE AND CONSULTING</Text>
            <Text style={s.headerSub}>Trabajos finalizados por cliente</Text>
          </View>
        </View>
        <View style={s.headerRight}>
          <Text style={s.headerRightTop}>{data.periodo}</Text>
          <Text style={s.headerRightBot}>Emitido: {data.emitido_at}</Text>
          <Text style={s.headerRightBot}>{codigo}</Text>
          <Text style={s.headerRightBot}>{data.documento_clasificacion ?? "Uso interno"}</Text>
        </View>
      </View>
    </View>
  );
}

function PageFooterView({ data }: { data: FinalizadosData }) {
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
        <Text>Retención documental: 5 años · ISO 9001:2015 §7.5</Text>
      </View>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function agrupar(filas: FinalizadoFila[]) {
  const clientes = new Map<string, Map<string, FinalizadoFila[]>>();
  for (const f of filas) {
    const c = clientes.get(f.cliente_nombre) ?? new Map<string, FinalizadoFila[]>();
    const p = c.get(f.planta_nombre) ?? [];
    p.push(f);
    c.set(f.planta_nombre, p);
    clientes.set(f.cliente_nombre, c);
  }
  return Array.from(clientes.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "es"))
    .map(([cliente, plantas]) => ({
      cliente,
      total: Array.from(plantas.values()).reduce((n, x) => n + x.length, 0),
      plantas: Array.from(plantas.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "es"))
        .map(([planta, trabajos]) => ({
          planta,
          trabajos: [...trabajos].sort(
            (a, b) => new Date(b.fecha_completado).getTime() - new Date(a.fecha_completado).getTime(),
          ),
        })),
    }));
}

export function FinalizadosDoc({ data }: { data: FinalizadosData }) {
  const grupos = agrupar(data.filas);
  const plantasTotal = grupos.reduce((n, g) => n + g.plantas.length, 0);
  return (
    <Document
      title="Trabajos finalizados por cliente"
      author="EA Service and Consulting"
      subject={`Trabajos finalizados · ${data.periodo}`}
    >
      <Page size="A4" orientation="landscape" style={s.page}>
        <PageHeaderView data={data} />
        <Text style={s.title}>Trabajos finalizados por cliente</Text>
        <Text style={s.subtitle}>Fecha y hora exacta de finalización de los servicios ejecutados · {data.periodo}</Text>
        <View style={s.titleRule} />

        {data.filtros.length > 0 && (
          <View style={s.filtros}>
            {data.filtros.map((f, i) => (
              <Text key={i} style={s.filtro}>
                {f.label}: {f.value}
              </Text>
            ))}
          </View>
        )}

        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Clientes</Text>
            <Text style={s.summaryValue}>{grupos.length}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Plantas</Text>
            <Text style={s.summaryValue}>{plantasTotal}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>Trabajos finalizados</Text>
            <Text style={[s.summaryValue, { color: COL.ok }]}>{data.filas.length}</Text>
          </View>
        </View>

        {grupos.map((g) => (
          <View key={g.cliente} style={s.clienteBlock} wrap={false}>
            <View style={s.clienteHead}>
              <Text style={s.clienteName}>{g.cliente}</Text>
              <Text style={s.clienteMeta}>
                {g.plantas.length} planta(s) · {g.total} trabajo(s) finalizado(s)
              </Text>
            </View>
            {g.plantas.map((p) => (
              <View key={p.planta}>
                <Text style={s.plantaName}>Planta: {p.planta}</Text>
                <View style={s.table}>
                  <View style={s.tr}>
                    <Text style={[s.th, { flex: 1 }]}>OT</Text>
                    <Text style={[s.th, { flex: 1.6 }]}>Servicio</Text>
                    <Text style={[s.th, { flex: 1.8 }]}>Día de finalización</Text>
                    <Text style={[s.th, { flex: 0.8, textAlign: "right" }]}>Hora</Text>
                    <Text style={[s.th, { flex: 1.4 }]}>Programado</Text>
                    <Text style={[s.th, { flex: 0.7, textAlign: "right" }]}>Días</Text>
                    <Text style={[s.th, { flex: 1.5 }]}>Responsable</Text>
                    <Text style={[s.th, { flex: 1.5 }]}>Recibido / firmado</Text>
                  </View>
                  {p.trabajos.map((t, i) => (
                    <View key={t.id} style={[s.tr, i === p.trabajos.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                      <Text style={[s.td, { flex: 1, fontFamily: "Courier" }]}>{t.folio}</Text>
                      <Text style={[s.td, { flex: 1.6 }]}>{t.servicio}</Text>
                      <Text style={[s.td, { flex: 1.8, fontFamily: FONT_BOLD }]}>{fechaLarga(t.fecha_completado)}</Text>
                      <Text style={[s.td, { flex: 0.8, textAlign: "right", fontFamily: "Courier" }]}>{hora(t.fecha_completado)}</Text>
                      <Text style={[s.td, { flex: 1.4, color: COL.muted }]}>{fechaLarga(t.fecha_programada)}</Text>
                      <Text style={[s.td, { flex: 0.7, textAlign: "right", fontFamily: "Courier" }]}>{t.duracion_dias}</Text>
                      <Text style={[s.td, { flex: 1.5 }]}>{t.tecnico ?? "—"}</Text>
                      <Text style={[s.td, { flex: 1.5 }]}>
                        {t.firmado_at ? `${t.firmado_por ?? "Cliente"} · ${fechaLarga(t.firmado_at)}` : "Sin firma registrada"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ))}

        {data.filas.length === 0 && (
          <Text style={{ fontSize: 8, color: COL.muted }}>
            No hay trabajos finalizados que coincidan con los filtros seleccionados.
          </Text>
        )}

        <PageFooterView data={data} />
      </Page>
    </Document>
  );
}
