import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, FileText, ExternalLink, Upload, Plus, Sparkles, ChevronDown, ClipboardList, FileBox, Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listReportesDiarios,
  upsertReporteDiario,
  eliminarReporteDiario,
  listReportesPDF,
  registrarReportePDF,
  eliminarReportePDF,
} from "@/lib/reportes-diarios.functions";
import { getJornadaHoy } from "@/lib/jornadas.functions";
import { generarEjecutivoDesdeDiarios } from "@/lib/reportes.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { EvidenciaUploader } from "@/components/EvidenciaUploader";

const BUCKET = "trabajos-evidencia";
const ST_SOLAR_EMAIL = "st.solar@easervice.app";
const inputCls = "w-full h-9 px-3 rounded-md border border-input bg-background text-sm";
const textareaCls = "w-full px-3 py-2 rounded-md border border-input bg-background text-sm";

function today() { return new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" }); }
function fmtHora(h?: string | null): string {
  if (!h) return "—";
  const m = /^(\d{2}):(\d{2})/.exec(h);
  return m ? `${m[1]}:${m[2]}` : String(h);
}

export function ReportesDiariosSection({
  trabajoId,
  readOnly = false,
  hint,
}: {
  trabajoId: string;
  /** Cuando es true, el formulario y el uploader de fotos quedan deshabilitados. */
  readOnly?: boolean;
  /** Aviso mostrado sobre la sección (por ejemplo: "Se llena desde A.T."). */
  hint?: string;
}) {
  const { user, roles } = useAuth();
  const role = highestRole(roles);
  const isStaff = role === "admin" || role === "supervisor";
  const isStSolar = (user?.email ?? "").toLowerCase() === ST_SOLAR_EMAIL;
  const qc = useQueryClient();

  const fList = useServerFn(listReportesDiarios);
  const fUpsert = useServerFn(upsertReporteDiario);
  const fDel = useServerFn(eliminarReporteDiario);
  const fListPdf = useServerFn(listReportesPDF);
  const fRegPdf = useServerFn(registrarReportePDF);
  const fDelPdf = useServerFn(eliminarReportePDF);
  const fGen = useServerFn(generarEjecutivoDesdeDiarios);

  const diarios = useQuery({
    queryKey: ["diarios", trabajoId],
    queryFn: () => fList({ data: { trabajo_id: trabajoId } }),
    enabled: !isStSolar,
  });
  const trabajoInfo = useQuery({
    queryKey: ["trabajo-info-diarios", trabajoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trabajos")
        .select("duracion_dias, planta:plantas(paneles)")
        .eq("id", trabajoId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
  const pdfs = useQuery({
    queryKey: ["diarios-pdf", trabajoId],
    queryFn: () => fListPdf({ data: { trabajo_id: trabajoId } }),
  });

  const save = useMutation({
    mutationFn: (v: any) => fUpsert({ data: { trabajo_id: trabajoId, ...v } }),
    onSuccess: async () => {
      toast.success("Reporte diario guardado. Adjunta las fotos del día en «Evidencias de este día» dentro del reporte recién creado.");
      await qc.invalidateQueries({ queryKey: ["diarios", trabajoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => fDel({ data: { id } }),
    onSuccess: () => {
      toast.success("Reporte diario eliminado");
      qc.invalidateQueries({ queryKey: ["diarios", trabajoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delPdf = useMutation({
    mutationFn: (id: string) => fDelPdf({ data: { id } }),
    onSuccess: () => {
      toast.success("PDF eliminado");
      qc.invalidateQueries({ queryKey: ["diarios-pdf", trabajoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const gen = useMutation({
    mutationFn: () => fGen({ data: { trabajo_id: trabajoId } }),
    onSuccess: () => {
      toast.success("Reporte ejecutivo generado. Disponible en Reportes.");
      qc.invalidateQueries({ queryKey: ["reportes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const diariosArr = (diarios.data as any[] | undefined) ?? [];
  const pdfsArr = (pdfs.data as any[] | undefined) ?? [];

  return (
    <div className="pt-2 border-t border-border space-y-3">
      {hint && (
        <p className="text-[11px] text-muted-foreground bg-secondary/50 border border-border rounded-md px-2.5 py-1.5">
          {hint}
        </p>
      )}
      {/* Resumen + CTA ejecutivo */}
      <div className="flex flex-wrap items-center gap-2">
        {!isStSolar && (
          <SummaryChip icon={ClipboardList} label="Diarios" value={diariosArr.length} />
        )}
        <SummaryChip icon={FileBox} label="PDFs" value={pdfsArr.length} />
        {isStaff && !isStSolar && (
          <button
            type="button"
            onClick={() => gen.mutate()}
            disabled={gen.isPending || diariosArr.length === 0}
            className="ml-auto h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md disabled:opacity-50"
            title={diariosArr.length === 0 ? "Registra al menos un reporte diario" : ""}
          >
            <Sparkles className="size-3.5" />
            {gen.isPending ? "Generando…" : "Reporte ejecutivo"}
          </button>
        )}
      </div>

      {/* Reportes diarios */}
      {!isStSolar && (
        <Section
          icon={ClipboardList}
          title="Reportes diarios"
          subtitle="Avance del día por técnico"
          count={diariosArr.length}
          defaultOpen
        >
          {!readOnly && (
            <DiarioForm
              onSave={(v) => save.mutateAsync(v)}
              saving={save.isPending}
              panelesPlanta={(trabajoInfo.data as any)?.planta?.paneles ?? null}
              duracionDias={(trabajoInfo.data as any)?.duracion_dias ?? null}
            />
          )}
          <div className="space-y-1.5 mt-2">
            {diarios.isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
            {!diarios.isLoading && diariosArr.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin reportes diarios todavía.</p>
            )}
            {diariosArr.map((d, idx) => {
            const mine = d.tecnico_id === user?.id;
            const canDelete = mine || isStaff;
            return (
              <details key={d.id} open={idx === 0} className="rounded-md border border-border bg-card group">
                <summary className="px-3 py-2 flex items-center gap-2 cursor-pointer text-sm list-none [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180 shrink-0" />
                  <span className="font-mono text-xs text-muted-foreground">{d.fecha}</span>
                    <span className="font-medium truncate">{d.tecnico_nombre}</span>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-primary">
                    <Camera className="size-3" /> Fotos del día
                  </span>
                  {typeof d.avance_pct === "number" && (
                    <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {d.avance_pct}%
                    </span>
                  )}
                </summary>
                <div className="px-3 pb-3 pt-1 text-xs space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Stat label="Paneles" value={d.paneles_limpiados ?? "—"} />
                    <Stat label="Agua (gal)" value={d.agua_galones ?? "—"} />
                    <Stat label="Horas" value={d.horas_trabajadas ?? "—"} />
                    <Stat label="Clima" value={d.clima ?? "—"} />
                  </div>
                  {(d.watts_panel || d.paneles_limpiados) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Stat label="Watts / panel" value={d.watts_panel ? `${d.watts_panel} W` : "—"} />
                      <Stat
                        label="Watts totales"
                        value={
                          d.watts_panel && d.paneles_limpiados
                            ? `${Number(d.watts_panel * d.paneles_limpiados).toLocaleString("es-CL")} W`
                            : "—"
                        }
                      />
                    </div>
                  )}
                  {(d.hora_inicio || d.hora_fin) && (
                    <div className="grid grid-cols-2 gap-2">
                      <Stat label="Hora inicio" value={fmtHora(d.hora_inicio)} />
                      <Stat label="Hora fin" value={fmtHora(d.hora_fin)} />
                    </div>
                  )}
                  {(d.tds_ppm != null || d.angulo_inclinacion != null || d.presion_agua_psi != null) && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <Stat label="TDS (PPM)" value={d.tds_ppm ?? "—"} />
                      <Stat label="Ángulo (°)" value={d.angulo_inclinacion ?? "—"} />
                      <Stat label="Presión (PSI)" value={d.presion_agua_psi ?? "—"} />
                    </div>
                  )}
                  {d.trabajo_realizado && <Block title="Trabajo realizado">{d.trabajo_realizado}</Block>}
                  {d.hallazgos && <Block title="Hallazgos">{d.hallazgos}</Block>}
                  {d.observaciones && <Block title="Observaciones">{d.observaciones}</Block>}
                  <div className="pt-2 border-t border-border/60">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold mb-1">
                      Evidencias de este día
                    </p>
                    {readOnly ? (
                      <EvidenciaUploaderReadOnly trabajoId={trabajoId} reporteDiarioId={d.id} />
                    ) : (
                      <EvidenciaUploader trabajoId={trabajoId} reporteDiarioId={d.id} />
                    )}
                  </div>
                  {canDelete && !readOnly && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => { if (confirm("¿Eliminar este reporte diario?")) del.mutate(d.id); }}
                        className="text-destructive text-xs inline-flex items-center gap-1 hover:underline"
                      >
                        <Trash2 className="size-3" /> Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
          </div>
        </Section>
      )}

      {/* PDFs */}
      <Section
        icon={FileBox}
        title="Reportes PDF"
        subtitle={isStSolar ? "Sube un PDF por jornada" : "Documentos adjuntos por jornada"}
        count={pdfsArr.length}
        defaultOpen={isStSolar}
      >
        <PDFSection
          trabajoId={trabajoId}
          pdfs={pdfsArr}
          loading={pdfs.isLoading}
          canUpload={!readOnly}
          onUploaded={() => qc.invalidateQueries({ queryKey: ["diarios-pdf", trabajoId] })}
          onDelete={(id) => delPdf.mutate(id)}
          registrar={fRegPdf}
          currentUserId={user?.id ?? ""}
          isStaff={isStaff}
        />
      </Section>
    </div>
  );
}

/** Uploader deshabilitado: sólo muestra las fotos ya adjuntas al reporte diario. */
function EvidenciaUploaderReadOnly({ trabajoId, reporteDiarioId }: { trabajoId: string; reporteDiarioId: string }) {
  return (
    <div>
      <EvidenciaUploader trabajoId={trabajoId} reporteDiarioId={reporteDiarioId} readOnly />
      <p className="text-[10px] text-muted-foreground mt-1">
        La subida de fotos está disponible desde el módulo <strong>A.T.</strong> (Terreno).
      </p>
    </div>
  );
}

function SummaryChip({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-secondary/40 text-xs">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Section({
  icon: Icon, title, subtitle, count, defaultOpen = false, children,
}: {
  icon: any; title: string; subtitle?: string; count?: number; defaultOpen?: boolean; children: any;
}) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-border bg-card overflow-hidden">
      <summary className="px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-secondary/40 list-none [&::-webkit-details-marker]:hidden">
        <Icon className="size-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight truncate">{title}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {typeof count === "number" && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-foreground/70">{count}</span>
        )}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-3 pt-1 border-t border-border">{children}</div>
    </details>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border border-border bg-secondary/30 px-2 py-1">
      <p className="text-[9px] uppercase text-muted-foreground">{label}</p>
      <p className="text-xs font-mono">{String(value)}</p>
    </div>
  );
}
function Block({ title, children }: { title: string; children: any }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground font-bold">{title}</p>
      <p className="whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function DiarioForm({
  onSave, saving, panelesPlanta, duracionDias,
}: {
  onSave: (v: any) => Promise<unknown>;
  saving: boolean;
  panelesPlanta: number | null;
  duracionDias: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [panelesDia, setPanelesDia] = useState<string>("");
  const [wattsPanel, setWattsPanel] = useState<string>("");
  const [horaInicio, setHoraInicio] = useState<string>("");
  const [horaFin, setHoraFin] = useState<string>("");
  const formRef = useRef<HTMLDivElement>(null);
  const fJornada = useServerFn(getJornadaHoy);
  const jornada = useQuery({
    queryKey: ["jornada-hoy"],
    queryFn: () => fJornada(),
    enabled: open,
    staleTime: 60_000,
  });
  // Autocompletar horas desde la jornada al abrir el formulario
  useEffect(() => {
    if (!open) return;
    const j: any = jornada.data;
    if (!j) return;
    const toHM = (iso: string | null | undefined) => {
      if (!iso) return "";
      const d = new Date(iso);
      const parts = d.toLocaleTimeString("es-SV", { timeZone: "America/El_Salvador", hour12: false, hour: "2-digit", minute: "2-digit" });
      return parts;
    };
    setHoraInicio((prev) => prev || toHM(j.hora_inicio));
    setHoraFin((prev) => prev || toHM(j.hora_fin));
  }, [open, jornada.data]);
  const expectedDia = useMemo(() => {
    if (!panelesPlanta || !duracionDias || duracionDias <= 0) return null;
    return panelesPlanta / duracionDias;
  }, [panelesPlanta, duracionDias]);
  const avancePct = useMemo(() => {
    const n = Number(panelesDia);
    if (!expectedDia || !Number.isFinite(n) || n <= 0) return null;
    return Math.min(100, Math.round((n / expectedDia) * 100));
  }, [panelesDia, expectedDia]);
  const horasCalc = useMemo(() => {
    if (!horaInicio || !horaFin) return null;
    const [hi, mi] = horaInicio.split(":").map(Number);
    const [hf, mf] = horaFin.split(":").map(Number);
    if ([hi, mi, hf, mf].some((v) => !Number.isFinite(v))) return null;
    let diff = (hf * 60 + mf) - (hi * 60 + mi);
    if (diff < 0) diff += 24 * 60;
    return Math.round((diff / 60) * 100) / 100;
  }, [horaInicio, horaFin]);
  const wattsTotales = useMemo(() => {
    const p = Number(panelesDia);
    const w = Number(wattsPanel);
    if (!Number.isFinite(p) || !Number.isFinite(w) || p <= 0 || w <= 0) return null;
    return Math.round(p * w);
  }, [panelesDia, wattsPanel]);
  async function submit(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault(); e.stopPropagation();
    const root = formRef.current;
    if (!root) return;
    const get = (name: string): string => {
      const el = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
      return el?.value ?? "";
    };
    const num = (n: string) => {
      const v = get(n);
      return v === "" ? null : Number(v);
    };
    try {
      await onSave({
        fecha: get("fecha") || today(),
        avance_pct: avancePct,
        paneles_limpiados: num("paneles_limpiados"),
        agua_galones: num("agua_galones"),
        watts_panel: num("watts_panel"),
        horas_trabajadas: horasCalc ?? num("horas_trabajadas"),
        tds_ppm: num("tds_ppm"),
        angulo_inclinacion: num("angulo_inclinacion"),
        presion_agua_psi: num("presion_agua_psi"),
        hora_inicio: horaInicio || null,
        hora_fin: horaFin || null,
        clima: get("clima") || null,
        trabajo_realizado: get("trabajo_realizado") || null,
        hallazgos: get("hallazgos") || null,
        observaciones: get("observaciones") || null,
      });
      // Limpiar campos solo si el guardado fue exitoso
      root.querySelectorAll("input, textarea").forEach((el) => {
        const node = el as HTMLInputElement | HTMLTextAreaElement;
        if (node.type !== "date") node.value = "";
      });
      setPanelesDia("");
      setWattsPanel("");
      setHoraInicio("");
      setHoraFin("");
      setOpen(false);
    } catch {
      // El toast de error ya se mostró desde la mutación; mantener el formulario abierto.
    }
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <Plus className="size-3.5" /> Registrar reporte del día
      </button>
    );
  }
  return (
    <div ref={formRef} className="space-y-3 rounded-md border border-border p-3 bg-secondary/20">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <FieldS label="Fecha"><input name="fecha" type="date" defaultValue={today()} className={inputCls} /></FieldS>
        <FieldS label="Avance % (calculado)">
          <input
            value={avancePct == null ? "" : `${avancePct}%`}
            readOnly
            placeholder={expectedDia ? `Meta diaria: ${Math.round(expectedDia)} paneles` : "Falta planta/duración"}
            className={inputCls + " bg-secondary/50 text-muted-foreground"}
          />
        </FieldS>
        <FieldS label="Hora de inicio">
          <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.currentTarget.value)} className={inputCls} />
        </FieldS>
        <FieldS label="Hora de fin">
          <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.currentTarget.value)} className={inputCls} />
        </FieldS>
        <FieldS label="Horas trabajadas">
          <input
            name="horas_trabajadas"
            type="number"
            min={0}
            step="0.25"
            key={horasCalc != null ? "calc" : "manual"}
            defaultValue={horasCalc != null ? String(horasCalc) : ""}
            readOnly={horasCalc != null}
            placeholder={horasCalc != null ? "" : "Se calcula desde las horas"}
            className={inputCls + (horasCalc != null ? " bg-secondary/50 text-muted-foreground" : "")}
          />
        </FieldS>
        <FieldS label="Paneles limpiados">
          <input
            name="paneles_limpiados"
            type="number"
            min={0}
            value={panelesDia}
            onChange={(e) => setPanelesDia(e.currentTarget.value)}
            className={inputCls}
          />
        </FieldS>
        <FieldS label="Agua (gal)"><input name="agua_galones" type="number" min={0} step="0.1" className={inputCls} /></FieldS>
        <FieldS label="Watts del panel instalado">
          <input
            name="watts_panel"
            type="number"
            min={0}
            step="1"
            value={wattsPanel}
            onChange={(e) => setWattsPanel(e.currentTarget.value)}
            placeholder="Ej. 550"
            className={inputCls}
          />
        </FieldS>
        <FieldS label="Watts totales (calculado)">
          <input
            value={wattsTotales == null ? "" : `${wattsTotales.toLocaleString("es-CL")} W`}
            readOnly
            placeholder="Paneles × Watts"
            className={inputCls + " bg-secondary/50 text-muted-foreground"}
          />
        </FieldS>
        <FieldS label="Clima"><input name="clima" className={inputCls} placeholder="Soleado, viento…" /></FieldS>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <FieldS label="TDS (PPM)">
          <input name="tds_ppm" type="number" min={0} step="1" placeholder="Ej. 150" className={inputCls} />
        </FieldS>
        <FieldS label="Ángulo de inclinación (°)">
          <input name="angulo_inclinacion" type="number" step="0.1" placeholder="Ej. 15" className={inputCls} />
        </FieldS>
        <FieldS label="Presión de agua (PSI)">
          <input name="presion_agua_psi" type="number" min={0} step="1" placeholder="Ej. 60" className={inputCls} />
        </FieldS>
      </div>
      <FieldS label="Trabajo realizado hoy"><textarea name="trabajo_realizado" rows={2} className={textareaCls} /></FieldS>
      <FieldS label="Hallazgos"><textarea name="hallazgos" rows={2} className={textareaCls} /></FieldS>
      <FieldS label="Observaciones"><textarea name="observaciones" rows={2} className={textareaCls} /></FieldS>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => setOpen(false)} className="h-9 px-3 rounded-md border border-input text-xs">Cancelar</button>
        <button type="button" onClick={submit} disabled={saving} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          {saving ? "Guardando…" : "Guardar reporte del día"}
        </button>
      </div>
    </div>
  );
}

function FieldS({ label, children }: { label: string; children: any }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function PDFSection({
  trabajoId, pdfs, loading, canUpload, onUploaded, onDelete, registrar, currentUserId, isStaff,
}: {
  trabajoId: string;
  pdfs: any[];
  loading: boolean;
  canUpload: boolean;
  onUploaded: () => void;
  onDelete: (id: string) => void;
  registrar: any;
  currentUserId: string;
  isStaff: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fecha, setFecha] = useState(today());

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Solo se permiten archivos PDF.");
      return;
    }
    setUploading(true);
    try {
      const path = `reportes-pdf/${trabajoId}/${crypto.randomUUID()}.pdf`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (upErr) throw upErr;
      await registrar({
        data: {
          trabajo_id: trabajoId, fecha,
          storage_path: path,
          nombre_original: file.name,
          tamanio_bytes: file.size,
        },
      });
      toast.success("PDF subido");
      onUploaded();
    } catch (err: any) {
      toast.error(err.message ?? "Error al subir");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2 pt-3 border-t border-border">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reportes PDF</p>
      {canUpload && (
        <div className="flex flex-wrap items-end gap-2">
          <FieldS label="Fecha del PDF">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
          </FieldS>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={onPick} className="hidden" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-dashed border-border rounded-md hover:bg-secondary disabled:opacity-50"
          >
            <Upload className="size-3.5" /> {uploading ? "Subiendo…" : "Subir PDF"}
          </button>
        </div>
      )}
      {loading && <p className="text-xs text-muted-foreground">Cargando PDFs…</p>}
      {!loading && pdfs.length === 0 && <p className="text-xs text-muted-foreground">Sin PDFs cargados.</p>}
      <ul className="space-y-1">
        {pdfs.map((p) => {
          const canDelete = isStaff || p.subido_por === currentUserId;
          return (
            <li key={p.id} className="flex items-center gap-2 text-xs border border-border rounded-md px-3 py-2 bg-card">
              <FileText className="size-3.5 text-muted-foreground shrink-0" />
              <span className="font-mono text-[10px] text-muted-foreground">{p.fecha}</span>
              <span className="truncate flex-1">{p.nombre_original ?? "PDF"}</span>
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  <ExternalLink className="size-3" /> Abrir
                </a>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => { if (confirm("¿Eliminar este PDF?")) onDelete(p.id); }}
                  className="text-destructive hover:underline inline-flex items-center gap-1"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}