import { Text, View, Image, Svg, Polygon } from "@react-pdf/renderer";
import { LOGO_EA, LOGO_PVSTOP, LOGO_CHEMITEK, COL, styles, brandStyles } from "@/lib/pdf/reporte/estilos";
import { ReporteData } from "@/lib/pdf/reporte/tipos";

export function colorEstado(estado: string | null) {
  return estado === "completada"
    ? { fill: "#22c55e", stroke: "#16a34a", op: 0.45 }
    : estado === "en_proceso"
      ? { fill: "#f59e0b", stroke: "#d97706", op: 0.45 }
      : { fill: "#94a3b8", stroke: "#e2e8f0", op: 0.15 };
}

/** Vista satelital compuesta por teselas con las zonas dibujadas encima. */
export function LayoutSatelital({
  basemap,
  zonas,
}: {
  basemap: NonNullable<NonNullable<ReporteData["mapas_diarios"]>[number]["basemap"]>;
  zonas: { nombre: string; poligono: { lat: number; lng: number }[]; estado: string | null }[];
}) {
  const { w, h, z, ox, oy, tile } = basemap;
  // Ancho útil de la página A4 con los márgenes del documento (96 izq / 54 der).
  const ANCHO = 445;
  const ALTO_MAX = 260;
  const k = Math.min(ANCHO / w, ALTO_MAX / h);
  const ancho = w * k;
  const alto = h * k;
  const n = tile * Math.pow(2, z);
  const proj = (p: { lat: number; lng: number }) => {
    const rad = (Math.max(-85, Math.min(85, Number(p.lat))) * Math.PI) / 180;
    const x = ((Number(p.lng) + 180) / 360) * n - ox;
    const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n - oy;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const validas = zonas.filter((zz) => Array.isArray(zz.poligono) && zz.poligono.length >= 3);
  return (
    <View
      style={{
        width: ancho,
        height: alto,
        position: "relative",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: COL.border,
        backgroundColor: "#0f172a",
      }}
    >
      {basemap.tiles.map((t, i) => (
        <Image
          key={i}
          src={t.src}
          style={{
            position: "absolute",
            left: t.x * k,
            top: t.y * k,
            width: (t.w ?? tile) * k,
            height: (t.h ?? tile) * k,
          }}
        />
      ))}
      <Svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ position: "absolute", left: 0, top: 0, width: ancho, height: alto }}
      >
        {validas.map((zz, i) => {
          const c = colorEstado(zz.estado);
          return (
            <Polygon
              key={i}
              points={zz.poligono.map(proj).join(" ")}
              fill={c.fill}
              fillOpacity={c.op}
              stroke={c.stroke}
              strokeWidth={2}
            />
          );
        })}
      </Svg>
    </View>
  );
}

export function LayoutZonas({
  zonas,
}: {
  zonas: { nombre: string; poligono: { lat: number; lng: number }[]; estado: string | null }[];
}) {
  const validas = zonas.filter((z) => Array.isArray(z.poligono) && z.poligono.length >= 3);
  if (!validas.length) return null;
  const pts = validas.flatMap((z) => z.poligono);
  const lats = pts.map((p) => Number(p.lat));
  const lngs = pts.map((p) => Number(p.lng));
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const W = 500, H = 210, PAD = 8;
  const dLat = maxLat - minLat || 1e-6;
  const dLng = maxLng - minLng || 1e-6;
  const esc = Math.min((W - PAD * 2) / dLng, (H - PAD * 2) / dLat);
  const offX = (W - dLng * esc) / 2;
  const offY = (H - dLat * esc) / 2;
  const proj = (p: { lat: number; lng: number }) =>
    `${(offX + (Number(p.lng) - minLng) * esc).toFixed(1)},${(offY + (maxLat - Number(p.lat)) * esc).toFixed(1)}`;
  const color = colorEstado;
  return (
    <View style={{ borderWidth: 0.5, borderColor: COL.border, backgroundColor: "#f1f5f9" }}>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
        {validas.map((z, i) => {
          const c = color(z.estado);
          return (
            <Polygon
              key={i}
              points={z.poligono.map(proj).join(" ")}
              fill={c.fill}
              fillOpacity={c.op}
              stroke={c.stroke}
              strokeWidth={1.2}
            />
          );
        })}
      </Svg>
    </View>
  );
}

export function PageHeader({ data, pageName }: { data: ReporteData; pageName: string }) {
  const codigo = `${data.documento_codigo ?? "REP"} · v${data.documento_version ?? "1.0"}`;
  const clasif = data.documento_clasificacion ?? "Uso interno";
  return (
    <View fixed style={{ position: "absolute", top: 24, left: 96, right: 54 }}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image src={LOGO_EA()} style={[brandStyles.logoEa, { marginRight: 10 }]} />
          <View style={styles.headerLeftText}>
            <Text style={styles.headerTitle}>EA SERVICE AND CONSULTING</Text>
            <Text style={styles.headerSub}>{(data.modo === "ejecutivo" ? "Reporte Ejecutivo" : "Reporte Interno")} · {pageName}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerRightTop}>{data.cliente}</Text>
          <Text style={styles.headerRightBot}>{data.periodo}</Text>
          <Text style={styles.headerRightBot}>{codigo}{data.folio_ot ? ` · OT ${data.folio_ot}` : ""}</Text>
          <Text style={styles.headerRightBot}>Emitido: {data.emitido_at}</Text>
          <Text style={styles.headerRightBot}>{clasif}</Text>
        </View>
      </View>
    </View>
  );
}

export function PageFooter({ data }: { data: ReporteData }) {
  const responsable = data.responsable
    ? `${data.responsable}${data.responsable_cargo ? ` · ${data.responsable_cargo}` : ""}`
    : "Equipo EA Service and Consulting";
  const docId = data.documento_id ? data.documento_id.slice(0, 8).toUpperCase() : "—";
  const hash = data.documento_hash ? data.documento_hash.slice(0, 12) : null;
  return (
    <View style={styles.pageFooter} fixed>
      <View style={styles.pageFooterTop}>
        <View style={styles.pageFooterLogos}>
          <Image src={LOGO_PVSTOP()} style={brandStyles.footerLogoPv} />
          <Image src={LOGO_CHEMITEK()} style={brandStyles.footerLogoCh} />
        </View>
        <Text style={styles.pageFooterPage} render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} fixed />
      </View>
      <View style={styles.pageFooterMeta}>
        <Text style={styles.pageFooterMetaLine}>ID Doc: {docId}{hash ? ` · SHA-256 ${hash}…` : ""}</Text>
        <Text style={styles.pageFooterMetaLine}>Responsable: {responsable}</Text>
      </View>
    </View>
  );
}

export function estadoColor(s: string) {
  const k = String(s ?? "").toLowerCase();
  if (k === "completado" || k === "completada") return COL.ok;
  if (k === "cancelado" || k === "cancelada") return COL.danger;
  if (k === "en_progreso" || k === "en progreso" || k === "en_proceso" || k === "en proceso") return COL.primary;
  return COL.muted;
}

export function estadoTexto(s: string) {
  const k = String(s ?? "").toLowerCase();
  const map: Record<string, string> = {
    completado: "Completado",
    completada: "Completada",
    cancelado: "Cancelado",
    cancelada: "Cancelada",
    en_progreso: "En progreso",
    en_proceso: "En proceso",
    programado: "Programado",
    programada: "Programada",
    pendiente: "Pendiente",
    borrador: "Borrador",
  };
  if (map[k]) return map[k];
  return k.replace(/_+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function Grafica({ g }: { g: NonNullable<ReporteData["graficas"]>[number] }) {
  const max = Math.max(1, ...g.series.map((s) => s.value));
  return (
    <View style={styles.chartBlock} wrap={false}>
      <Text style={styles.chartTitle}>{g.titulo}</Text>
      {g.descripcion && <Text style={styles.chartCaption}>{g.descripcion}</Text>}
      {g.series.map((s, i) => {
        const pct = Math.round((s.value / max) * 100);
        return (
          <View key={i} style={styles.chartRow}>
            <Text style={styles.chartLabel}>{s.label}</Text>
            <View style={styles.chartTrack}>
              <View style={[styles.chartBar, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.chartValue}>{s.value}{g.unidad ? ` ${g.unidad}` : ""}</Text>
          </View>
        );
      })}
      <Text style={styles.chartSource}>Fuente: {g.fuente}</Text>
    </View>
  );
}

export function kpiValueStyle(value: string) {
  const len = String(value ?? "").length;
  if (len > 95) return [styles.kpiValue, { fontSize: 8.5, lineHeight: 1.25 }];
  if (len > 55) return [styles.kpiValue, { fontSize: 10, lineHeight: 1.25 }];
  if (len > 28) return [styles.kpiValue, { fontSize: 12, lineHeight: 1.2 }];
  return styles.kpiValue;
}
