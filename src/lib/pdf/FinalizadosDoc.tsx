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
  primarySoft: "#E8EEF8",
  text: "#1f2937",
  muted: "#64748b",
  border: "#cbd5e1",
  panel: "#f8fafc",
  ok: "#059669",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 96,
    paddingBottom: 78,
    paddingLeft: 48,
    paddingRight: 48,
    fontSize: 10,
    color: COL.text,
    fontFamily: FONT_REG,
    lineHeight: 1.35,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: COL.bg,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerText: {
    flexDirection: "column",
  },
  headerTitle: {
    fontSize: 9,
    color: COL.bg,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: FONT_BOLD,
  },
  headerSub: {
    fontSize: 8,
    color: COL.muted,
    marginTop: 2,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  headerPeriod: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    color: COL.text,
    textAlign: "right",
  },
  headerMeta: {
    fontSize: 7.5,
    color: COL.muted,
    textAlign: "right",
    marginTop: 2,
  },
  logoEa: { height: 28, objectFit: "contain" },
  footerLogoPv: { height: 12, objectFit: "contain" },
  footerLogoCh: { height: 10, objectFit: "contain" },
  pageFooter: {
    position: "absolute",
    bottom: 26,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 7.5,
    color: COL.muted,
    borderTopWidth: 0.75,
    borderTopColor: COL.primary,
    paddingTop: 6,
  },
  pageFooterLogos: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: {
    fontSize: 18,
    fontFamily: FONT_BOLD,
    marginBottom: 4,
    color: COL.bg,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 9.5,
    color: COL.muted,
    marginBottom: 14,
  },
  titleRule: {
    width: 40,
    height: 2.5,
    backgroundColor: COL.primary,
    marginBottom: 16,
  },
  filtros: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
    padding: 8,
    backgroundColor: COL.panel,
    borderWidth: 0.75,
    borderColor: COL.border,
    borderRadius: 4,
  },
  filtro: { fontSize: 8, color: COL.muted },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    padding: 10,
    borderWidth: 0.75,
    borderColor: COL.border,
    borderLeftWidth: 3,
    borderLeftColor: COL.bg,
    borderRadius: 4,
    backgroundColor: COL.panel,
  },
  summaryLabel: {
    fontSize: 7.5,
    color: COL.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 3,
    fontFamily: FONT_BOLD,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: FONT_BOLD,
    color: COL.bg,
  },
  clienteBlock: {
    marginBottom: 18,
  },
  clienteHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COL.bg,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 8,
  },
  clienteName: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    color: "#fff",
  },
  clienteMeta: {
    fontSize: 8,
    color: "#e2e8f0",
  },
  plantaBlock: {
    marginBottom: 10,
    paddingLeft: 8,
  },
  plantaName: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    color: COL.text,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: COL.border,
  },
  fechasRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  fechaPill: {
    fontSize: 9,
    color: COL.text,
    backgroundColor: COL.primarySoft,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  empty: {
    fontSize: 9.5,
    color: COL.muted,
    textAlign: "center",
    marginTop: 30,
  },
  note: {
    fontSize: 8,
    color: COL.muted,
    marginTop: 18,
    textAlign: "center",
  },
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
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function PageHeaderView({ data }: { data: FinalizadosData }) {
  const codigo = `${data.documento_codigo ?? "EA-FIN"} · v${data.documento_version ?? "1.0"}`;
  return (
    <View fixed style={{ position: "absolute", top: 28, left: 48, right: 48 }}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Image src={LOGO_EA()} style={s.logoEa} />
          <View style={s.headerText}>
            <Text style={s.headerTitle}>EA SERVICE AND CONSULTING</Text>
            <Text style={s.headerSub}>Trabajos finalizados por cliente</Text>
          </View>
        </View>
        <View style={s.headerRight}>
          <Text style={s.headerPeriod}>{data.periodo}</Text>
          <Text style={s.headerMeta}>Emitido: {data.emitido_at}</Text>
          <Text style={s.headerMeta}>{codigo}</Text>
        </View>
      </View>
    </View>
  );
}

function PageFooterView({ data }: { data: FinalizadosData }) {
  const docId = data.documento_id ? data.documento_id.slice(0, 8).toUpperCase() : "—";
  return (
    <View style={s.pageFooter} fixed>
      <View style={s.pageFooterLogos}>
        <Image src={LOGO_PVSTOP()} style={s.footerLogoPv} />
        <Image src={LOGO_CHEMITEK()} style={s.footerLogoCh} />
      </View>
      <View style={{ flexDirection: "column", flex: 1, paddingLeft: 12 }}>
        <Text>ID Doc: {docId}</Text>
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
          fechas: [...trabajos]
            .sort((a, b) => new Date(b.fecha_completado).getTime() - new Date(a.fecha_completado).getTime())
            .map((t) => fechaLarga(t.fecha_completado)),
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
      <Page size="A4" orientation="portrait" style={s.page}>
        <PageHeaderView data={data} />
        <Text style={s.title}>Trabajos finalizados por cliente</Text>
        <Text style={s.subtitle}>Planta y fecha de finalización de los servicios ejecutados · {data.periodo}</Text>
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
                {g.plantas.length} planta(s) · {g.total} servicio(s)
              </Text>
            </View>
            {g.plantas.map((p) => (
              <View key={p.planta} style={s.plantaBlock}>
                <Text style={s.plantaName}>{p.planta}</Text>
                <View style={s.fechasRow}>
                  {p.fechas.map((f, i) => (
                    <Text key={i} style={s.fechaPill}>
                      {f}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ))}

        {data.filas.length === 0 && (
          <Text style={s.empty}>
            No hay trabajos finalizados que coincidan con los filtros seleccionados.
          </Text>
        )}

        {data.filas.length > 0 && (
          <Text style={s.note}>
            Este documento muestra únicamente la planta y la fecha de finalización de cada servicio.
          </Text>
        )}

        <PageFooterView data={data} />
      </Page>
    </Document>
  );
}
