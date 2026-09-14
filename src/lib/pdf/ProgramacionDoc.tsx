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

export type CalendarItem = {
  id: string;
  folio: string;
  servicio: string;
  estado: string;
  cliente_nombre?: string | null;
  planta_nombre?: string | null;
  hora?: string | null;
  dia_idx?: number | null;
  duracion?: number | null;
};

export type CalendarDia = {
  fecha: string; // YYYY-MM-DD
  in_month: boolean;
  feriado: boolean;
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
    padding: 3,
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
    borderLeftWidth: 2,
  },
  eventPlanta: { fontSize: 6.8, fontFamily: FONT_BOLD, color: COL.bg, lineHeight: 1.15 },
  eventLine: { fontSize: 6.3, color: COL.muted, lineHeight: 1.15 },
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
        <Text style={s.totalLine}>{data.trabajos.length} {data.doc_unidad ?? "trabajo"}{data.trabajos.length === 1 ? "" : "s"} en el rango seleccionado.</Text>

        {data.trabajos.length === 0 && <Text style={s.empty}>Sin registros programados.</Text>}

        {data.vista === "semana" && data.semana_dias
          ? <SemanaGrid dias={data.semana_dias} />
          : data.vista === "mes" && data.mes_semanas
          ? <MesGrid semanas={data.mes_semanas} columnas={data.mes_columnas ?? ["Lun","Mar","Mié","Jue","Vie"]} />
          : data.vista === "anio"
          ? <AnioSecciones data={data} />
          : <DiaSecciones items={data.trabajos} labels={data.labels} />
        }
      </Page>
    </Document>
  );
}

// ============== Vista Semana (grid L-V) ==============
function SemanaGrid({ dias }: { dias: CalendarDia[] }) {
  const colW = `${100 / dias.length}%`;
  return (
    <View style={s.calWrap}>
      <View style={s.calHeaderRow}>
        {dias.map((d) => (
          <Text key={d.fecha} style={[s.calHeaderCell, { width: colW }]}>{fmtColHeaderSemana(d.fecha)}</Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", minHeight: 340 }}>
        {dias.map((d) => (
          <View
            key={d.fecha}
            style={[s.calCell, { width: colW }, ...(d.feriado ? [s.calCellHoliday] : [])]}
          >
            {d.feriado && <Text style={[s.calHolidayTag, { marginLeft: 0, marginBottom: 2 }]}>Feriado</Text>}
            {d.items.length === 0 && <Text style={{ fontSize: 8, color: "#cbd5e1", textAlign: "center", marginTop: 6 }}>—</Text>}
            {d.items.map((it, i) => <EventoCard key={i} it={it} mode="semana" />)}
          </View>
        ))}
      </View>
    </View>
  );
}

// ============== Vista Mes (grid semanas x L-V) ==============
function MesGrid({ semanas, columnas }: { semanas: CalendarSemana[]; columnas: string[] }) {
  const labelW = "6%";
  const colW = `${(100 - 6) / columnas.length}%`;
  return (
    <View style={s.calWrap}>
      <View style={s.calHeaderRow}>
        <Text style={[s.calHeaderCell, { width: labelW }]}>Sem.</Text>
        {columnas.map((c) => (
          <Text key={c} style={[s.calHeaderCell, { width: colW }]}>{c}</Text>
        ))}
      </View>
      {semanas.map((w, wi) => (
        <View key={wi} style={s.calWeekRow} wrap={false}>
          <Text style={[s.calWeekLabel, { width: labelW }]}>S{w.semana_numero}</Text>
          {w.dias.map((d) => (
            <View
              key={d.fecha}
              style={[
                s.calCell,
                { width: colW, minHeight: 78 },
                ...(!d.in_month ? [s.calCellOut] : []),
                ...(d.feriado ? [s.calCellHoliday] : []),
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                <Text style={[s.calDayNum, ...(!d.in_month ? [s.calDayNumOut] : [])]}>
                  {Number(d.fecha.slice(-2))}
                </Text>
                {d.feriado && <Text style={s.calHolidayTag}>FERIADO</Text>}
              </View>
              {d.items.map((it, i) => <EventoCard key={i} it={it} mode="mes" />)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function EventoCard({ it, mode }: { it: CalendarItem; mode: "semana" | "mes" }) {
  const tint = estadoTint(it.estado);
  const dia = (it.duracion ?? 1) > 1 && it.dia_idx != null
    ? ` · d${(it.dia_idx ?? 0) + 1}/${it.duracion}`
    : "";
  return (
    <View style={[s.eventCard, { backgroundColor: tint.bg, borderLeftColor: tint.border }]} wrap={false}>
      {mode === "semana" && (it.hora || it.folio) ? (
        <Text style={s.eventTime}>
          {it.hora ?? ""}{it.hora && it.folio ? " · " : ""}{it.folio ?? ""}
        </Text>
      ) : null}
      <Text style={s.eventPlanta}>{it.servicio}</Text>
      <Text style={s.eventLine}>
        {it.planta_nombre ?? "—"}{dia}
      </Text>
    </View>
  );
}

function DiaSecciones({ items, labels }: { items: ProgramacionTrabajo[]; labels?: ProgramacionData["labels"] }) {
  const grupos = agruparPorFecha(items);
  return (
    <>
      {grupos.map((g) => (
        <View key={g.fecha} style={s.dayBlock} wrap={false}>
          <Text style={s.dayTitle}>{fmtDate(g.fecha)}</Text>
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
              <Text style={[s.th, { width: "14%" }]}>{data.labels?.ot ?? "OT"}</Text>
              <Text style={[s.th, { width: "24%" }]}>{data.labels?.cliente ?? "Cliente"}</Text>
              <Text style={[s.th, { width: "22%" }]}>{data.labels?.planta ?? "Planta"}</Text>
              <Text style={[s.th, { width: "20%" }]}>{data.labels?.servicio ?? "Servicio"}</Text>
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