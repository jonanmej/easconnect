import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Field, inputCls } from "@/components/RecordDialog";
import { asignarTecnicoMultiple, programarTrabajoMultiplesDias } from "@/lib/operations.functions";
import { etiquetaTrabajo } from "@/lib/servicios";
import { motivoNoLaborableSV } from "@/lib/dias-habiles";
import { Loader2, Plus, Trash2 } from "lucide-react";

type TrabajoLite = {
  id: string;
  folio: string;
  servicio?: string | null;
  nombre_trabajo?: string | null;
  cliente_nombre?: string;
  planta_nombre?: string;
  fecha_programada?: string;
  estado?: string;
};

type TecnicoLite = { id: string; nombre: string };

/**
 * Diálogo: asignar el mismo técnico (y técnicos adicionales) a varias OT a la
 * vez. Muestra un resumen por OT al terminar; las que fallan no bloquean a las
 * demás.
 */
export function AsignarTecnicoMultipleDialog({
  open,
  onOpenChange,
  trabajos,
  tecnicos,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trabajos: TrabajoLite[];
  tecnicos: TecnicoLite[];
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(asignarTecnicoMultiple);
  const [tecnicoId, setTecnicoId] = useState<string>("");
  const [extras, setExtras] = useState<string[]>([]);
  const [resultados, setResultados] = useState<Array<{ id: string; folio: string; ok: boolean; mensaje?: string }> | null>(null);

  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          trabajo_ids: trabajos.map((t) => t.id),
          tecnico_id: tecnicoId || null,
          tecnicos_extra_ids: extras,
        },
      }),
    onSuccess: (res) => {
      setResultados(res as any);
      const okCount = res.filter((r) => r.ok).length;
      const errCount = res.length - okCount;
      if (errCount === 0) toast.success(`Técnico asignado en ${okCount} OT`);
      else toast.warning(`${okCount} OT asignadas, ${errCount} con conflicto`);
      qc.invalidateQueries({ queryKey: ["trabajos"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cerrar = (v: boolean) => {
    if (!v) {
      setResultados(null);
      setTecnicoId("");
      setExtras([]);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Asignar técnico a {trabajos.length} OT</DialogTitle>
        </DialogHeader>
        {resultados ? (
          <div className="space-y-2 max-h-80 overflow-y-auto text-xs">
            {resultados.map((r) => {
              const t = trabajos.find((x) => x.id === r.id);
              return (
                <div key={r.id} className={"rounded border px-3 py-2 " + (r.ok ? "border-accent/40 bg-accent/5" : "border-destructive/40 bg-destructive/5")}>
                  <p className="font-medium">{t?.folio ?? r.folio ?? r.id.slice(0, 8)} · {t ? etiquetaTrabajo(t) : ""}</p>
                  {!r.ok && <p className="text-destructive mt-0.5">{r.mensaje}</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-40 overflow-y-auto rounded border border-border divide-y divide-border text-xs">
              {trabajos.map((t) => (
                <div key={t.id} className="px-3 py-1.5">
                  <span className="font-mono">{t.folio}</span> · {etiquetaTrabajo(t)}
                  {t.cliente_nombre && <span className="text-muted-foreground"> — {t.cliente_nombre}</span>}
                </div>
              ))}
            </div>
            <Field label="Técnico principal">
              <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className={inputCls}>
                <option value="">Sin asignar</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </Field>
            <Field label="Técnicos adicionales (opcional)">
              <div className="max-h-32 overflow-y-auto rounded border border-border p-2 space-y-1">
                {tecnicos.filter((t) => t.id !== tecnicoId).map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={extras.includes(t.id)}
                      onChange={(e) =>
                        setExtras((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)))
                      }
                    />
                    {t.nombre}
                  </label>
                ))}
              </div>
            </Field>
            <p className="text-[11px] text-muted-foreground">
              Se valida la agenda de cada técnico en cada OT; las que tengan conflicto se omiten y se muestran al final.
            </p>
          </div>
        )}
        <DialogFooter>
          {resultados ? (
            <button type="button" onClick={() => cerrar(false)} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">
              Cerrar
            </button>
          ) : (
            <>
              <button type="button" onClick={() => cerrar(false)} className="h-9 px-4 rounded-md border border-border text-sm hover:bg-secondary">
                Cancelar
              </button>
              <button
                type="button"
                disabled={m.isPending || trabajos.length === 0}
                onClick={() => m.mutate()}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
              >
                {m.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Asignar
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Diálogo: programar una OT en varios días específicos (no necesariamente
 * consecutivos). La primera fecha queda como inicio y los demás días se
 * registran como movimientos de día.
 */
export function ProgramarDiasMultiplesDialog({
  open,
  onOpenChange,
  trabajo,
  puedeEmergencia,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trabajo: TrabajoLite | null;
  puedeEmergencia: boolean;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(programarTrabajoMultiplesDias);
  const [fechas, setFechas] = useState<string[]>([]);
  const [nueva, setNueva] = useState("");
  const [emergencia, setEmergencia] = useState(false);
  const [motivo, setMotivo] = useState("");

  const agregar = () => {
    if (!nueva || fechas.includes(nueva)) return;
    setFechas((prev) => [...prev, nueva].sort());
    setNueva("");
  };

  const hayNoLaborable = fechas.some((f) => motivoNoLaborableSV(new Date(`${f}T12:00:00`)));

  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          trabajo_id: trabajo!.id,
          fechas,
          emergencia_no_laborable: emergencia,
          emergencia_motivo: motivo || null,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(`${r.folio}: programada en ${r.dias} día${r.dias === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["trabajos"] });
      cerrar(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cerrar = (v: boolean) => {
    if (!v) {
      setFechas([]);
      setNueva("");
      setEmergencia(false);
      setMotivo("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Programar en varios días{trabajo ? ` — ${trabajo.folio}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {trabajo && (
            <p className="text-xs text-muted-foreground">
              {etiquetaTrabajo(trabajo)}{trabajo.cliente_nombre ? ` — ${trabajo.cliente_nombre}` : ""}
            </p>
          )}
          <Field label="Agregar día">
            <div className="flex gap-2">
              <input type="date" value={nueva} onChange={(e) => setNueva(e.target.value)} className={inputCls} />
              <button type="button" onClick={agregar} disabled={!nueva} className="h-9 px-3 rounded-md border border-border hover:bg-secondary disabled:opacity-40 inline-flex items-center gap-1 text-xs">
                <Plus className="size-3.5" /> Agregar
              </button>
            </div>
          </Field>
          {fechas.length > 0 && (
            <div className="rounded border border-border divide-y divide-border text-xs max-h-44 overflow-y-auto">
              {fechas.map((f) => {
                const nl = motivoNoLaborableSV(new Date(`${f}T12:00:00`));
                return (
                  <div key={f} className="flex items-center justify-between px-3 py-1.5">
                    <span>
                      {new Date(`${f}T12:00:00`).toLocaleDateString("es-SV", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                      {nl && <span className="ml-2 text-amber-600 dark:text-amber-400">({nl === "feriado" ? "feriado" : nl})</span>}
                    </span>
                    <button type="button" onClick={() => setFechas((prev) => prev.filter((x) => x !== f))} className="text-muted-foreground hover:text-destructive" aria-label={`Quitar ${f}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {hayNoLaborable && puedeEmergencia && (
            <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={emergencia} onChange={(e) => setEmergencia(e.target.checked)} />
                Autorizar trabajo en día no laborable (emergencia)
              </label>
              {emergencia && (
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Justificación de la emergencia (mín. 5 caracteres)"
                  className={inputCls}
                />
              )}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            La primera fecha queda como inicio de la OT y los demás días se registran como días movidos. Se valida que el técnico y los equipos estén libres cada día.
          </p>
        </div>
        <DialogFooter>
          <button type="button" onClick={() => cerrar(false)} className="h-9 px-4 rounded-md border border-border text-sm hover:bg-secondary">
            Cancelar
          </button>
          <button
            type="button"
            disabled={m.isPending || fechas.length === 0 || (hayNoLaborable && (!emergencia || motivo.trim().length < 5))}
            onClick={() => m.mutate()}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
          >
            {m.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Programar {fechas.length > 0 ? `(${fechas.length} día${fechas.length === 1 ? "" : "s"})` : ""}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
