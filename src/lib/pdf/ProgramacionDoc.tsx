import { Document, Page, Text, View, StyleSheet, Image, Font } from "@react-pdf/renderer";
import { isoWeek, isoWeekFromISODate } from "@/lib/semana-iso";
import { BRAND_LOGO_URLS } from "@/components/BrandLogo";
import { nombreMes } from "@/lib/nombre-mes";
import { colorCliente } from "@/lib/color-cliente";

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
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  pausada_at?: string | null;
  planta_nombre?: string | null;
  servicio: string;
  estado: string;
  fecha_programada: string;
  duracion_dias?: number | null;
};

export type CalendarItem = {
  id: string;
  folio: string;
  servicio: string;
  estado: string;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  pausada?: boolean;
  planta_nombre?: string | null;
  hora?: string | null;
  dia_idx?: number | null;
  duracion?: number | null;
};

export type CalendarDia = {
  fecha: string; // YYYY-MM-DD
  in_month: boolean;
  feriado: boolean;
  /** Solo PDF de cliente: fecha ocupada por otro cliente (sin ningún dato de esa OT). */
  no_disponible?: boolean;
  items: CalendarItem[];
};

export type CalendarSemana = {
  semana_numero: number;
  dias: CalendarDia[]; // 5 días Lun-Vie
};

export type ProgramacionData = {
  vista: "semana" | "mes" | "anio";
  headerTitle: string;
  trabajos: ProgramacionTrabajo[];
  /** Días L-V a mostrar en la vista semana (5 celdas). */
  semana_dias?: CalendarDia[];
  /** Semanas del mes (rows) para la vista mes; cada semana con 5 días L-V. */
  mes_semanas?: CalendarSemana[];
  /** Etiquetas de columna a mostrar en la vista mes (LUN, MAR...). */
  mes_columnas?: string[];
  /** Vista año: marcas de cliente por día (YYYY-MM-DD). */
  anio_dias?: Record<string, { cliente_id: string | null; cliente_nombre: string | null }[]>;
  anio?: number;
  /** Solo PDF de cliente: fechas (YYYY-MM-DD) ocupadas por otros clientes. */
  anio_no_disponible?: string[];
  filtros?: { label: string; value: string }[];
  paper: "A4" | "A3";
  orientation: "landscape" | "portrait";
  emitido_at: string;
  documento_id?: string;
  documento_codigo?: string;
  documento_version?: string;
  documento_clasificacion?: string;
  /** Título del documento (por defecto "Programación de trabajos"). */
  doc_titulo?: string;
  /** Etiqueta del encabezado (por defecto "EA Service Connect · Programación"). */
  doc_header?: string;
  /** Palabra usada en el total ("trabajo"/"actividad"). */
  doc_unidad?: string;
  /** Etiquetas de columnas de las tablas. */
  labels?: { ot?: string; cliente?: string; planta?: string; servicio?: string };
};

const MORE_H_STYLE = 9;
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
  // --- Calendar grids ---
  calWrap: { borderWidth: 0.5, borderColor: COL.border, borderRadius: 2 },
  calHeaderRow: { flexDirection: "row", backgroundColor: COL.bg },
  calHeaderCell: {
    fontSize: 7, fontFamily: FONT_BOLD, color: "#fff",
    textAlign: "center", paddingVertical: 4, paddingHorizontal: 2,
    borderRightWidth: 0.5, borderRightColor: "#ffffff30",
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  calWeekRow: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: COL.border },
  calCell: {
    borderRightWidth: 0.5, borderRightColor: COL.border,
    padding: 3, overflow: "hidden",
  },
  calCellOut: { backgroundColor: "#f1f5f9" },
  calCellHoliday: { backgroundColor: "#fdf2f2" },
  calDayNum: {
    fontSize: 7.5, color: COL.muted, fontFamily: FONT_BOLD,
    marginBottom: 2,
  },
  calDayNumOut: { color: "#cbd5e1" },
  calHolidayTag: { fontSize: 5.5, color: "#b91c1c", fontFamily: FONT_BOLD, letterSpacing: 0.5, marginLeft: 3 },
  calWeekLabel: {
    fontSize: 6.5, color: COL.muted, fontFamily: FONT_BOLD,
    textAlign: "center", backgroundColor: "#f8fafc",
    borderRightWidth: 0.5, borderRightColor: COL.border,
    paddingVertical: 6,
  },
  eventCard: {
    borderRadius: 2, paddingVertical: 2, paddingHorizontal: 3, marginBottom: 2,
    borderLeftWidth: 2, overflow: "hidden",
  },
  calCellWeekend: { backgroundColor: "#f3f4f6" },
  notaDomingo: { fontSize: 6, color: COL.muted, fontFamily: FONT_BOLD },
  masLinea: { fontSize: 6.5, color: COL.bg, fontFamily: FONT_BOLD, height: MORE_H_STYLE, paddingTop: 1 },
  eventUna: { fontSize: 6.2, color: COL.text, lineHeight: 1.15, maxLines: 1, textOverflow: "ellipsis" },
  eventMarca: { fontFamily: FONT_BOLD, color: COL.text },
  leyenda: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: 6 },
  leyendaTitulo: { fontSize: 6.5, fontFamily: FONT_BOLD, color: COL.bg, marginRight: 6, height: 10, paddingTop: 1.5 },
  leyendaItem: { flexDirection: "row", alignItems: "center", marginRight: 10, height: 10 },
  leyendaMuestra: { width: 6, height: 6, borderRadius: 1, marginRight: 3 },
  leyendaTexto: { fontSize: 6.5, color: COL.text },
  miniMes: { borderWidth: 0.5, borderColor: COL.border, borderRadius: 2 },
  miniTitulo: { fontSize: 7.5, fontFamily: FONT_BOLD, color: COL.bg, height: 12, paddingTop: 2, paddingLeft: 3 },
  miniHead: { fontSize: 6, color: "#fff", fontFamily: FONT_BOLD, textAlign: "center", paddingTop: 1.5 },
  miniSem: { fontSize: 6, color: COL.muted, textAlign: "center", paddingTop: 1, backgroundColor: "#f8fafc" },
  miniNum: { fontSize: 6, color: COL.text },
  miniMas: { fontSize: 6, color: COL.text, fontFamily: FONT_BOLD, marginLeft: 0.5 },
  eventPlanta: { fontSize: 6.4, fontFamily: FONT_BOLD, color: COL.text, lineHeight: 1.15, maxLines: 1, textOverflow: "ellipsis" },
  eventLine: { fontSize: 6.2, color: COL.text, lineHeight: 1.15, maxLines: 1, textOverflow: "ellipsis" },
  eventTime: { fontSize: 6, color: COL.muted, marginBottom: 1 },
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
function estadoTint(e: string) {
  switch (String(e ?? "").toLowerCase()) {
    case "completado": return { bg: "#ECFDF5", border: "#10B981" };
    case "en_progreso":
    case "en progreso": return { bg: "#EFF6FF", border: "#3B82F6" };
    case "cancelado": return { bg: "#FEF2F2", border: "#EF4444" };
    default: return { bg: COL.primarySoft, border: COL.primary };
  }
}
function fmtColHeaderSemana(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-SV", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase();
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
            <Text style={s.headerTitle}>{data.doc_header ?? "EA Service Connect · Programación"}</Text>
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
  const clientes = clientesEnRango(data);
  const alto = altoDisponible(data, clientes.length);
  return (
    <Document title={`Programación · ${data.headerTitle}`} author="EA Service Connect">
      <Page size={size} orientation={orientation} style={s.page}>
        <PageChrome data={data} />
        <Text style={s.title}>{data.doc_titulo ?? "Programación de trabajos"}</Text>
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
        {data.vista !== "anio" && <LeyendaClientes clientes={clientes} noDisponible={hayNoDisponible(data)} />}
        <Text style={s.totalLine}>{data.trabajos.length} {data.doc_unidad ?? "trabajo"}{data.trabajos.length === 1 ? "" : "s"} en el rango seleccionado.</Text>

        {data.trabajos.length === 0 && data.vista !== "anio" && <Text style={s.empty}>Sin registros programados.</Text>}

        {data.vista === "semana" && data.semana_dias
          ? <SemanaGrid dias={data.semana_dias} alto={alto} />
          : data.vista === "mes" && data.mes_semanas
          ? <MesGrid semanas={data.mes_semanas} columnas={data.mes_columnas ?? ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"]} alto={alto} />
          : data.vista === "anio" && data.anio_dias
          ? <AnioMiniCalendarios data={data} alto={alto} clientes={clientes} />
          : <DiaSecciones items={data.trabajos} labels={data.labels} />
        }
      </Page>
    </Document>
  );
}

// ============== Geometría de una sola página ==============
const PAGE_PT: Record<"A4" | "A3", [number, number]> = { A4: [595.28, 841.89], A3: [841.89, 1190.55] };
const PAD_TOP = 84, PAD_BOTTOM = 60, PAD_X = 40;
const HEADER_ROW_H = 14;
/** Tarjeta compacta: alto fijo + separación (Semana 2 líneas, Mes 1 línea). */
const CARD = { semana: { h: 18.5, gap: 1.5, pad: 2 }, mes: { h: 9.5, gap: 1.5, pad: 1 } } as const;
const MORE_H = 9;
const NO_DISP_H = 10;
const ROJO = { fondo: "#FEE2E2", borde: "#DC2626", texto: "#991B1B" };

function NoDisponible() {
  return (
    <View style={{ height: NO_DISP_H - 1.5, marginBottom: 1.5, backgroundColor: ROJO.fondo, borderLeftWidth: 2, borderLeftColor: ROJO.borde, borderTopWidth: 0.75, borderTopColor: ROJO.borde, paddingHorizontal: 3, paddingTop: 1 }} wrap={false}>
      <Text style={{ fontSize: 6, color: ROJO.texto, fontFamily: FONT_BOLD }}>No disponible</Text>
    </View>
  );
}

function hayNoDisponible(data: ProgramacionData) {
  return !!(data.anio_no_disponible?.length
    || data.semana_dias?.some((d) => d.no_disponible)
    || data.mes_semanas?.some((w) => w.dias.some((d) => d.no_disponible)));
}

function paginaUtil(data: ProgramacionData) {
  const [w, h] = PAGE_PT[data.paper];
  const land = data.orientation === "landscape";
  const W = land ? h : w, H = land ? w : h;
  return { ancho: W - PAD_X * 2, alto: H - PAD_TOP - PAD_BOTTOM };
}

type ClienteLeyenda = { key: string; nombre: string; color: string };

function claveCliente(id?: string | null, nombre?: string | null) {
  return id ?? nombre ?? "—";
}

function clientesEnRango(data: ProgramacionData): ClienteLeyenda[] {
  const map = new Map<string, ClienteLeyenda>();
  data.trabajos.forEach((t) => {
    const key = claveCliente(t.cliente_id, t.cliente_nombre);
    if (!map.has(key)) map.set(key, { key, nombre: t.cliente_nombre ?? "—", color: colorPdf(key) });
  });
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function lineasLeyenda(clientes: ClienteLeyenda[], ancho: number, extra = false) {
  if (extra) clientes = [...clientes, { key: "_nd", nombre: "No disponible: fecha ocupada", color: "" }];
  if (clientes.length === 0) return 0;
  let lineas = 1, x = 34; // "Clientes:"
  clientes.forEach((c) => {
    const w = 6 + 3 + c.nombre.length * 3.6 + 10;
    if (x + w > ancho) { lineas++; x = 0; }
    x += w;
  });
  return lineas;
}

/** Alto disponible para el calendario = página − márgenes − encabezado/pie − título/filtros/leyenda. */
function altoDisponible(data: ProgramacionData, _n: number) {
  const { ancho, alto } = paginaUtil(data);
  const clientes = clientesEnRango(data);
  const bloqueTitulo = 16 + 10 + 16 + 18; // título, regla, subtítulo, total
  const filtros = data.filtros && data.filtros.length > 0 ? 21 : 0;
  const leyenda = lineasLeyenda(clientes, ancho, hayNoDisponible(data)) * 10 + 6;
  const vacio = data.trabajos.length === 0 && data.vista !== "anio" ? 20 : 0;
  return alto - bloqueTitulo - filtros - leyenda - vacio - 10;
}

/** Cuántas tarjetas mostrar en una celda; si no caben todas, deja sitio para "+N más". */
export function tarjetasVisibles(n: number, altoInterior: number, mode: "semana" | "mes") {
  const slot = CARD[mode].h + CARD[mode].gap;
  if (n * slot <= altoInterior) return n;
  return Math.max(0, Math.floor((altoInterior - MORE_H) / slot));
}

// ============== Color por cliente (misma función que la app) ==============
function hslToHex(h: number, sPct: number, lPct: number) {
  const s2 = sPct / 100, l = lPct / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s2 * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}
function aHex(c: string) {
  const m = c.match(/hsl\(\s*([\d.]+)[ ,]+([\d.]+)%[ ,]+([\d.]+)%/i);
  if (m) return hslToHex(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("");
  return c;
}
export function colorPdf(key: string) {
  return aHex(colorCliente(key));
}
/** Mezcla con blanco: fondo muy claro para que el texto oscuro mantenga contraste. */
function suave(hex: string, alpha = 0.16) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(255 - (255 - v) * alpha));
  return "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function estadoMarca(it: { estado: string; pausada?: boolean }) {
  if (it.pausada) return "En pausa";
  switch (String(it.estado ?? "").toLowerCase()) {
    case "en_progreso": case "en progreso": return "En curso";
    case "completado": return "Completado";
    case "cancelado": return "Cancelado";
    default: return null;
  }
}

function diaSemana(fecha: string) { return new Date(fecha + "T12:00:00").getDay(); }
function fondoDia(d: CalendarDia) {
  if (d.feriado) return s.calCellHoliday;
  if (!d.in_month) return s.calCellOut;
  const dow = diaSemana(d.fecha);
  return dow === 0 || dow === 6 ? s.calCellWeekend : null;
}

function LeyendaClientes({ clientes, noDisponible }: { clientes: ClienteLeyenda[]; noDisponible?: boolean }) {
  if (clientes.length === 0 && !noDisponible) return null;
  return (
    <View style={s.leyenda}>
      <Text style={s.leyendaTitulo}>Clientes:</Text>
      {clientes.map((c) => (
        <View key={c.key} style={s.leyendaItem}>
          <View style={[s.leyendaMuestra, { backgroundColor: c.color }]} />
          <Text style={s.leyendaTexto}>{c.nombre}</Text>
        </View>
      ))}
      {noDisponible && (
        <View style={s.leyendaItem}>
          <View style={[s.leyendaMuestra, { backgroundColor: ROJO.borde }]} />
          <Text style={[s.leyendaTexto, { color: ROJO.texto }]}>No disponible: fecha ocupada</Text>
        </View>
      )}
    </View>
  );
}

function MasLinea({ n }: { n: number }) {
  if (n <= 0) return null;
  return <Text style={s.masLinea}>+{n} más</Text>;
}

// ============== Vista Semana (7 columnas, una fila) ==============
function SemanaGrid({ dias, alto }: { dias: CalendarDia[]; alto: number }) {
  const colW = `${100 / dias.length}%`;
  const altoFila = alto - HEADER_ROW_H;
  return (
    <View style={s.calWrap} wrap={false}>
      <View style={s.calHeaderRow}>
        {dias.map((d) => (
          <Text key={d.fecha} style={[s.calHeaderCell, { width: colW }]}>{fmtColHeaderSemana(d.fecha)}</Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", height: altoFila }}>
        {dias.map((d) => {
          const notas = (d.feriado ? 8 : 0) + (d.no_disponible ? NO_DISP_H : 0);
          const visibles = tarjetasVisibles(d.items.length, altoFila - 6 - notas, "semana");
          const fondo = fondoDia(d);
          return (
            <View key={d.fecha} style={[s.calCell, { width: colW, height: altoFila }, ...(fondo ? [fondo] : [])]}>
              {d.feriado && <Text style={[s.calHolidayTag, { marginLeft: 0, height: 8 }]}>Feriado</Text>}
              {d.no_disponible && <NoDisponible />}
              {d.items.length === 0 && <Text style={{ fontSize: 8, color: "#cbd5e1", textAlign: "center", marginTop: 6 }}>—</Text>}
              {d.items.slice(0, visibles).map((it, i) => <EventoCard key={i} it={it} mode="semana" />)}
              <MasLinea n={d.items.length - visibles} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ============== Vista Mes (semanas × 7 columnas) ==============
function MesGrid({ semanas, columnas, alto }: { semanas: CalendarSemana[]; columnas: string[]; alto: number }) {
  const labelW = "5%";
  const colW = `${(100 - 5) / columnas.length}%`;
  const altoFila = (alto - HEADER_ROW_H) / Math.max(1, semanas.length);
  const interior = altoFila - 6 - 11;
  return (
    <View style={s.calWrap} wrap={false}>
      <View style={s.calHeaderRow}>
        <Text style={[s.calHeaderCell, { width: labelW }]}>Sem.</Text>
        {columnas.map((c) => (
          <Text key={c} style={[s.calHeaderCell, { width: colW }]}>{c}</Text>
        ))}
      </View>
      {semanas.map((w, wi) => (
        <View key={wi} style={[s.calWeekRow, { height: altoFila }]}>
          <Text style={[s.calWeekLabel, { width: labelW }]}>S{w.semana_numero}</Text>
          {w.dias.map((d) => {
            const visibles = tarjetasVisibles(d.items.length, interior - (d.no_disponible ? NO_DISP_H : 0), "mes");
            const fondo = fondoDia(d);
            return (
              <View key={d.fecha} style={[s.calCell, { width: colW, height: altoFila }, ...(fondo ? [fondo] : [])]}>
                <View style={{ flexDirection: "row", alignItems: "center", height: 11 }}>
                  <Text style={[s.calDayNum, { marginBottom: 0 }, ...(!d.in_month ? [s.calDayNumOut] : [])]}>
                    {Number(d.fecha.slice(-2))}
                  </Text>
                  {d.feriado && <Text style={s.calHolidayTag}>FERIADO</Text>}
                </View>
                {d.no_disponible && <NoDisponible />}
                {d.items.slice(0, visibles).map((it, i) => <EventoCard key={i} it={it} mode="mes" />)}
                <MasLinea n={d.items.length - visibles} />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function EventoCard({ it, mode }: { it: CalendarItem; mode: "semana" | "mes" }) {
  const color = colorPdf(claveCliente(it.cliente_id, it.cliente_nombre));
  const marca = estadoMarca(it);
  const dia = (it.duracion ?? 1) > 1 && it.dia_idx != null ? ` · d${(it.dia_idx ?? 0) + 1}/${it.duracion}` : "";
  const box = [s.eventCard, { height: CARD[mode].h, paddingVertical: CARD[mode].pad, marginBottom: CARD[mode].gap, backgroundColor: suave(color), borderLeftColor: color }];
  if (mode === "mes") {
    return (
      <View style={[...box, { flexDirection: "row", alignItems: "center" }]} wrap={false}>
        <Text style={[s.eventUna, { flex: 1 }]}>
          <Text style={{ fontFamily: FONT_BOLD }}>{it.planta_nombre ?? "—"}</Text> · {it.servicio}{dia}
        </Text>
        {marca ? <Text style={[s.eventUna, s.eventMarca, { marginLeft: 2 }]}>{marca}</Text> : null}
      </View>
    );
  }
  return (
    <View style={box} wrap={false}>
      <Text style={s.eventPlanta}>
        {it.hora && !/^12:00\s*a/i.test(it.hora) && it.hora !== "00:00" ? `${it.hora} · ` : ""}{it.folio ? `${it.folio} · ` : ""}{it.servicio}
      </Text>
      <Text style={s.eventLine}>
        {marca ? <Text style={s.eventMarca}>{marca} · </Text> : null}{it.planta_nombre ?? "—"}{dia}
      </Text>
    </View>
  );
}

// ============== Vista Año (12 mini calendarios) ==============
const LETRAS = ["L", "M", "M", "J", "V", "S", "D"];
function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AnioMiniCalendarios({ data, alto, clientes }: { data: ProgramacionData; alto: number; clientes: ClienteLeyenda[] }) {
  const { ancho } = paginaUtil(data);
  const land = data.orientation === "landscape";
  const cols = land ? 4 : 3, rows = land ? 3 : 4, gap = 8;
  const leyendaH = lineasLeyenda(clientes, ancho, hayNoDisponible(data)) * 10 + 6;
  const altoGrid = alto - leyendaH;
  const mw = (ancho - gap * (cols - 1)) / cols;
  const mh = (altoGrid - gap * (rows - 1)) / rows;
  const year = data.anio ?? new Date().getFullYear();
  const filaH = (mh - 12 - 9 - 2) / 6;
  const cellW = mw / 8;
  const noDisp = data.anio_no_disponible ? new Set(data.anio_no_disponible) : null;
  return (
    <View wrap={false}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", width: ancho, height: altoGrid }}>
        {Array.from({ length: 12 }, (_, m) => {
          const first = new Date(year, m, 1);
          const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
          const semanas = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start); d.setDate(start.getDate() + w * 7 + i); return d;
          }));
          return (
            <View key={m} style={[s.miniMes, { width: mw, height: mh, marginRight: (m % cols) === cols - 1 ? 0 : gap, marginBottom: Math.floor(m / cols) === rows - 1 ? 0 : gap }]}>
              <Text style={s.miniTitulo}>{nombreMes(m)} {year}</Text>
              <View style={{ flexDirection: "row", height: 9, backgroundColor: COL.bg }}>
                <Text style={[s.miniHead, { width: cellW }]}>Sem</Text>
                {LETRAS.map((l, i) => <Text key={i} style={[s.miniHead, { width: cellW }]}>{l}</Text>)}
              </View>
              {semanas.map((row, wi) => (
                <View key={wi} style={{ flexDirection: "row", height: filaH, borderTopWidth: 0.5, borderTopColor: COL.border }}>
                  <Text style={[s.miniSem, { width: cellW }]}>{row.some((d) => d.getMonth() === m) ? isoWeek(row[0]) : ""}</Text>
                  {row.map((d, i) => {
                    const en = d.getMonth() === m;
                    const marcas = en ? (data.anio_dias?.[isoLocal(d)] ?? []) : [];
                    const ocupado = en && !!noDisp?.has(isoLocal(d));
                    const fondo = en && (i >= 5) ? { backgroundColor: "#f3f4f6" } : null;
                    return (
                      <View key={i} style={[{ width: cellW, height: filaH, paddingTop: 1, alignItems: "center" }, ...(fondo ? [fondo] : [])]}>
                        {en && <Text style={s.miniNum}>{d.getDate()}</Text>}
                        {ocupado && <View style={{ width: "70%", height: 1.6, backgroundColor: ROJO.borde, marginTop: 0.3 }} />}
                        {marcas.length > 0 && (
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 0.5 }}>
                            {marcas.slice(0, 3).map((mk, k) => (
                              <View key={k} style={{ width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 0.4, backgroundColor: colorPdf(claveCliente(mk.cliente_id, mk.cliente_nombre)) }} />
                            ))}
                            {marcas.length > 3 && <Text style={s.miniMas}>+</Text>}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })}
      </View>
      <View style={{ marginTop: 6 }}><LeyendaClientes clientes={clientes} noDisponible={hayNoDisponible(data)} /></View>
    </View>
  );
}

/** Para verificación: cuántas celdas muestran "+N más" con la geometría del PDF. */
export function resumenDesbordes(data: ProgramacionData) {
  const alto = altoDisponible(data, 0);
  let celdas = 0;
  if (data.vista === "semana" && data.semana_dias) {
    const fila = alto - HEADER_ROW_H;
    data.semana_dias.forEach((d) => {
      const notas = (d.feriado ? 8 : 0) + (d.no_disponible ? NO_DISP_H : 0);
      if (tarjetasVisibles(d.items.length, fila - 6 - notas, "semana") < d.items.length) celdas++;
    });
  } else if (data.vista === "mes" && data.mes_semanas) {
    const fila = (alto - HEADER_ROW_H) / Math.max(1, data.mes_semanas.length);
    data.mes_semanas.forEach((w) => w.dias.forEach((d) => {
      if (tarjetasVisibles(d.items.length, fila - 6 - 11 - (d.no_disponible ? NO_DISP_H : 0), "mes") < d.items.length) celdas++;
    }));
  } else if (data.anio_dias) {
    celdas = Object.values(data.anio_dias).filter((a) => a.length > 3).length;
  }
  return { celdas, colores: clientesEnRango(data) };
}

function DiaSecciones({ items, labels }: { items: ProgramacionTrabajo[]; labels?: ProgramacionData["labels"] }) {
  const grupos = agruparPorFecha(items);
  return (
    <>
      {grupos.map((g) => (
        <View key={g.fecha} style={s.dayBlock} wrap={false}>
          <Text style={s.dayTitle}>{fmtDate(g.fecha)} · Semana ISO {isoWeekFromISODate(g.fecha)}</Text>
          <View style={s.table}>
            <View style={s.tr}>
              <Text style={[s.th, { width: "9%" }]}>Hora</Text>
              <Text style={[s.th, { width: "14%" }]}>{labels?.ot ?? "OT"}</Text>
              <Text style={[s.th, { width: "24%" }]}>{labels?.cliente ?? "Cliente"}</Text>
              <Text style={[s.th, { width: "23%" }]}>{labels?.planta ?? "Planta"}</Text>
              <Text style={[s.th, { width: "20%" }]}>{labels?.servicio ?? "Servicio"}</Text>
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

