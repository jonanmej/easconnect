import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { BRAND_LOGO_URLS } from "@/components/BrandLogo";

function absUrl(path: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://easconnect.lovable.app";
  return `${origin}${path}`;
}
const LOGO_EA = () => absUrl(BRAND_LOGO_URLS["ea-main"].light);
const LOGO_PVSTOP = () => absUrl(BRAND_LOGO_URLS.pvstop.light);
const LOGO_CHEMITEK = () => absUrl(BRAND_LOGO_URLS.chemitek.light);

const FONT_REG = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

const COL = {
  bg: "#2E4A87",
  primary: "#5B7FBF",
  text: "#1f2937",
  muted: "#64748b",
  border: "#e2e8f0",
  panel: "#f8fafc",
  danger: "#ef4444",
};

const s = StyleSheet.create({
  page: { paddingTop: 88, paddingBottom: 68, paddingLeft: 48, paddingRight: 44, fontSize: 9, color: COL.text, fontFamily: FONT_REG },
  header: { position: "absolute", top: 22, left: 48, right: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: COL.primary },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 },
  headerRight: { width: 160, alignItems: "flex-end" },
  headerTitle: { fontSize: 7.5, color: COL.bg, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: FONT_BOLD },
  headerSub: { fontSize: 7, color: COL.muted, textTransform: "uppercase", marginTop: 2 },
  headerRightTop: { fontSize: 8, color: COL.text, fontFamily: FONT_BOLD, textAlign: "right" },
  headerRightBot: { fontSize: 7, color: COL.muted, textAlign: "right", marginTop: 2 },
  logoEa: { height: 32, objectFit: "contain", marginRight: 10 },
  footer: { position: "absolute", bottom: 22, left: 48, right: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 7, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 5 },
  footerLogos: { flexDirection: "row", alignItems: "center", gap: 10 },
  footerLogoPv: { height: 14, objectFit: "contain" },
  footerLogoCh: { height: 11, objectFit: "contain" },
  title: { fontSize: 16, fontFamily: FONT_BOLD, color: COL.bg, marginBottom: 2 },
  subtitle: { fontSize: 9, color: COL.muted, marginBottom: 10 },
  titleRule: { width: 36, height: 2, backgroundColor: COL.primary, marginBottom: 12 },
  metaBox: { borderWidth: 0.75, borderColor: COL.border, borderLeftWidth: 3, borderLeftColor: COL.primary, borderRadius: 3, backgroundColor: COL.panel, padding: 8, marginBottom: 12, flexDirection: "row", gap: 20 },
  metaCol: { flex: 1 },
  metaLabel: { fontSize: 7, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  metaValue: { fontSize: 9, fontFamily: FONT_BOLD, marginTop: 1 },
  table: { borderWidth: 1, borderColor: COL.border, borderRadius: 3 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  th: { padding: 5, fontSize: 7, fontFamily: FONT_BOLD, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase" },
  td: { padding: 5, fontSize: 8.5 },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  totalPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, backgroundColor: COL.bg, color: "#fff", fontSize: 10, fontFamily: FONT_BOLD },
  firmaBox: { marginTop: 30, flexDirection: "row", gap: 24 },
  firma: { flex: 1, borderTopWidth: 0.75, borderTopColor: COL.text, paddingTop: 4, fontSize: 8, color: COL.muted, textAlign: "center" },
});

export type OrdenCompraItem = {
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  cantidad_pedida: number;
  ubicacion?: string | null;
  proveedor?: string | null;
};

export type OrdenCompraData = {
  folio: string;
  fecha: string;
  solicitante: string;
  proveedor?: string | string[] | null;
  proveedores_detalle?: Array<{
    nombre: string;
    cotizacion_folio?: string | null;
    cotizacion_fecha?: string | null;
    cotizacion_monto?: number | null;
    cotizacion_url?: string | null;
  }> | null;
  notas?: string | null;
  items: OrdenCompraItem[];
  estado?: string | null;
};

export function OrdenCompraDoc({ data }: { data: OrdenCompraData }) {
  const totalItems = data.items.reduce((a, r) => a + Number(r.cantidad_pedida || 0), 0);
  const proveedores = Array.isArray(data.proveedor)
    ? data.proveedor.filter((p) => (p ?? "").trim() !== "")
    : data.proveedor && data.proveedor.trim() !== ""
      ? [data.proveedor]
      : [];
  const SIN_PROV = "Sin proveedor asignado";
  const grupos = data.items.reduce<Record<string, OrdenCompraItem[]>>((acc, it) => {
    const key = (it.proveedor ?? "").trim() || SIN_PROV;
    (acc[key] ||= []).push(it);
    return acc;
  }, {});
  const grupoNombres = Object.keys(grupos).sort((a, b) => {
    if (a === SIN_PROV) return 1;
    if (b === SIN_PROV) return -1;
    return a.localeCompare(b);
  });
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View fixed style={s.header}>
          <View style={s.headerLeft}>
            <Image src={LOGO_EA()} style={s.logoEa} />
            <View>
              <Text style={s.headerTitle}>EA Service and Consulting</Text>
              <Text style={s.headerSub}>Orden de compra · Bodega</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerRightTop}>Folio {data.folio}</Text>
            <Text style={s.headerRightBot}>{data.fecha}</Text>
            <Text style={s.headerRightBot}>EA-OC · v1.0</Text>
          </View>
        </View>

        <Text style={s.title}>Orden de Compra</Text>
        <Text style={s.subtitle}>
          {data.estado ? `Estado: ${data.estado.toUpperCase()} · ` : ""}
          Detalle de ítems solicitados agrupados por proveedor.
        </Text>
        <View style={s.titleRule} />

        <View style={s.metaBox}>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Solicitante</Text>
            <Text style={s.metaValue}>{data.solicitante}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>
              {proveedores.length > 1 ? "Proveedores sugeridos" : "Proveedor sugerido"}
            </Text>
            {proveedores.length === 0 ? (
              <Text style={s.metaValue}>Por definir</Text>
            ) : (
              proveedores.map((p, i) => (
                <Text key={i} style={s.metaValue}>
                  {proveedores.length > 1 ? `• ${p}` : p}
                </Text>
              ))
            )}
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Fecha de emisión</Text>
            <Text style={s.metaValue}>{data.fecha}</Text>
          </View>
        </View>

        {data.proveedores_detalle && data.proveedores_detalle.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 8, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
              Cotizaciones por proveedor
            </Text>
            <View style={{ borderWidth: 0.75, borderColor: COL.border, borderRadius: 3 }}>
              <View style={[s.tr, { backgroundColor: COL.bg }]}>
                <Text style={[s.th, { flex: 2 }]}>Proveedor</Text>
                <Text style={[s.th, { flex: 1.4 }]}>Cotización #</Text>
                <Text style={[s.th, { flex: 1.2 }]}>Fecha</Text>
                <Text style={[s.th, { flex: 1.2, textAlign: "right" }]}>Monto</Text>
                <Text style={[s.th, { flex: 2 }]}>Documento</Text>
              </View>
              {data.proveedores_detalle.map((p, i) => (
                <View key={i} style={[s.tr, { backgroundColor: i % 2 ? "#fff" : COL.panel }]}>
                  <Text style={[s.td, { flex: 2, fontFamily: FONT_BOLD }]}>{p.nombre}</Text>
                  <Text style={[s.td, { flex: 1.4 }]}>{p.cotizacion_folio || "—"}</Text>
                  <Text style={[s.td, { flex: 1.2 }]}>{p.cotizacion_fecha || "—"}</Text>
                  <Text style={[s.td, { flex: 1.2, textAlign: "right", fontFamily: FONT_BOLD }]}>
                    {p.cotizacion_monto != null ? `$ ${Number(p.cotizacion_monto).toFixed(2)}` : "—"}
                  </Text>
                  <Text style={[s.td, { flex: 2, color: p.cotizacion_url ? COL.primary : COL.muted }]}
                    src={p.cotizacion_url ?? undefined}>
                    {p.cotizacion_url ? "Ver cotización adjunta" : "Sin adjunto"}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {grupoNombres.map((prov) => {
          const filas = grupos[prov];
          const subtotal = filas.reduce((a, r) => a + Number(r.cantidad_pedida || 0), 0);
          return (
            <View key={prov} style={{ marginBottom: 12 }} wrap={false}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={{ fontSize: 9, fontFamily: FONT_BOLD, color: COL.bg, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Proveedor: {prov}
                </Text>
                <Text style={{ fontSize: 8, color: COL.muted }}>
                  {filas.length} ítem{filas.length === 1 ? "" : "s"} · {subtotal} un.
                </Text>
              </View>
              <View style={s.table}>
                <View style={[s.tr, { backgroundColor: COL.bg }]}>
                  <Text style={[s.th, { flex: 1.3 }]}>SKU</Text>
                  <Text style={[s.th, { flex: 3.2 }]}>Descripción</Text>
                  <Text style={[s.th, { flex: 1.2 }]}>Categoría</Text>
                  <Text style={[s.th, { flex: 0.9, textAlign: "right" }]}>Stock</Text>
                  <Text style={[s.th, { flex: 0.9, textAlign: "right" }]}>Mínimo</Text>
                  <Text style={[s.th, { flex: 1, textAlign: "right" }]}>A pedir</Text>
                  <Text style={[s.th, { flex: 0.7, textAlign: "center" }]}>Unidad</Text>
                </View>
                {filas.map((r, i) => {
                  const noInv = !r.sku || r.sku === "—";
                  return (
                    <View key={(r.sku || r.nombre) + i} style={[s.tr, { backgroundColor: i % 2 ? "#fff" : COL.panel }]}>
                      <Text style={[s.td, { flex: 1.3, fontFamily: FONT_BOLD, color: noInv ? COL.muted : COL.text }]}>{r.sku || "—"}</Text>
                      <Text style={[s.td, { flex: 3.2 }]}>{r.nombre}</Text>
                      <Text style={[s.td, { flex: 1.2, color: COL.muted }]}>{r.categoria}</Text>
                      <Text style={[s.td, { flex: 0.9, textAlign: "right", color: noInv ? COL.muted : COL.danger, fontFamily: FONT_BOLD }]}>{noInv ? "—" : r.stock_actual}</Text>
                      <Text style={[s.td, { flex: 0.9, textAlign: "right", color: COL.muted }]}>{noInv ? "—" : r.stock_minimo}</Text>
                      <Text style={[s.td, { flex: 1, textAlign: "right", fontFamily: FONT_BOLD }]}>{r.cantidad_pedida}</Text>
                      <Text style={[s.td, { flex: 0.7, textAlign: "center", color: COL.muted }]}>{r.unidad}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        <View style={s.totalRow}>
          <Text style={s.totalPill}>Total a solicitar: {totalItems} unidades · {data.items.length} SKU</Text>
        </View>

        {data.notas ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 8, color: COL.muted, textTransform: "uppercase", marginBottom: 3 }}>Notas</Text>
            <Text style={{ fontSize: 9, lineHeight: 1.4 }}>{data.notas}</Text>
          </View>
        ) : null}

        <View style={s.firmaBox}>
          <Text style={s.firma}>Solicitó · Bodega</Text>
          <Text style={s.firma}>Autorizó · Administración</Text>
          <Text style={s.firma}>Recibido · Proveedor</Text>
        </View>

        <View style={s.footer} fixed>
          <View style={s.footerLogos}>
            <Image src={LOGO_PVSTOP()} style={s.footerLogoPv} />
            <Image src={LOGO_CHEMITEK()} style={s.footerLogoCh} />
          </View>
          <Text>Documento generado por EA Service Connect</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}