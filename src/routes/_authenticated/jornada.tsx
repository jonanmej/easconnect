import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, FileDown, Loader2, Pencil, Trash2, AlertTriangle, Plus, DollarSign, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ExportButton } from "@/components/ExportButton";
import { inputCls } from "@/components/RecordDialog";
import { JornadaControl } from "@/components/JornadaControl";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { exportarExcel } from "@/lib/excel";
import { listPersonalInterno } from "@/lib/actividades-internas.functions";
import { listJornadas, listPersonalJornadas, ajustarJornada, eliminarJornada, crearJornadaManual, resumenHorasExtras, calculoNomina, listSalarios, upsertSalario } from "@/lib/jornadas.functions";
import { fmtUSD, NOTA_LEGAL_NOMINA, ETIQUETAS_MODALIDAD, type ModalidadPago } from "@/lib/nomina";
import { ExtrasResumen, NominaResumen, SalarioFila, TZ, hoyISO, primerDiaMesISO, fmtHora, fmtDur, Fila } from "@/components/jornada/jornada-utils";
import { KPI, EditarJornadaDialog, CrearJornadaDialog, SalariosDialog } from "@/components/jornada/JornadaDialogs";

export const Route = createFileRoute("/_authenticated/jornada")({
  head: () => ({
    meta: [
      { title: "Jornada laboral · EA Service Connect" },
      {
        name: "description",
        content:
          "Control de marcación de jornada: entradas, salidas, almuerzos y horas efectivas del personal, con descarga en PDF y Excel.",
      },
      { property: "og:title", content: "Control de jornada laboral · EA Service Connect" },
      {
        property: "og:description",
        content: "Marcación diaria de entrada, almuerzo y salida con reportes descargables.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JornadaPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {(error as Error)?.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">No encontrado.</div>,
});


function JornadaPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const role = highestRole(roles);
  const isStaff = role === "admin" || role === "supervisor";
  // Información de pagos, salarios y nómina: exclusiva de administradores.
  const isAdmin = role === "admin";

  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [tecnico, setTecnico] = useState("");
  const [editando, setEditando] = useState<Fila | null>(null);
  const [creando, setCreando] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [extrasPdfBusy, setExtrasPdfBusy] = useState(false);
  const [nominaPdfBusy, setNominaPdfBusy] = useState(false);
  const [salariosOpen, setSalariosOpen] = useState(false);

  const fList = useServerFn(listJornadas);
  const fPersonal = useServerFn(listPersonalJornadas);
  const fAjustar = useServerFn(ajustarJornada);
  const fEliminar = useServerFn(eliminarJornada);
  const fCrear = useServerFn(crearJornadaManual);
  const fColaboradores = useServerFn(listPersonalInterno);

  const jornadas = useQuery({
    queryKey: ["jornadas", desde, hasta, tecnico],
    queryFn: () => fList({ data: { desde, hasta, tecnico_id: tecnico || undefined } }),
  });
  const personal = useQuery({
    queryKey: ["jornadas-personal"],
    queryFn: () => fPersonal(),
    enabled: isStaff,
  });
  const colaboradores = useQuery({
    queryKey: ["jornadas-colaboradores"],
    queryFn: () => fColaboradores(),
    enabled: (isStaff && creando) || (isAdmin && salariosOpen),
  });
  const fExtras = useServerFn(resumenHorasExtras);
  const extras = useQuery({
    queryKey: ["jornadas-extras", desde, hasta, tecnico],
    queryFn: () => fExtras({ data: { desde, hasta, tecnico_id: tecnico || undefined } }),
    enabled: isAdmin,
  });
  const extrasData = extras.data as ExtrasResumen | undefined;

  const fNomina = useServerFn(calculoNomina);
  const fSalarios = useServerFn(listSalarios);
  const fGuardarSalario = useServerFn(upsertSalario);
  const nomina = useQuery({
    queryKey: ["nomina-calculo", desde, hasta, tecnico],
    queryFn: () => fNomina({ data: { desde, hasta, tecnico_id: tecnico || undefined } }),
    enabled: isAdmin,
  });
  const nominaData = nomina.data as NominaResumen | undefined;
  const salarios = useQuery({
    queryKey: ["nomina-salarios"],
    queryFn: () => fSalarios(),
    enabled: isAdmin,
  });
  const guardarSalario = useMutation({
    mutationFn: (v: { user_id: string; salario_mensual: number; modalidad?: ModalidadPago; pago_diario?: number }) =>
      fGuardarSalario({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nomina-salarios"] });
      qc.invalidateQueries({ queryKey: ["nomina-calculo"] });
      toast.success("Salario guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filas = (jornadas.data as Fila[] | undefined) ?? [];
  const totales = useMemo(() => {
    const horas = filas.reduce((a, f) => a + (f.horas_efectivas ?? 0), 0);
    return {
      jornadas: filas.length,
      horas: Math.round(horas * 100) / 100,
      excedidos: filas.filter((f) => f.almuerzo_excedido).length,
      abiertas: filas.filter((f) => !f.hora_fin).length,
    };
  }, [filas]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["jornadas"] });

  const guardar = useMutation({
    mutationFn: (v: {
      id: string; hora_inicio: string; hora_fin: string | null;
      almuerzo_inicio: string | null; almuerzo_fin: string | null; notas: string | null;
    }) => fAjustar({ data: v }),
    onSuccess: () => { invalidate(); setEditando(null); toast.success("Marcación actualizada"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const borrar = useMutation({
    mutationFn: (id: string) => fEliminar({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Marcación eliminada"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const crear = useMutation({
    mutationFn: (v: {
      tecnico_id: string; fecha: string; hora_inicio: string; hora_fin: string | null;
      almuerzo_inicio: string | null; almuerzo_fin: string | null; notas: string | null;
    }) => fCrear({ data: v }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["jornadas-personal"] });
      setCreando(false);
      toast.success("Marcación registrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alcance = tecnico
    ? (personal.data as { id: string; nombre: string }[] | undefined)?.find((p) => p.id === tecnico)?.nombre ?? "Colaborador"
    : isStaff ? "Todo el personal" : "Mis marcaciones";

  async function exportarXls() {
    await exportarExcel({
      filename: `jornadas-${desde}_a_${hasta}.xlsx`,
      hojas: [{
        nombre: "Marcaciones",
        columnas: [
          { header: "Fecha", key: "fecha", width: 14 },
          { header: "Colaborador", key: "tecnico_nombre", width: 28 },
          { header: "Entrada", key: "hora_inicio", width: 12, fn: (r: any) => fmtHora(r.hora_inicio) },
          { header: "Salida", key: "hora_fin", width: 12, fn: (r: any) => fmtHora(r.hora_fin) },
          { header: "Almuerzo inicio", key: "almuerzo_inicio", width: 16, fn: (r: any) => fmtHora(r.almuerzo_inicio) },
          { header: "Almuerzo fin", key: "almuerzo_fin", width: 16, fn: (r: any) => fmtHora(r.almuerzo_fin) },
          { header: "Almuerzo (min)", key: "almuerzo_min", width: 15 },
          { header: "Almuerzo excedido", key: "almuerzo_excedido", width: 18, fn: (r: any) => (r.almuerzo_excedido ? "Sí" : "No") },
          { header: "Horas efectivas", key: "horas_efectivas", width: 16 },
          { header: "Notas", key: "notas", width: 40 },
        ],
        filas: filas as any[],
        total: ["horas_efectivas"],
      }],
    });
  }

  async function exportarPdf() {
    setPdfBusy(true);
    try {
      const { generarYDescargarJornadasPdf } = await import("@/lib/pdf/descargar");
      await generarYDescargarJornadasPdf(
        {
          desde,
          hasta,
          alcance,
          filas: filas.map((f) => ({
            id: f.id,
            fecha: f.fecha,
            colaborador: f.tecnico_nombre,
            entrada: fmtHora(f.hora_inicio),
            salida: fmtHora(f.hora_fin),
            almuerzo: `${fmtHora(f.almuerzo_inicio)} – ${fmtHora(f.almuerzo_fin)}`,
            almuerzo_min: f.almuerzo_min ?? 0,
            almuerzo_excedido: !!f.almuerzo_excedido,
            horas_efectivas: f.horas_efectivas ?? 0,
            notas: f.notas,
          })),
          total_horas: totales.horas,
          total_jornadas: totales.jornadas,
          total_excedidos: totales.excedidos,
          emitido_at: new Date().toLocaleString("es-SV", { timeZone: TZ }),
        },
        `Jornadas-${alcance.replace(/\s+/g, "-")}-${desde}_a_${hasta}.pdf`,
      );
      toast.success("PDF generado");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  async function exportarExtrasXls() {
    if (!extrasData) return;
    await exportarExcel<any>({
      filename: `horas-extras-${desde}_a_${hasta}.xlsx`,
      hojas: [
        {
          nombre: "Resumen por colaborador",
          columnas: [
            { header: "Colaborador", key: "colaborador", width: 30 },
            { header: "Días marcados", key: "dias", width: 14 },
            { header: "Horas efectivas", key: "horas_efectivas", width: 16 },
            { header: "Horas ordinarias", key: "horas_ordinarias", width: 16 },
            { header: "Horas extras", key: "horas_extras", width: 14 },
            { header: "Días con extras", key: "dias_con_extras", width: 15 },
            { header: "Horas descanso/feriado", key: "horas_descanso", width: 22 },
            { header: "Días de descanso", key: "dias_descanso", width: 16 },
          ],
          filas: extrasData.personal as any[],
          total: ["horas_efectivas", "horas_ordinarias", "horas_extras", "horas_descanso"],
        },
        {
          nombre: "Detalle diario",
          columnas: [
            { header: "Fecha", key: "fecha", width: 14 },
            { header: "Colaborador", key: "colaborador", width: 30 },
            { header: "Horas efectivas", key: "horas_efectivas", width: 16 },
            { header: "Horas ordinarias", key: "horas_ordinarias", width: 16 },
            { header: "Horas extras", key: "horas_extras", width: 14 },
            { header: "Horas descanso/feriado", key: "horas_descanso", width: 22 },
            { header: "Observación", key: "motivo_descanso", width: 26, fn: (r: any) => r.motivo_descanso ?? "—" },
          ],
          filas: extrasData.dias as any[],
          total: ["horas_efectivas", "horas_ordinarias", "horas_extras", "horas_descanso"],
        },
      ],
    });
  }

  async function exportarExtrasPdf() {
    if (!extrasData) return;
    setExtrasPdfBusy(true);
    try {
      const { generarYDescargarHorasExtrasPdf } = await import("@/lib/pdf/descargar");
      await generarYDescargarHorasExtrasPdf(
        {
          desde,
          hasta,
          alcance,
          limite_diario: extrasData.limite_diario,
          personal: extrasData.personal,
          dias: extrasData.dias,
          totales: extrasData.totales,
          emitido_at: new Date().toLocaleString("es-SV", { timeZone: TZ }),
        },
        `Horas-extras-${alcance.replace(/\s+/g, "-")}-${desde}_a_${hasta}.pdf`,
      );
      toast.success("PDF de horas extras generado");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el PDF");
    } finally {
      setExtrasPdfBusy(false);
    }
  }

  async function exportarNominaXls() {
    if (!nominaData) return;
    await exportarExcel<any>({
      filename: `nomina-${desde}_a_${hasta}.xlsx`,
      hojas: [{
        nombre: "Pago por colaborador",
        columnas: [
          { header: "Colaborador", key: "colaborador", width: 30 },
          { header: "Modalidad", key: "modalidad", width: 20, fn: (r: any) => ETIQUETAS_MODALIDAD[(r.modalidad ?? "mensual") as ModalidadPago] },
          { header: "Base (mensual o jornal)", key: "base", width: 22, fn: (r: any) => (r.modalidad === "diario" ? Number(r.pago_diario ?? 0) : Number(r.salario_mensual ?? 0)) },
          { header: "Valor hora ordinaria", key: "valor_hora", width: 18 },
          { header: "Días marcados", key: "dias", width: 14 },
          { header: "Horas ordinarias diurnas", key: "horas_ord_diurnas", width: 22 },
          { header: "Horas ordinarias nocturnas", key: "horas_ord_nocturnas", width: 24 },
          { header: "Horas extras diurnas", key: "horas_extra_diurnas", width: 20 },
          { header: "Horas extras nocturnas", key: "horas_extra_nocturnas", width: 22 },
          { header: "Horas domingo", key: "horas_descanso", width: 15 },
          { header: "Horas feriado", key: "horas_feriado", width: 15 },
          { header: "Pago ordinario", key: "pago_ordinario", width: 16 },
          { header: "Pago extras", key: "pago_extras", width: 14 },
          { header: "Pago domingos", key: "pago_descanso", width: 15 },
          { header: "Pago feriados", key: "pago_feriado", width: 15 },
          { header: "Total a pagar", key: "total_a_pagar", width: 16 },
        ],
        filas: nominaData.personal as any[],
        total: ["pago_ordinario", "pago_extras", "pago_descanso", "pago_feriado", "total_a_pagar"],
      }],
    });
  }

  async function exportarNominaPdf() {
    if (!nominaData) return;
    setNominaPdfBusy(true);
    try {
      const { generarYDescargarNominaPdf } = await import("@/lib/pdf/descargar");
      await generarYDescargarNominaPdf(
        {
          desde,
          hasta,
          alcance,
          personal: nominaData.personal,
          totales: nominaData.totales,
          emitido_at: new Date().toLocaleString("es-SV", { timeZone: TZ }),
        },
        `Planilla-pago-${alcance.replace(/\s+/g, "-")}-${desde}_a_${hasta}.pdf`,
      );
      toast.success("Planilla de pago generada");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el PDF");
    } finally {
      setNominaPdfBusy(false);
    }
  }


  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Jornada laboral"
      />

      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[10rem_10rem_13rem_auto_auto_auto] xl:items-center">
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls + " w-full min-w-0"} aria-label="Desde" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls + " w-full min-w-0"} aria-label="Hasta" />
        {isStaff && (
          <select value={tecnico} onChange={(e) => setTecnico(e.target.value)} className={inputCls + " w-full min-w-0"} aria-label="Colaborador">
            <option value="">Todo el personal</option>
            {((personal.data as { id: string; nombre: string }[] | undefined) ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="h-9 w-full px-3 inline-flex items-center justify-center gap-2 whitespace-nowrap text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-3.5 shrink-0" /> Registrar marcación
          </button>
        )}
        <div className="w-full [&>*]:w-full">
          <ExportButton onExport={exportarXls} />
        </div>
        <button
          type="button"
          onClick={exportarPdf}
          disabled={pdfBusy}
          className="h-9 w-full px-3 inline-flex items-center justify-center gap-2 whitespace-nowrap text-xs font-medium border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
        >
          {pdfBusy ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <FileDown className="size-3.5 shrink-0" />} Descargar PDF
        </button>
      </div>

      <div className="mt-4">
        <JornadaControl />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
        <KPI label="Marcaciones" value={totales.jornadas} />
        <KPI label="Horas efectivas" value={totales.horas.toFixed(2)} />
        <KPI label="Jornadas abiertas" value={totales.abiertas} />
        <KPI label="Almuerzos excedidos" value={totales.excedidos} tone={totales.excedidos > 0 ? "danger" : "ok"} />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <Clock className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Registro de marcaciones</h2>
          <span className="ml-auto text-[10px] uppercase text-muted-foreground">{alcance}</span>
        </div>

        {jornadas.isLoading && <p className="p-4 text-xs text-muted-foreground">Cargando…</p>}
        {!jornadas.isLoading && filas.length === 0 && (
          <p className="p-4 text-xs text-muted-foreground">Sin marcaciones registradas en el período seleccionado.</p>
        )}

        {filas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[820px]">
              <thead className="bg-secondary/60 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Colaborador</th>
                  <th className="text-left px-3 py-2">Entrada</th>
                  <th className="text-left px-3 py-2">Salida</th>
                  <th className="text-left px-3 py-2">Almuerzo</th>
                  <th className="text-right px-3 py-2">Horas efect.</th>
                  <th className="text-left px-3 py-2">Notas</th>
                  {isAdmin && <th className="text-right px-3 py-2">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-t border-border/60 align-top">
                    <td className="px-3 py-2 font-mono">{f.fecha}</td>
                    <td className="px-3 py-2 font-medium">{f.tecnico_nombre}</td>
                    <td className="px-3 py-2 font-mono">{fmtHora(f.hora_inicio)}</td>
                    <td className="px-3 py-2 font-mono">
                      {f.hora_fin ? fmtHora(f.hora_fin) : <span className="text-primary">En curso</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono">{fmtHora(f.almuerzo_inicio)} – {fmtHora(f.almuerzo_fin)}</span>
                      {f.almuerzo_min > 0 && (
                        <span className={"ml-2 text-[10px] font-semibold " + (f.almuerzo_excedido ? "text-destructive" : "text-muted-foreground")}>
                          {fmtDur(f.almuerzo_min)}
                          {f.almuerzo_excedido && <AlertTriangle className="inline size-3 ml-0.5" />}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{(f.horas_efectivas ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[220px]">{f.notas ?? "—"}</td>
                    {isAdmin && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setEditando(f)}
                          className="text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          <Pencil className="size-3" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => { if (confirm("¿Eliminar esta marcación?")) borrar.mutate(f.id); }}
                          className="ml-3 text-destructive inline-flex items-center gap-1 hover:underline"
                        >
                          <Trash2 className="size-3" /> Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAdmin && (<>
      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex flex-wrap items-center gap-2">
          <Clock className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Horas extras por colaborador (nómina)</h2>
          <span className="text-[10px] uppercase text-muted-foreground">
            Jornada ordinaria {extrasData?.limite_diario ?? 8} h/día
          </span>
          <div className="ml-auto flex items-center gap-2">
            <ExportButton onExport={exportarExtrasXls} />
            <button
              type="button"
              onClick={exportarExtrasPdf}
              disabled={extrasPdfBusy || !extrasData}
              className="h-8 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
            >
              {extrasPdfBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />} PDF
            </button>
          </div>
        </div>

        {extras.isLoading && <p className="p-4 text-xs text-muted-foreground">Calculando…</p>}
        {!extras.isLoading && (extrasData?.personal.length ?? 0) === 0 && (
          <p className="p-4 text-xs text-muted-foreground">Sin horas registradas en el período seleccionado.</p>
        )}

        {(extrasData?.personal.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead className="bg-secondary/60 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Colaborador</th>
                  <th className="text-right px-3 py-2">Días</th>
                  <th className="text-right px-3 py-2">Horas efect.</th>
                  <th className="text-right px-3 py-2">Ordinarias</th>
                  <th className="text-right px-3 py-2">Extras</th>
                  <th className="text-right px-3 py-2">Días c/extra</th>
                  <th className="text-right px-3 py-2">Descanso/feriado</th>
                </tr>
              </thead>
              <tbody>
                {extrasData!.personal.map((p) => (
                  <tr key={p.tecnico_id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">{p.colaborador}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.dias}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.horas_efectivas.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.horas_ordinarias.toFixed(2)}</td>
                    <td className={"px-3 py-2 text-right font-mono font-bold " + (p.horas_extras > 0 ? "text-primary" : "")}>
                      {p.horas_extras.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{p.dias_con_extras}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.horas_descanso.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-secondary/40 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right font-mono">{extrasData!.totales.horas_efectivas.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono">{extrasData!.totales.horas_ordinarias.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono">{extrasData!.totales.horas_extras.toFixed(2)}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right font-mono">{extrasData!.totales.horas_descanso.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border">
          Se cuentan como extras las horas que pasan de {extrasData?.limite_diario ?? 8} h efectivas en un día hábil.
          Las horas de domingo o feriado se muestran aparte para pagarlas según corresponda.
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex flex-wrap items-center gap-2">
          <DollarSign className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Cálculo de pago (El Salvador)</h2>
          <span className="text-[10px] uppercase text-muted-foreground">Pago bruto del período</span>
          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setSalariosOpen(true)}
                className="h-8 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary transition-colors"
              >
                <Settings2 className="size-3.5" /> Salarios
              </button>
            )}
            <ExportButton onExport={exportarNominaXls} />
            <button
              type="button"
              onClick={exportarNominaPdf}
              disabled={nominaPdfBusy || !nominaData}
              className="h-8 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
            >
              {nominaPdfBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />} PDF
            </button>
          </div>
        </div>

        {nomina.isLoading && <p className="p-4 text-xs text-muted-foreground">Calculando pago…</p>}
        {!nomina.isLoading && (nominaData?.personal.length ?? 0) === 0 && (
          <p className="p-4 text-xs text-muted-foreground">Sin horas registradas en el período seleccionado.</p>
        )}

        {(nominaData?.personal.length ?? 0) > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3">
              <KPI label="Pago ordinario" value={fmtUSD(nominaData!.totales.pago_ordinario)} />
              <KPI label="Horas extras" value={fmtUSD(nominaData!.totales.pago_extras)} />
              <KPI label="Domingos" value={fmtUSD(nominaData!.totales.pago_descanso)} />
              <KPI label="Feriados" value={fmtUSD(nominaData!.totales.pago_feriado)} />
              <KPI label="Total a pagar" value={fmtUSD(nominaData!.totales.total_a_pagar)} tone="ok" />
            </div>
            {nominaData!.sin_salario.length > 0 && (
              <p className="mx-3 mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                Falta registrar el salario de: {nominaData!.sin_salario.join(", ")}. Su pago aparece en $0.00 hasta
                que se ingrese el salario mensual.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[960px]">
                <thead className="bg-secondary/60 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Colaborador</th>
                    <th className="text-left px-3 py-2">Modalidad</th>
                    <th className="text-right px-3 py-2">Base</th>
                    <th className="text-right px-3 py-2">Hora ord.</th>
                    <th className="text-right px-3 py-2">H. ord.</th>
                    <th className="text-right px-3 py-2">Extra diurna</th>
                    <th className="text-right px-3 py-2">Extra nocturna</th>
                    <th className="text-right px-3 py-2">H. domingo</th>
                    <th className="text-right px-3 py-2">H. feriado</th>
                    <th className="text-right px-3 py-2">Pago ord.</th>
                    <th className="text-right px-3 py-2">Pago extras</th>
                    <th className="text-right px-3 py-2">Dom./Fer.</th>
                    <th className="text-right px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {nominaData!.personal.map((p) => (
                    <tr key={p.tecnico_id} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium">
                        {p.colaborador}
                        {p.sin_salario && <span className="ml-1 text-[10px] text-destructive">(sin salario)</span>}
                      </td>
                      <td className="px-3 py-2">{ETIQUETAS_MODALIDAD[(p.modalidad ?? "mensual") as ModalidadPago]}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {p.modalidad === "diario"
                          ? `${fmtUSD(p.pago_diario ?? 0)} / día`
                          : `${fmtUSD(p.salario_mensual)} / mes`}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.valor_hora)}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {(p.horas_ord_diurnas + p.horas_ord_nocturnas).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{p.horas_extra_diurnas.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.horas_extra_nocturnas.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.horas_descanso.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.horas_feriado.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.pago_ordinario)}</td>
                      <td className="px-3 py-2 text-right font-mono text-primary">{fmtUSD(p.pago_extras)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtUSD(p.pago_descanso + p.pago_feriado)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{fmtUSD(p.total_a_pagar)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-secondary/40 font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2" colSpan={7} />
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(nominaData!.totales.pago_ordinario)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(nominaData!.totales.pago_extras)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmtUSD(nominaData!.totales.pago_descanso + nominaData!.totales.pago_feriado)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(nominaData!.totales.total_a_pagar)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border">
          {NOTA_LEGAL_NOMINA} Los montos son brutos, antes de descuentos de ley (ISSS, AFP, renta).
        </p>
      </div>
      </>
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


      {editando && (
        <EditarJornadaDialog
          fila={editando}
          saving={guardar.isPending}
          onCancel={() => setEditando(null)}
          onSave={(v) => guardar.mutate(v)}
        />
      )}

      {creando && (
        <CrearJornadaDialog
          colaboradores={(colaboradores.data as { id: string; nombre: string; cargo?: string | null }[] | undefined) ?? []}
          cargando={colaboradores.isLoading}
          saving={crear.isPending}
          onCancel={() => setCreando(false)}
          onSave={(v) => crear.mutate(v)}
        />
      )}
    </div>
  );
}
