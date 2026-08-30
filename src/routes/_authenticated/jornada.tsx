import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, FileDown, Loader2, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ExportButton } from "@/components/ExportButton";
import { inputCls } from "@/components/RecordDialog";
import { JornadaControl } from "@/components/JornadaControl";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { exportarExcel } from "@/lib/excel";
import {
  listJornadas,
  listPersonalJornadas,
  ajustarJornada,
  eliminarJornada,
} from "@/lib/jornadas.functions";

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
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">No encontrado.</div>,
});

const TZ = "America/El_Salvador";

function hoyISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
function primerDiaMesISO(): string {
  const hoy = hoyISO();
  return `${hoy.slice(0, 7)}-01`;
}
function fmtHora(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-SV", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}
/** ISO → valor para <input type="datetime-local"> en hora de El Salvador. */
function isoALocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
/** El Salvador es UTC-6 todo el año (sin horario de verano). */
function localAIso(v: string): string | null {
  if (!v) return null;
  return new Date(`${v}:00-06:00`).toISOString();
}
function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

type Fila = {
  id: string;
  fecha: string;
  tecnico_id: string;
  tecnico_nombre: string;
  hora_inicio: string;
  hora_fin: string | null;
  almuerzo_inicio: string | null;
  almuerzo_fin: string | null;
  almuerzo_excedido: boolean;
  almuerzo_min: number;
  total_min: number;
  horas_efectivas: number;
  notas: string | null;
};

function JornadaPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const role = highestRole(roles);
  const isStaff = role === "admin" || role === "supervisor";

  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [tecnico, setTecnico] = useState("");
  const [editando, setEditando] = useState<Fila | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const fList = useServerFn(listJornadas);
  const fPersonal = useServerFn(listPersonalJornadas);
  const fAjustar = useServerFn(ajustarJornada);
  const fEliminar = useServerFn(eliminarJornada);

  const jornadas = useQuery({
    queryKey: ["jornadas", desde, hasta, tecnico],
    queryFn: () => fList({ data: { desde, hasta, tecnico_id: tecnico || undefined } }),
  });
  const personal = useQuery({
    queryKey: ["jornadas-personal"],
    queryFn: () => fPersonal(),
    enabled: isStaff,
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

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Jornada laboral"
        description="Marcación diaria de entrada, almuerzo y salida. Las horas efectivas descuentan el tiempo de almuerzo."
        actions={
          <>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls + " w-full sm:w-40"} aria-label="Desde" />
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls + " w-full sm:w-40"} aria-label="Hasta" />
            {isStaff && (
              <select value={tecnico} onChange={(e) => setTecnico(e.target.value)} className={inputCls + " w-full sm:w-52"} aria-label="Colaborador">
                <option value="">Todo el personal</option>
                {((personal.data as { id: string; nombre: string }[] | undefined) ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            )}
            <ExportButton onExport={exportarXls} />
            <button
              type="button"
              onClick={exportarPdf}
              disabled={pdfBusy}
              className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
            >
              {pdfBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />} Descargar PDF
            </button>
          </>
        }
      />

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
                  {isStaff && <th className="text-right px-3 py-2">Acciones</th>}
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
                    {isStaff && (
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

      {editando && (
        <EditarJornadaDialog
          fila={editando}
          saving={guardar.isPending}
          onCancel={() => setEditando(null)}
          onSave={(v) => guardar.mutate(v)}
        />
      )}
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] uppercase font-bold text-muted-foreground">{label}</p>
      <p className={"text-lg font-bold " + (tone === "danger" ? "text-destructive" : tone === "ok" ? "text-accent" : "")}>
        {value}
      </p>
    </div>
  );
}

function EditarJornadaDialog({
  fila, onCancel, onSave, saving,
}: {
  fila: Fila;
  onCancel: () => void;
  saving: boolean;
  onSave: (v: {
    id: string; hora_inicio: string; hora_fin: string | null;
    almuerzo_inicio: string | null; almuerzo_fin: string | null; notas: string | null;
  }) => void;
}) {
  const [ini, setIni] = useState(isoALocal(fila.hora_inicio));
  const [fin, setFin] = useState(isoALocal(fila.hora_fin));
  const [almIni, setAlmIni] = useState(isoALocal(fila.almuerzo_inicio));
  const [almFin, setAlmFin] = useState(isoALocal(fila.almuerzo_fin));
  const [notas, setNotas] = useState(fila.notas ?? "");

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Corregir marcación</h3>
          <p className="text-xs text-muted-foreground">{fila.tecnico_nombre} · {fila.fecha}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Entrada">
            <input type="datetime-local" value={ini} onChange={(e) => setIni(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Salida">
            <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Almuerzo inicio">
            <input type="datetime-local" value={almIni} onChange={(e) => setAlmIni(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Almuerzo fin">
            <input type="datetime-local" value={almFin} onChange={(e) => setAlmFin(e.target.value)} className={inputCls} />
          </Campo>
        </div>
        <Campo label="Notas / justificación">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className={inputCls} />
        </Campo>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="h-9 px-3 text-xs border border-border rounded-md hover:bg-secondary">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !ini}
            onClick={() =>
              onSave({
                id: fila.id,
                hora_inicio: localAIso(ini)!,
                hora_fin: localAIso(fin),
                almuerzo_inicio: localAIso(almIni),
                almuerzo_fin: localAIso(almFin),
                notas: notas.trim() || null,
              })
            }
            className="h-9 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase font-bold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
