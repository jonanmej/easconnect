import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";
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
  text: "#1f2937",
  muted: "#64748b",
  border: "#cbd5e1",
  panel: "#f8fafc",
  primary: "#2E4A87",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 48,
    paddingRight: 48,
    fontSize: 10,
    color: COL.text,
    fontFamily: FONT_REG,
    lineHeight: 1.35,
  },
  title: {
    fontSize: 16,
    fontFamily: FONT_BOLD,
    color: COL.primary,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 10,
    color: COL.muted,
    marginBottom: 18,
  },
  clienteHead: {
    backgroundColor: COL.primary,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 6,
    marginTop: 10,
  },
  clienteName: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    color: "#fff",
  },
  plantaBlock: {
    marginBottom: 8,
    paddingLeft: 6,
  },
  plantaName: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    color: COL.text,
    marginBottom: 3,
  },
  fechasRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  fechaPill: {
    fontSize: 9,
    color: COL.text,
    backgroundColor: COL.panel,
    borderWidth: 0.5,
    borderColor: COL.border,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  empty: {
    fontSize: 10,
    color: COL.muted,
    textAlign: "center",
    marginTop: 40,
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
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
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
  return (
    <Document title="Trabajos finalizados" author="EA Service and Consulting" subject={`Trabajos finalizados · ${data.periodo}`}>
      <Page size="A4" orientation="portrait" style={s.page}>
        <Text style={s.title}>Trabajos finalizados por cliente</Text>
        <Text style={s.subtitle}>{data.periodo}</Text>

        {grupos.map((g) => (
          <View key={g.cliente} wrap={false}>
            <View style={s.clienteHead}>
              <Text style={s.clienteName}>{g.cliente}</Text>
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
          <Text style={s.empty}>No hay trabajos finalizados que coincidan con los filtros seleccionados.</Text>
        )}
      </Page>
    </Document>
  );
}
