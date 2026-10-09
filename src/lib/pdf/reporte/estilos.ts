import { StyleSheet, Font } from "@react-pdf/renderer";
import { BRAND_LOGO_URLS } from "@/components/BrandLogo";


/** Ancho útil de una página A4 con los márgenes del documento (96 / 54 pt). */
export const ANCHO_UTIL = 445;

export function absUrl(path: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://easconnect.lovable.app";
  return `${origin}${path}`;
}
export const LOGO_EA = () => absUrl(BRAND_LOGO_URLS["ea-main"].light);
export const LOGO_PVSTOP = () => absUrl(BRAND_LOGO_URLS.pvstop.light);
export const LOGO_CHEMITEK = () => absUrl(BRAND_LOGO_URLS.chemitek.light);

// ---------------------------------------------------------------------------
// Tipografía: forzamos Helvetica-Bold real (no "fake bold") y desactivamos
// hifenación automática para evitar cortes como "Man- tenimiento".
// ---------------------------------------------------------------------------
Font.registerHyphenationCallback((word) => [word]);

// Cabecera institucional: el logo EA aparece en el encabezado de cada
// página; los logos de PVSTOP y Chemitek se ubican en el pie institucional.

// Fuentes PDF estándar (Helvetica-Bold es una fuente real embebida en PDF,
// no negrita sintética). Esto garantiza nitidez en Acrobat, Chrome, Safari,
// Preview y visores móviles sin dependencias de red.
export const FONT_REG = "Helvetica";
export const FONT_BOLD = "Helvetica-Bold";
export const FONT_OBL = "Helvetica-Oblique";

// Paleta oficial EA Service & Consulting tomada del logotipo original
// (triángulo "play" en degradado azul cornflower sobre wordmark azul).
export const COL = {
  bg: "#2E4A87",          // Azul EA profundo (titulares, cabeceras de tabla)
  bgSoft: "#5B7FBF",      // Azul medio del triángulo
  primary: "#5B7FBF",     // Azul corporativo principal del logo EA
  primaryDeep: "#3B5EA8", // Azul profundo para bordes/acentos formales
  primarySoft: "#DDE6F4", // Azul muy claro (tono del triángulo claro)
  text: "#1f2937",
  muted: "#64748b",
  border: "#e2e8f0",
  panel: "#f8fafc",
  ok: "#10b981",
  danger: "#ef4444",
};

export const styles = StyleSheet.create({
  // Página A4 — márgenes pensados para perforar y anexar a AMPO (izq. amplio).
  // paddingTop reserva el alto de la cabecera fija (logo EA + meta),
  // paddingBottom reserva el pie con los logos institucionales secundarios.
  page: { paddingTop: 96, paddingBottom: 84, paddingLeft: 96, paddingRight: 54, fontSize: 10, color: COL.text, fontFamily: FONT_REG },
  // Portada
  cover: { padding: 0 },
  coverBar: { position: "absolute", top: 0, left: 0, right: 0, height: 10, backgroundColor: COL.primary },
  coverSide: { position: "absolute", top: 0, bottom: 0, left: 0, width: 14, backgroundColor: COL.bg },
 coverInner: { paddingTop: 90, paddingBottom: 110, paddingLeft: 108, paddingRight: 60 },
  brand: { flexDirection: "row", alignItems: "center", marginBottom: 90 },
  brandText: { fontSize: 15, fontFamily: FONT_BOLD, letterSpacing: 1, color: COL.bg, marginLeft: 14 },
  brandSub: { fontSize: 8, color: COL.muted, letterSpacing: 2, marginLeft: 14, marginTop: 2, textTransform: "uppercase" },
  coverTag: { fontSize: 9, color: COL.primaryDeep, letterSpacing: 2, marginBottom: 10, textTransform: "uppercase", fontFamily: FONT_BOLD },
  coverTitle: { fontSize: 28, fontFamily: FONT_BOLD, lineHeight: 1.25, marginBottom: 18, color: COL.bg, maxWidth: 430 },
  coverRule: { width: 60, height: 3, backgroundColor: COL.primary, marginBottom: 24 },
 coverMeta: { marginTop: 30, borderTopWidth: 1, borderTopColor: COL.border, paddingTop: 14 },
 metaRow: { flexDirection: "row", marginBottom: 5, alignItems: "flex-start" },
 metaLabel: { width: 110, fontSize: 8.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 1, paddingRight: 6 },
 metaValue: { flex: 1, fontSize: 10, fontFamily: FONT_BOLD, color: COL.text },
  coverFooter: { position: "absolute", bottom: 40, left: 108, right: 60, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 10 },

  // Contenido
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: COL.primary },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 12 },
  headerLeftText: { flex: 1 },
  headerRight: { width: 150, alignItems: "flex-end" },
  headerTitle: { fontSize: 7.5, color: COL.bg, textTransform: "uppercase", letterSpacing: 1, fontFamily: FONT_BOLD },
  headerSub: { fontSize: 7, color: COL.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 },
  headerRightTop: { fontSize: 8, color: COL.text, fontFamily: FONT_BOLD, textAlign: "right" },
  headerRightBot: { fontSize: 7.5, color: COL.muted, textAlign: "right", marginTop: 2, letterSpacing: 0.5 },
  pageTitle: { fontSize: 17, fontFamily: FONT_BOLD, marginBottom: 12, color: COL.bg },
  pageTitleRule: { width: 40, height: 2.5, backgroundColor: COL.primary, marginBottom: 14, marginTop: -8 },
  sectionTitle: { fontSize: 11.5, fontFamily: FONT_BOLD, marginTop: 16, marginBottom: 8, color: COL.bg, paddingBottom: 4, borderBottomWidth: 0.75, borderBottomColor: COL.primary },
  // Wrapper que agrupa "título + primer contenido" para que nunca se
  // separen entre páginas. El `minPresenceAhead` reserva espacio suficiente
  // debajo del título antes de permitir un salto de página.
  sectionBlock: { marginTop: 0 },
  paragraph: { fontSize: 10, lineHeight: 1.55, marginBottom: 8, color: "#1f2937", textAlign: "justify" },
  bullet: { flexDirection: "row", marginBottom: 5 },
  bulletDot: { width: 12, fontSize: 10, color: COL.primary, fontFamily: FONT_BOLD },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.5, textAlign: "justify" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  kpiCard: { width: "48%", padding: 10, borderWidth: 0.75, borderColor: COL.border, borderLeftWidth: 3, borderLeftColor: COL.primary, borderRadius: 3, backgroundColor: COL.panel },
  kpiLabel: { fontSize: 7.5, color: COL.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontFamily: FONT_BOLD },
  kpiValue: { fontSize: 16, fontFamily: FONT_BOLD, color: COL.bg },
  table: { borderWidth: 1, borderColor: COL.border, borderRadius: 3, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COL.border },
  trLast: { flexDirection: "row" },
  th: { padding: 6, fontSize: 8, fontFamily: FONT_BOLD, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase" },
  td: { padding: 5, fontSize: 8.5, lineHeight: 1.35 },
  // Variante compacta para tablas con muchas columnas (detalle diario de campo):
  // menos padding y tipografía más pequeña para que ningún encabezado ni valor
  // se recorte dentro de su celda.
  thSm: { paddingVertical: 4, paddingHorizontal: 2.5, fontSize: 6.4, fontFamily: FONT_BOLD, color: "#fff", backgroundColor: COL.bg, textTransform: "uppercase", lineHeight: 1.15 },
  tdSm: { paddingVertical: 4, paddingHorizontal: 2.5, fontSize: 7, lineHeight: 1.25 },
  pageFooter: { position: "absolute", bottom: 20, left: 96, right: 54, flexDirection: "column", fontSize: 6.8, color: COL.muted, borderTopWidth: 0.75, borderTopColor: COL.primary, paddingTop: 6 },
  pageFooterTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  pageFooterLogos: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0 },
  pageFooterMeta: { marginTop: 4, width: "100%" },
  pageFooterMetaLine: { fontSize: 6.6, lineHeight: 1.2 },
  pageFooterPage: { flexShrink: 0, textAlign: "right", width: 70, fontSize: 7 },
  evidGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3, marginTop: 2 },
  evidTile: {
    width: "50%",
    paddingHorizontal: 3,
    marginBottom: 8,
  },
  evidFrame: {
    borderWidth: 0.75,
    borderColor: COL.border,
    borderRadius: 3,
    padding: 3,
    backgroundColor: "#ffffff",
  },
  evidImgLandscape: { width: "100%", height: 150, objectFit: "cover", borderRadius: 2 },
  evidImgPortrait: { width: "100%", height: 210, objectFit: "cover", borderRadius: 2 },
  evidCaption: { fontSize: 7.5, color: COL.muted, marginTop: 4, lineHeight: 1.3 },
  badge: { fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, alignSelf: "flex-start", color: "#fff", marginBottom: 4 },
  // Gráficas
  chartBlock: { marginBottom: 14, padding: 10, borderWidth: 0.5, borderColor: COL.border, borderRadius: 3, backgroundColor: COL.panel },
  chartTitle: { fontSize: 10, fontFamily: FONT_BOLD, marginBottom: 2, color: COL.bg },
  chartCaption: { fontSize: 8, color: COL.muted, marginBottom: 8, fontFamily: FONT_OBL },
  chartRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  chartLabel: { width: 110, fontSize: 9, color: COL.text },
  chartTrack: { flex: 1, height: 10, backgroundColor: "#fff", borderWidth: 0.5, borderColor: COL.border, borderRadius: 2, overflow: "hidden" },
  chartBar: { height: "100%", backgroundColor: COL.primary },
  chartValue: { width: 60, textAlign: "right", fontSize: 9, color: COL.text, fontFamily: "Courier" },
  chartSource: { fontSize: 7, color: COL.muted, marginTop: 6, fontFamily: FONT_OBL },
});

// Logo institucional en la cabecera de cada página (solo EA).
export const brandStyles = StyleSheet.create({
  logoEa: { height: 34, objectFit: "contain" },
  footerLogoPv: { height: 16, objectFit: "contain" },
  footerLogoCh: { height: 12, objectFit: "contain" },
});
