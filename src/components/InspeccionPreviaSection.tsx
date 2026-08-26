import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardCheck, Download, Loader2, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { EvidenciaUploader } from "@/components/EvidenciaUploader";
import {
  getInspeccionPrevia,
  upsertInspeccionPrevia,
  upsertHallazgoPrevio,
  eliminarHallazgoPrevio,
} from "@/lib/inspeccion-previa.functions";
import { listEvidencias } from "@/lib/evidencias.functions";
import {
  AREAS,
  NIVELES,
  RIESGOS,
  SEVERIDADES,
  TIPOS_CUBIERTA,
  type NivelEstado,
} from "@/lib/inspeccion-previa-catalogo";
import { errMsg } from "@/lib/error-msg";

type Form = {
  fecha: string;
  cubierta_tipo: string;
  cubierta_estado: NivelEstado | "";
  estructura_estado: NivelEstado | "";
  accesos_estado: NivelEstado | "";
  circundante_estado: NivelEstado | "";
  riesgos: string[];
  techo_detalle: string;
  accesos_detalle: string;
  circundante_detalle: string;
  observaciones: string;
  apto: boolean;
  restricciones: string;
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

const VACIO: Form = {
  fecha: hoyISO(),
  cubierta_tipo: "",
  cubierta_estado: "",
  estructura_estado: "",
  accesos_estado: "",
  circundante_estado: "",
  riesgos: [],
  techo_detalle: "",
  accesos_detalle: "",
  circundante_detalle: "",
  observaciones: "",
  apto: true,
  restricciones: "",
};

function NivelSelector({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: NivelEstado | "";
  onChange: (v: NivelEstado) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {NIVELES.map((n) => (
          <button
            key={n.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n.value)}
            className={
              "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 " +
              (value === n.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {n.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function InspeccionPreviaSection({
  trabajoId,
  readOnly = false,
}: {
  trabajoId: string;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const cargar = useServerFn(getInspeccionPrevia);
  const guardar = useServerFn(upsertInspeccionPrevia);
  const guardarHallazgo = useServerFn(upsertHallazgoPrevio);
  const borrarHallazgo = useServerFn(eliminarHallazgoPrevio);
  const cargarEvidencias = useServerFn(listEvidencias);

  const { data, isLoading } = useQuery({
    queryKey: ["inspeccion-previa", trabajoId],
    queryFn: () => cargar({ data: { trabajo_id: trabajoId } }),
  });

  const [form, setForm] = useState<Form>(VACIO);
  const [nuevo, setNuevo] = useState({ area: "techo", severidad: "leve", zona_id: "", descripcion: "" });
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    const i: any = data?.inspeccion;
    if (!i) return;
    setForm({
      fecha: (i.fecha ?? hoyISO()).slice(0, 10),
      cubierta_tipo: i.cubierta_tipo ?? "",
      cubierta_estado: i.cubierta_estado ?? "",
      estructura_estado: i.estructura_estado ?? "",
      accesos_estado: i.accesos_estado ?? "",
      circundante_estado: i.circundante_estado ?? "",
      riesgos: Array.isArray(i.riesgos) ? i.riesgos : [],
      techo_detalle: i.techo_detalle ?? "",
      accesos_detalle: i.accesos_detalle ?? "",
      circundante_detalle: i.circundante_detalle ?? "",
      observaciones: i.observaciones ?? "",
      apto: i.apto ?? true,
      restricciones: i.restricciones ?? "",
    });
  }, [data?.inspeccion]);

  const inspeccionId: string | null = (data?.inspeccion as any)?.id ?? null;
  const zonas = data?.zonas ?? [];
  const hallazgos = data?.hallazgos ?? [];
  const zonaNombre = useMemo(
    () => new Map((zonas as any[]).map((z) => [z.id, z.nombre])),
    [zonas],
  );

  const mGuardar = useMutation({
    mutationFn: () =>
      guardar({
        data: {
          ...(inspeccionId ? { id: inspeccionId } : {}),
          trabajo_id: trabajoId,
          fecha: form.fecha,
          cubierta_tipo: form.cubierta_tipo || null,
          cubierta_estado: form.cubierta_estado || null,
          estructura_estado: form.estructura_estado || null,
          accesos_estado: form.accesos_estado || null,
          circundante_estado: form.circundante_estado || null,
          riesgos: form.riesgos,
          techo_detalle: form.techo_detalle || null,
          accesos_detalle: form.accesos_detalle || null,
          circundante_detalle: form.circundante_detalle || null,
          observaciones: form.observaciones || null,
          apto: form.apto,
          restricciones: form.restricciones || null,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Estado previo guardado");
      qc.invalidateQueries({ queryKey: ["inspeccion-previa", trabajoId] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const mHallazgo = useMutation({
    mutationFn: async () => {
      if (!inspeccionId) throw new Error("Guarda primero la inspección");
      return guardarHallazgo({
        data: {
          inspeccion_id: inspeccionId,
          area: nuevo.area as any,
          severidad: nuevo.severidad as any,
          zona_id: nuevo.zona_id || null,
          descripcion: nuevo.descripcion.trim(),
        } as any,
      });
    },
    onSuccess: () => {
      setNuevo({ area: "techo", severidad: "leve", zona_id: "", descripcion: "" });
      qc.invalidateQueries({ queryKey: ["inspeccion-previa", trabajoId] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const mBorrar = useMutation({
    mutationFn: (id: string) => borrarHallazgo({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspeccion-previa", trabajoId] }),
    onError: (e) => toast.error(errMsg(e)),
  });

  async function descargarPdf() {
    if (!data) return;
    setDescargando(true);
    try {
      const [{ generarYDescargarInspeccionPreviaPdf, buildEvidencias }, evidencias] = await Promise.all([
        import("@/lib/pdf/descargar"),
        cargarEvidencias({ data: { trabajo_id: trabajoId } }).catch(() => [] as any[]),
      ]);
      const fotosSrc = (evidencias as any[])
        .filter((e) => e.categoria === "inspeccion_previa" && e.url)
        .map((e) => ({ trabajo: data.trabajo.folio, descripcion: e.descripcion, url: e.url as string }));
      const fotos = fotosSrc.length ? await buildEvidencias(fotosSrc) : [];
      const t = data.trabajo;
      const limpio = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      await generarYDescargarInspeccionPreviaPdf(
        {
          folio: t.folio,
          cliente: t.cliente,
          planta: t.planta,
          ubicacion: t.ubicacion,
          paneles: t.paneles,
          servicio: t.servicio,
          fecha: form.fecha,
          fecha_programada: t.fecha_programada,
          tecnico: data.tecnico_nombre,
          cubierta_tipo: form.cubierta_tipo || null,
          cubierta_estado: form.cubierta_estado || null,
          estructura_estado: form.estructura_estado || null,
          accesos_estado: form.accesos_estado || null,
          circundante_estado: form.circundante_estado || null,
          riesgos: form.riesgos,
          techo_detalle: form.techo_detalle || null,
          accesos_detalle: form.accesos_detalle || null,
          circundante_detalle: form.circundante_detalle || null,
          observaciones: form.observaciones || null,
          apto: form.apto,
          restricciones: form.restricciones || null,
          hallazgos: (hallazgos as any[]).map((h) => ({
            area: h.area,
            severidad: h.severidad,
            descripcion: h.descripcion,
            zona: h.zona_id ? (zonaNombre.get(h.zona_id) ?? null) : null,
          })),
          fotos: fotos.map((f) => ({ descripcion: f.descripcion, dataUrl: f.dataUrl, aspect: f.aspect })),
          emitido_at: new Date().toISOString(),
          responsable: data.tecnico_nombre,
        },
        `Estado-Previo-${limpio(t.planta)}-${form.fecha}.pdf`,
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDescargando(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando estado previo…
      </div>
    );
  }

  const disabled = readOnly;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4 text-primary" />
            Estado previo a trabajos
          </CardTitle>
          <div className="flex items-center gap-2">
            {inspeccionId && (
              <Button size="sm" variant="outline" onClick={descargarPdf} disabled={descargando}>
                {descargando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                <span className="hidden sm:inline">PDF</span>
              </Button>
            )}
            {!disabled && (
              <Button size="sm" onClick={() => mGuardar.mutate()} disabled={mGuardar.isPending}>
                {mGuardar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Guardar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Fecha de inspección</Label>
              <Input
                type="date"
                value={form.fecha}
                disabled={disabled}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo de cubierta / montaje</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                value={form.cubierta_tipo}
                disabled={disabled}
                onChange={(e) => setForm((f) => ({ ...f, cubierta_tipo: e.target.value }))}
              >
                <option value="">Seleccionar…</option>
                {TIPOS_CUBIERTA.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NivelSelector
              label="Techo / cubierta"
              value={form.cubierta_estado}
              disabled={disabled}
              onChange={(v) => setForm((f) => ({ ...f, cubierta_estado: v }))}
            />
            <NivelSelector
              label="Estructura de montaje"
              value={form.estructura_estado}
              disabled={disabled}
              onChange={(v) => setForm((f) => ({ ...f, estructura_estado: v }))}
            />
            <NivelSelector
              label="Accesos y seguridad"
              value={form.accesos_estado}
              disabled={disabled}
              onChange={(v) => setForm((f) => ({ ...f, accesos_estado: v }))}
            />
            <NivelSelector
              label="Sectores circundantes"
              value={form.circundante_estado}
              disabled={disabled}
              onChange={(v) => setForm((f) => ({ ...f, circundante_estado: v }))}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Riesgos y condiciones detectadas</Label>
            {RIESGOS.map((g) => (
              <div key={g.grupo} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.grupo}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {g.items.map((it) => (
                    <label key={it.value} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={form.riesgos.includes(it.value)}
                        disabled={disabled}
                        onCheckedChange={(c) =>
                          setForm((f) => ({
                            ...f,
                            riesgos: c
                              ? [...f.riesgos, it.value]
                              : f.riesgos.filter((r) => r !== it.value),
                          }))
                        }
                      />
                      <span className="leading-tight">{it.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Separator />

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Detalle del techo / cubierta</Label>
              <Textarea
                rows={3}
                value={form.techo_detalle}
                disabled={disabled}
                onChange={(e) => setForm((f) => ({ ...f, techo_detalle: e.target.value }))}
                placeholder="Estado de láminas, sellos, tornillería, daños preexistentes…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Accesos y seguridad</Label>
              <Textarea
                rows={3}
                value={form.accesos_detalle}
                disabled={disabled}
                onChange={(e) => setForm((f) => ({ ...f, accesos_detalle: e.target.value }))}
                placeholder="Rutas de acceso, anclajes, protecciones, iluminación…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sectores circundantes</Label>
              <Textarea
                rows={3}
                value={form.circundante_detalle}
                disabled={disabled}
                onChange={(e) => setForm((f) => ({ ...f, circundante_detalle: e.target.value }))}
                placeholder="Vegetación, canaletas, drenajes, obras vecinas…"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Área apta para iniciar trabajos</p>
                <p className="text-xs text-muted-foreground">
                  Si no es apta, describe la acción correctiva requerida.
                </p>
              </div>
              <Switch
                checked={form.apto}
                disabled={disabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, apto: v }))}
              />
            </div>
            {!form.apto && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                Se registrará como NO APTA en el PDF del reporte.
              </div>
            )}
            <Textarea
              rows={2}
              value={form.restricciones}
              disabled={disabled}
              onChange={(e) => setForm((f) => ({ ...f, restricciones: e.target.value }))}
              placeholder="Restricciones o condiciones para ejecutar el trabajo"
            />
            <Textarea
              rows={2}
              value={form.observaciones}
              disabled={disabled}
              onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
              placeholder="Observaciones generales"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hallazgos por zona</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!inspeccionId && (
            <p className="text-xs text-muted-foreground">
              Guarda la inspección para poder registrar hallazgos.
            </p>
          )}
          {(hallazgos as any[]).map((h) => (
            <div key={h.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {AREAS.find((a) => a.value === h.area)?.label ?? h.area}
                  </Badge>
                  <Badge
                    variant={h.severidad === "critico" ? "destructive" : "secondary"}
                    className="text-[10px]"
                  >
                    {SEVERIDADES.find((s) => s.value === h.severidad)?.label ?? h.severidad}
                  </Badge>
                  {h.zona_id && (
                    <span className="text-[11px] text-muted-foreground">
                      Zona: {zonaNombre.get(h.zona_id) ?? "—"}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-tight">{h.descripcion}</p>
              </div>
              {!disabled && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive"
                  onClick={() => mBorrar.mutate(h.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}

          {!disabled && inspeccionId && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                  value={nuevo.area}
                  onChange={(e) => setNuevo((n) => ({ ...n, area: e.target.value }))}
                >
                  {AREAS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                  value={nuevo.severidad}
                  onChange={(e) => setNuevo((n) => ({ ...n, severidad: e.target.value }))}
                >
                  {SEVERIDADES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                  value={nuevo.zona_id}
                  onChange={(e) => setNuevo((n) => ({ ...n, zona_id: e.target.value }))}
                >
                  <option value="">Sin zona específica</option>
                  {(zonas as any[]).map((z) => (
                    <option key={z.id} value={z.id}>{z.nombre}</option>
                  ))}
                </select>
              </div>
              <Textarea
                rows={2}
                value={nuevo.descripcion}
                onChange={(e) => setNuevo((n) => ({ ...n, descripcion: e.target.value }))}
                placeholder="Describe el hallazgo (daño preexistente, riesgo, obstrucción…)"
              />
              <Button
                size="sm"
                onClick={() => mHallazgo.mutate()}
                disabled={mHallazgo.isPending || nuevo.descripcion.trim().length < 3}
              >
                {mHallazgo.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Agregar hallazgo
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registro fotográfico del estado previo</CardTitle>
        </CardHeader>
        <CardContent>
          <EvidenciaUploader trabajoId={trabajoId} readOnly={disabled} soloCategoria="inspeccion_previa" />
        </CardContent>
      </Card>
    </div>
  );
}
