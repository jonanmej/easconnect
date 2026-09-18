import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DollarSign, FileDown, History, Loader2, Lock, LockOpen, Save, Settings2, Trash2, Users,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ExportButton } from "@/components/ExportButton";
import { inputCls } from "@/components/RecordDialog";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { exportarExcel } from "@/lib/excel";
import { fmtUSD, NOTA_LEGAL_NOMINA } from "@/lib/nomina";
import { NOTA_LEGAL_DESCUENTOS } from "@/lib/nomina-descuentos";
import { listSalarios, upsertSalario } from "@/lib/jornadas.functions";
import { listPersonalInterno } from "@/lib/actividades-internas.functions";
import {
  calcularNominaMes, guardarNominaMes, listPeriodosNomina, getDetalleNomina,
  historialColaborador, reabrirNominaMes, eliminarNominaMes,
} from "@/lib/nomina.functions";

export const Route = createFileRoute("/_authenticated/nomina")({
  head: () => ({
    meta: [
      { title: "Nómina · EA Service Connect" },
      {
        name: "description",
        content:
          "Módulo de nómina: salarios, horas extras, descuentos de ley (ISSS, AFP y renta) y pagos mensuales con historial por colaborador.",
      },
      { property: "og:title", content: "Nómina y planilla de pago · EA Service Connect" },
      {
        property: "og:description",
        content: "Planilla mensual con horas extras, ISSS, AFP, renta y total neto por colaborador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NominaPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">No encontrado.</div>,
});

const TZ = "America/El_Salvador";
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function hoySV() {
  const iso = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  return { anio: Number(iso.slice(0, 4)), mes: Number(iso.slice(5, 7)) };
}

type PersonaCalc = {
  tecnico_id: string; colaborador: string; salario_mensual: number; valor_hora: number;
  dias: number; sin_salario: boolean; horas_totales: number;
  horas_ord_diurnas: number; horas_ord_nocturnas: number;
  horas_extra_diurnas: number; horas_extra_nocturnas: number;
  horas_descanso: number; horas_feriado: number;
  pago_ordinario: number; pago_extras: number; pago_descanso: number; pago_feriado: number;
  total_a_pagar: number; total_bruto: number; isss: number; afp: number; renta: number;
  otros_descuentos: number; total_descuentos: number; total_neto: number;
};

type CalcMes = {
  anio: number; mes: number; desde: string; hasta: string;
  personal: PersonaCalc[];
  totales: {
    horas_totales: number; horas_extra_diurnas: number; horas_extra_nocturnas: number;
    horas_descanso: number; horas_feriado: number;
    pago_ordinario: number; pago_extras: number; pago_descanso: number; pago_feriado: number;
    total_a_pagar: number; total_bruto: number; isss: number; afp: number; renta: number;
    otros_descuentos: number; total_descuentos: number; total_neto: number;
  };
  sin_salario: string[];
  periodo: { id: string; estado: string; notas: string | null; cerrado_at: string | null } | null;
  guardado: { user_id: string; otros_descuentos: number | string; notas: string | null }[];
};

type SalarioFila = { user_id: string; colaborador: string; salario_mensual: number; notas: string | null };

function NominaPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const role = highestRole(roles);
  const isStaff = role === "admin" || role === "supervisor";

  const inicial = hoySV();
  const [anio, setAnio] = useState(inicial.anio);
  const [mes, setMes] = useState(inicial.mes);
  const [tab, setTab] = useState<"mes" | "historial">("mes");
  const [otros, setOtros] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState("");
  const [salariosOpen, setSalariosOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [verColaborador, setVerColaborador] = useState<{ id: string; nombre: string } | null>(null);
  const [verPeriodo, setVerPeriodo] = useState<{ id: string; titulo: string } | null>(null);

  const fCalc = useServerFn(calcularNominaMes);
  const fGuardar = useServerFn(guardarNominaMes);
  const fPeriodos = useServerFn(listPeriodosNomina);
  const fReabrir = useServerFn(reabrirNominaMes);
  const fEliminar = useServerFn(eliminarNominaMes);
  const fSalarios = useServerFn(listSalarios);
  const fGuardarSalario = useServerFn(upsertSalario);
  const fColaboradores = useServerFn(listPersonalInterno);

  const calc = useQuery({
    queryKey: ["nomina-mes", anio, mes],
    queryFn: () => fCalc({ data: { anio, mes } }),
    enabled: isStaff,
  });
  const data = calc.data as CalcMes | undefined;

  const periodos = useQuery({
    queryKey: ["nomina-periodos"],
    queryFn: () => fPeriodos(),
    enabled: isStaff,
  });
  const salarios = useQuery({
    queryKey: ["nomina-salarios"],
    queryFn: () => fSalarios(),
    enabled: isStaff,
  });
  const colaboradores = useQuery({
    queryKey: ["nomina-colaboradores"],
    queryFn: () => fColaboradores(),
    enabled: isStaff,
  });

  const guardarSalario = useMutation({
    mutationFn: (v: { user_id: string; salario_mensual: number }) => fGuardarSalario({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nomina-salarios"] });
      qc.invalidateQueries({ queryKey: ["nomina-mes"] });
      qc.invalidateQueries({ queryKey: ["nomina-calculo"] });
      toast.success("Salario guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ajustes = useMemo(
    () =>
      (data?.personal ?? []).map((p) => ({
        user_id: p.tecnico_id,
        otros_descuentos: Number(otros[p.tecnico_id] ?? guardadoOtros(data, p.tecnico_id)) || 0,
      })),
    [data, otros],
  );

  const guardar = useMutation({
    mutationFn: (cerrar: boolean) =>
      fGuardar({ data: { anio, mes, notas: notas.trim() || null, cerrar, ajustes } }),
    onSuccess: (_r, cerrar) => {
      qc.invalidateQueries({ queryKey: ["nomina-mes"] });
      qc.invalidateQueries({ queryKey: ["nomina-periodos"] });
      toast.success(cerrar ? "Planilla del mes cerrada" : "Planilla guardada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reabrir = useMutation({
    mutationFn: (periodo_id: string) => fReabrir({ data: { periodo_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nomina-mes"] });
      qc.invalidateQueries({ queryKey: ["nomina-periodos"] });
      toast.success("Período reabierto");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const borrar = useMutation({
    mutationFn: (periodo_id: string) => fEliminar({ data: { periodo_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nomina-mes"] });
      qc.invalidateQueries({ queryKey: ["nomina-periodos"] });
      toast.success("Período eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Filas con los descuentos calculados en pantalla (incluye "otros"). */
  const filas = useMemo(() => {
    return (data?.personal ?? []).map((p) => {
      const extra = Number(otros[p.tecnico_id] ?? guardadoOtros(data, p.tecnico_id)) || 0;
      const neto = Math.max(0, Math.round((p.total_bruto - p.isss - p.afp - p.renta - extra) * 100) / 100);
      return { ...p, otros_descuentos: extra, total_neto: neto };
    });
  }, [data, otros]);

  const totales = useMemo(() => {
    const s = (fn: (f: (typeof filas)[number]) => number) =>
      Math.round(filas.reduce((a, f) => a + fn(f), 0) * 100) / 100;
    return {
      bruto: s((f) => f.total_bruto),
      isss: s((f) => f.isss),
      afp: s((f) => f.afp),
      renta: s((f) => f.renta),
      otros: s((f) => f.otros_descuentos),
      neto: s((f) => f.total_neto),
      extras: s((f) => f.pago_extras),
      ordinario: s((f) => f.pago_ordinario),
      domfer: s((f) => f.pago_descanso + f.pago_feriado),
    };
  }, [filas]);

  const cerrado = data?.periodo?.estado === "cerrado";
  const etiquetaMes = `${MESES[mes - 1]} ${anio}`;

  async function exportarXls() {
    await exportarExcel<any>({
      filename: `nomina-${anio}-${String(mes).padStart(2, "0")}.xlsx`,
      hojas: [{
        nombre: "Planilla de pago",
        columnas: [
          { header: "Colaborador", key: "colaborador", width: 30 },
          { header: "Salario mensual", key: "salario_mensual", width: 16 },
          { header: "Valor hora ordinaria", key: "valor_hora", width: 18 },
          { header: "Días marcados", key: "dias", width: 14 },
          { header: "Horas ordinarias", key: "horas_ordinarias", width: 16, fn: (r: any) => r.horas_ord_diurnas + r.horas_ord_nocturnas },
          { header: "Horas extras diurnas", key: "horas_extra_diurnas", width: 20 },
          { header: "Horas extras nocturnas", key: "horas_extra_nocturnas", width: 22 },
          { header: "Horas domingo", key: "horas_descanso", width: 15 },
          { header: "Horas feriado", key: "horas_feriado", width: 15 },
          { header: "Pago ordinario", key: "pago_ordinario", width: 16 },
          { header: "Pago extras", key: "pago_extras", width: 14 },
          { header: "Pago domingos", key: "pago_descanso", width: 15 },
          { header: "Pago feriados", key: "pago_feriado", width: 15 },
          { header: "Total bruto", key: "total_bruto", width: 15 },
          { header: "ISSS", key: "isss", width: 12 },
          { header: "AFP", key: "afp", width: 12 },
          { header: "Renta", key: "renta", width: 12 },
          { header: "Otros descuentos", key: "otros_descuentos", width: 17 },
          { header: "Total neto", key: "total_neto", width: 15 },
        ],
        filas: filas as any[],
        total: ["total_bruto", "isss", "afp", "renta", "otros_descuentos", "total_neto"],
      }],
    });
  }

  async function exportarPdf() {
    if (!data) return;
    setPdfBusy(true);
    try {
      const { generarYDescargarNominaPdf } = await import("@/lib/pdf/descargar");
      await generarYDescargarNominaPdf(
        {
          desde: data.desde,
          hasta: data.hasta,
          alcance: `Planilla ${etiquetaMes}`,
          personal: filas as any,
          totales: {
            ...data.totales,
            isss: totales.isss,
            afp: totales.afp,
            renta: totales.renta,
            otros_descuentos: totales.otros,
            total_neto: totales.neto,
          },
          emitido_at: new Date().toLocaleString("es-SV", { timeZone: TZ }),
        },
        `Planilla-pago-${anio}-${String(mes).padStart(2, "0")}.pdf`,
      );
      toast.success("Planilla generada");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  if (!isStaff) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        El módulo de nómina está disponible solo para administradores y supervisores.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Nómina"
        description="Salarios, horas extras, descuentos de ley (ISSS, AFP y renta) y pagos mensuales con historial por colaborador."
      />

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="flex gap-1 rounded-md border border-border p-1">
          <button
            type="button"
            onClick={() => setTab("mes")}
            className={`h-8 px-3 text-xs font-medium rounded ${tab === "mes" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
          >
            Planilla del mes
          </button>
          <button
            type="button"
            onClick={() => setTab("historial")}
            className={`h-8 px-3 text-xs font-medium rounded ${tab === "historial" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
          >
            Historial
          </button>
        </div>
        <button
          type="button"
          onClick={() => setSalariosOpen(true)}
          className="h-8 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary"
        >
          <Settings2 className="size-3.5" /> Salarios
        </button>
      </div>

      {tab === "mes" && (
        <>
          <div className="mt-4 rounded-lg border border-border bg-card p-3 flex flex-wrap items-end gap-3">
            <label className="text-xs">
              <span className="block mb-1 text-muted-foreground">Mes</span>
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inputCls}>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="block mb-1 text-muted-foreground">Año</span>
              <input
                type="number" min={2020} max={2100} value={anio}
                onChange={(e) => setAnio(Number(e.target.value))} className={inputCls}
              />
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <ExportButton onExport={exportarXls} />
              <button
                type="button" onClick={exportarPdf} disabled={pdfBusy || !data}
                className="h-8 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary disabled:opacity-50"
              >
                {pdfBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />} PDF
              </button>
              {cerrado ? (
                <button
                  type="button"
                  onClick={() => data?.periodo && reabrir.mutate(data.periodo.id)}
                  className="h-8 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary"
                >
                  <LockOpen className="size-3.5" /> Reabrir mes
                </button>
              ) : (
                <>
                  <button
                    type="button" onClick={() => guardar.mutate(false)} disabled={guardar.isPending || !filas.length}
                    className="h-8 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary disabled:opacity-50"
                  >
                    {guardar.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Guardar
                  </button>
                  <button
                    type="button" onClick={() => guardar.mutate(true)} disabled={guardar.isPending || !filas.length}
                    className="h-8 px-3 inline-flex items-center gap-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Lock className="size-3.5" /> Cerrar mes
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex flex-wrap items-center gap-2">
              <DollarSign className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Planilla de {etiquetaMes}</h2>
              <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${cerrado ? "border-emerald-500/40 text-emerald-600" : "border-border text-muted-foreground"}`}>
                {cerrado ? "Cerrada" : data?.periodo ? "Borrador guardado" : "Sin guardar"}
              </span>
            </div>

            {calc.isLoading && <p className="p-4 text-xs text-muted-foreground">Calculando planilla…</p>}
            {!calc.isLoading && filas.length === 0 && (
              <p className="p-4 text-xs text-muted-foreground">
                No hay marcaciones de jornada registradas en {etiquetaMes}.
              </p>
            )}

            {filas.length > 0 && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-3">
                  <KPI label="Pago ordinario" value={fmtUSD(totales.ordinario)} />
                  <KPI label="Horas extras" value={fmtUSD(totales.extras)} />
                  <KPI label="Dom./Feriados" value={fmtUSD(totales.domfer)} />
                  <KPI label="Total bruto" value={fmtUSD(totales.bruto)} />
                  <KPI label="Descuentos" value={fmtUSD(totales.isss + totales.afp + totales.renta + totales.otros)} />
                  <KPI label="Total neto" value={fmtUSD(totales.neto)} tone="ok" />
                </div>

                {(data?.sin_salario.length ?? 0) > 0 && (
                  <p className="mx-3 mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                    Falta registrar el salario de: {data!.sin_salario.join(", ")}. Su pago aparece en $0.00 hasta que
                    se ingrese el salario mensual.
                  </p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[1100px]">
                    <thead className="bg-secondary/60 text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Colaborador</th>
                        <th className="text-right px-3 py-2">Días</th>
                        <th className="text-right px-3 py-2">H. ord.</th>
                        <th className="text-right px-3 py-2">Extra diurna</th>
                        <th className="text-right px-3 py-2">Extra nocturna</th>
                        <th className="text-right px-3 py-2">Pago ord.</th>
                        <th className="text-right px-3 py-2">Extras</th>
                        <th className="text-right px-3 py-2">Dom./Fer.</th>
                        <th className="text-right px-3 py-2">Bruto</th>
                        <th className="text-right px-3 py-2">ISSS</th>
                        <th className="text-right px-3 py-2">AFP</th>
                        <th className="text-right px-3 py-2">Renta</th>
                        <th className="text-right px-3 py-2">Otros</th>
                        <th className="text-right px-3 py-2">Neto</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((p) => (
                        <tr key={p.tecnico_id} className="border-t border-border/60">
                          <td className="px-3 py-2 font-medium">
                            {p.colaborador}
                            {p.sin_salario && <span className="ml-1 text-[10px] text-destructive">(sin salario)</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{p.dias}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {(p.horas_ord_diurnas + p.horas_ord_nocturnas).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{p.horas_extra_diurnas.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono">{p.horas_extra_nocturnas.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.pago_ordinario)}</td>
                          <td className="px-3 py-2 text-right font-mono text-primary">{fmtUSD(p.pago_extras)}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.pago_descanso + p.pago_feriado)}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.total_bruto)}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.isss)}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.afp)}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.renta)}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number" min={0} step="0.01" disabled={cerrado}
                              value={otros[p.tecnico_id] ?? String(guardadoOtros(data, p.tecnico_id) || "")}
                              onChange={(e) => setOtros((s) => ({ ...s, [p.tecnico_id]: e.target.value }))}
                              placeholder="0.00"
                              className="h-7 w-20 rounded border border-border bg-background px-2 text-right text-xs disabled:opacity-60"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600">
                            {fmtUSD(p.total_neto)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setVerColaborador({ id: p.tecnico_id, nombre: p.colaborador })}
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                            >
                              <History className="size-3.5" /> Historial
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-border bg-secondary/40 font-semibold">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2" colSpan={4} />
                        <td className="px-3 py-2 text-right font-mono">{fmtUSD(totales.ordinario)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtUSD(totales.extras)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtUSD(totales.domfer)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtUSD(totales.bruto)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtUSD(totales.isss)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtUSD(totales.afp)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtUSD(totales.renta)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtUSD(totales.otros)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtUSD(totales.neto)}</td>
                        <td className="px-3 py-2" />
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="p-3 border-t border-border">
                  <label className="text-xs block">
                    <span className="block mb-1 text-muted-foreground">Notas del período</span>
                    <textarea
                      value={notas || data?.periodo?.notas || ""}
                      onChange={(e) => setNotas(e.target.value)}
                      disabled={cerrado}
                      rows={2}
                      className={inputCls}
                      placeholder="Observaciones de la planilla del mes (opcional)"
                    />
                  </label>
                </div>
              </>
            )}

            <p className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border">
              {NOTA_LEGAL_NOMINA} {NOTA_LEGAL_DESCUENTOS}
            </p>
          </div>
        </>
      )}

      {tab === "historial" && (
        <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center gap-2">
            <History className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Planillas guardadas</h2>
          </div>
          {periodos.isLoading && <p className="p-4 text-xs text-muted-foreground">Cargando…</p>}
          {!periodos.isLoading && ((periodos.data as any[] | undefined)?.length ?? 0) === 0 && (
            <p className="p-4 text-xs text-muted-foreground">Todavía no hay planillas guardadas.</p>
          )}
          {((periodos.data as any[] | undefined)?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[820px]">
                <thead className="bg-secondary/60 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Período</th>
                    <th className="text-left px-3 py-2">Estado</th>
                    <th className="text-right px-3 py-2">Bruto</th>
                    <th className="text-right px-3 py-2">ISSS</th>
                    <th className="text-right px-3 py-2">AFP</th>
                    <th className="text-right px-3 py-2">Renta</th>
                    <th className="text-right px-3 py-2">Otros</th>
                    <th className="text-right px-3 py-2">Neto</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(periodos.data as any[]).map((p) => (
                    <tr key={p.id} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium">{MESES[p.mes - 1]} {p.anio}</td>
                      <td className="px-3 py-2">
                        <span className={p.estado === "cerrado" ? "text-emerald-600" : "text-muted-foreground"}>
                          {p.estado === "cerrado" ? "Cerrada" : "Borrador"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.total_bruto)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.total_isss)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.total_afp)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.total_renta)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.total_otros)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{fmtUSD(p.total_neto)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setVerPeriodo({ id: p.id, titulo: `${MESES[p.mes - 1]} ${p.anio}` })}
                          className="text-[11px] text-primary hover:underline"
                        >
                          Ver detalle
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`¿Eliminar la planilla de ${MESES[p.mes - 1]} ${p.anio}?`)) borrar.mutate(p.id);
                          }}
                          className="ml-3 text-[11px] text-destructive hover:underline inline-flex items-center gap-1"
                        >
                          <Trash2 className="size-3" /> Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="p-3 border-t border-border flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="block mb-1 text-muted-foreground">Historial por colaborador</span>
              <select
                value={verColaborador?.id ?? ""}
                onChange={(e) => {
                  const lista = (colaboradores.data as { id: string; nombre: string }[] | undefined) ?? [];
                  const c = lista.find((x) => x.id === e.target.value);
                  setVerColaborador(c ? { id: c.id, nombre: c.nombre } : null);
                }}
                className={inputCls}
              >
                <option value="">Seleccione un colaborador</option>
                {((colaboradores.data as { id: string; nombre: string }[] | undefined) ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {verColaborador && (
        <HistorialColaboradorDialog
          colaborador={verColaborador}
          onClose={() => setVerColaborador(null)}
          fetcher={historialColaborador}
        />
      )}

      {verPeriodo && (
        <DetallePeriodoDialog periodo={verPeriodo} onClose={() => setVerPeriodo(null)} />
      )}

      {salariosOpen && (
        <SalariosDialog
          salarios={(salarios.data as SalarioFila[] | undefined) ?? []}
          colaboradores={(colaboradores.data as { id: string; nombre: string }[] | undefined) ?? []}
          cargando={salarios.isLoading}
          saving={guardarSalario.isPending}
          onCancel={() => setSalariosOpen(false)}
          onSave={(v) => guardarSalario.mutate(v)}
        />
      )}
    </div>
  );
}

function guardadoOtros(data: CalcMes | undefined, userId: string): number {
  const g = data?.guardado?.find((x) => x.user_id === userId);
  return Number(g?.otros_descuentos ?? 0) || 0;
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${tone === "ok" ? "text-emerald-600" : ""}`}>{value}</p>
    </div>
  );
}

function HistorialColaboradorDialog({
  colaborador, onClose, fetcher,
}: {
  colaborador: { id: string; nombre: string };
  onClose: () => void;
  fetcher: typeof historialColaborador;
}) {
  const f = useServerFn(fetcher);
  const q = useQuery({
    queryKey: ["nomina-historial", colaborador.id],
    queryFn: () => f({ data: { user_id: colaborador.id } }),
  });
  const filas = (q.data as any[] | undefined) ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Historial de pagos · {colaborador.nombre}</h3>
        </div>
        {q.isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
        {!q.isLoading && filas.length === 0 && (
          <p className="text-xs text-muted-foreground">Este colaborador aún no tiene planillas guardadas.</p>
        )}
        {filas.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs min-w-[720px]">
              <thead className="bg-secondary/60 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Período</th>
                  <th className="text-right px-3 py-2">Días</th>
                  <th className="text-right px-3 py-2">Extras diurnas</th>
                  <th className="text-right px-3 py-2">Extras nocturnas</th>
                  <th className="text-right px-3 py-2">Bruto</th>
                  <th className="text-right px-3 py-2">ISSS</th>
                  <th className="text-right px-3 py-2">AFP</th>
                  <th className="text-right px-3 py-2">Renta</th>
                  <th className="text-right px-3 py-2">Otros</th>
                  <th className="text-right px-3 py-2">Neto</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((l) => (
                  <tr key={l.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">
                      {MESES[(l.mes ?? 1) - 1]} {l.anio}
                      {l.estado === "cerrado" && <span className="ml-1 text-[10px] text-emerald-600">(cerrada)</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{l.dias}</td>
                    <td className="px-3 py-2 text-right font-mono">{Number(l.horas_extra_diurnas).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{Number(l.horas_extra_nocturnas).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.total_bruto))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.isss))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.afp))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.renta))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.otros_descuentos))}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600">
                      {fmtUSD(Number(l.total_neto))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="h-9 px-3 text-xs border border-border rounded-md hover:bg-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function DetallePeriodoDialog({
  periodo, onClose,
}: {
  periodo: { id: string; titulo: string };
  onClose: () => void;
}) {
  const f = useServerFn(getDetalleNomina);
  const q = useQuery({
    queryKey: ["nomina-detalle", periodo.id],
    queryFn: () => f({ data: { periodo_id: periodo.id } }),
  });
  const lineas = ((q.data as any)?.lineas as any[] | undefined) ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">Planilla de {periodo.titulo}</h3>
        {q.isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
        {!q.isLoading && lineas.length === 0 && (
          <p className="text-xs text-muted-foreground">Esta planilla no tiene líneas registradas.</p>
        )}
        {lineas.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs min-w-[720px]">
              <thead className="bg-secondary/60 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Colaborador</th>
                  <th className="text-right px-3 py-2">Días</th>
                  <th className="text-right px-3 py-2">Bruto</th>
                  <th className="text-right px-3 py-2">ISSS</th>
                  <th className="text-right px-3 py-2">AFP</th>
                  <th className="text-right px-3 py-2">Renta</th>
                  <th className="text-right px-3 py-2">Otros</th>
                  <th className="text-right px-3 py-2">Neto</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">{l.colaborador}</td>
                    <td className="px-3 py-2 text-right font-mono">{l.dias}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.total_bruto))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.isss))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.afp))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.renta))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(Number(l.otros_descuentos))}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600">
                      {fmtUSD(Number(l.total_neto))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="h-9 px-3 text-xs border border-border rounded-md hover:bg-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function SalariosDialog({
  salarios, colaboradores, cargando, saving, onCancel, onSave,
}: {
  salarios: SalarioFila[];
  colaboradores: { id: string; nombre: string }[];
  cargando: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (v: { user_id: string; salario_mensual: number; modalidad: ModalidadPago; pago_diario: number }) => void;
}) {
  const [userId, setUserId] = useState("");
  const [modalidad, setModalidad] = useState<ModalidadPago>("mensual");
  const [monto, setMonto] = useState("");
  const lista = colaboradores.length
    ? colaboradores
    : salarios.map((s) => ({ id: s.user_id, nombre: s.colaborador }));

  const esDiario = modalidad === "diario";

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Remuneración del personal</h3>
          <p className="text-xs text-muted-foreground">
            Personal fijo: ingrese el salario mensual (la hora ordinaria es salario ÷ 30 días ÷ 8 horas).
            Contratados por proyecto: elija «Pago por día» e ingrese el jornal; por cada día con marcación se paga
            el jornal completo, con recargo del 50 % en domingo y doble en feriado, más las horas extras.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_150px_auto] gap-2 items-end">
          <label className="text-xs">
            <span className="block mb-1 text-muted-foreground">Colaborador</span>
            <select
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                const actual = salarios.find((s) => s.user_id === e.target.value);
                const m = (actual?.modalidad ?? "mensual") as ModalidadPago;
                setModalidad(m);
                setMonto(actual ? String(m === "diario" ? actual.pago_diario : actual.salario_mensual) : "");
              }}
              className={inputCls}
            >
              <option value="">{cargando ? "Cargando…" : "Seleccione un colaborador"}</option>
              {lista.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="block mb-1 text-muted-foreground">Modalidad</span>
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as ModalidadPago)}
              className={inputCls}
            >
              <option value="mensual">Salario mensual</option>
              <option value="diario">Pago por día (proyecto)</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="block mb-1 text-muted-foreground">
              {esDiario ? "Pago por día (USD)" : "Salario mensual (USD)"}
            </span>
            <input
              type="number" min={0} step="0.01" value={monto}
              onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className={inputCls}
            />
          </label>
          <button
            type="button"
            disabled={saving || !userId || monto === "" || Number(monto) < 0}
            onClick={() =>
              onSave({
                user_id: userId,
                modalidad,
                salario_mensual: esDiario ? 0 : Number(monto),
                pago_diario: esDiario ? Number(monto) : 0,
              })
            }
            className="h-9 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />} Guardar
          </button>
        </div>

        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-xs min-w-[520px]">
            <thead className="bg-secondary/60 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Colaborador</th>
                <th className="text-left px-3 py-2">Modalidad</th>
                <th className="text-right px-3 py-2">Base</th>
                <th className="text-right px-3 py-2">Hora ordinaria</th>
              </tr>
            </thead>
            <tbody>
              {salarios.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-3 text-center text-muted-foreground">Aún no hay remuneraciones registradas.</td></tr>
              )}
              {salarios.map((s) => {
                const diario = (s.modalidad ?? "mensual") === "diario";
                const base = diario ? s.pago_diario : s.salario_mensual;
                const hora = diario ? base / 8 : base / 30 / 8;
                return (
                  <tr key={s.user_id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">{s.colaborador}</td>
                    <td className="px-3 py-2">{ETIQUETAS_MODALIDAD[(s.modalidad ?? "mensual") as ModalidadPago]}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmtUSD(base)}{diario ? " / día" : " / mes"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(hora)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-1">
          <button type="button" onClick={onCancel} className="h-9 px-3 text-xs border border-border rounded-md hover:bg-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
