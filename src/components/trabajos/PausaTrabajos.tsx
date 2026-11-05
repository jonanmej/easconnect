import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { pausarTrabajos, reanudarTrabajo } from "@/lib/operations.functions";
import { motivoNoLaborableSV } from "@/lib/dias-habiles";

type Modo = { tipo: "ots"; ids: string[] } | { tipo: "cliente" };

/** Pausa OT programadas por falta de confirmación del cliente (solo admin). */
export function PausarTrabajosDialog({
  open, onOpenChange, modo, clientes, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modo: Modo;
  clientes: Array<{ id: string; nombre: string; programadas: number }>;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(pausarTrabajos);
  const [motivo, setMotivo] = useState("Falta de confirmación del cliente");
  const [clienteId, setClienteId] = useState("");
  const m = useMutation({
    mutationFn: () =>
      fn({ data: modo.tipo === "ots" ? { trabajoIds: modo.ids, motivo } : { clienteId, motivo } }),
    onSuccess: (r) => {
      toast.success(r.pausadas === 1 ? "1 OT en pausa" : `${r.pausadas} OT en pausa`);
      qc.invalidateQueries({ queryKey: ["trabajos"] });
      qc.invalidateQueries({ queryKey: ["disponibilidad"] });
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const valido = motivo.trim().length >= 3 && (modo.tipo === "ots" ? modo.ids.length > 0 : !!clienteId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pausar programación</DialogTitle>
          <DialogDescription>
            Las OT pausadas salen del calendario y liberan su equipo. Para retomarlas, usa «Reanudar» y elige la nueva fecha.
          </DialogDescription>
        </DialogHeader>
        {modo.tipo === "ots" ? (
          <p className="text-sm">Se pausarán <b>{modo.ids.length}</b> OT seleccionadas (solo las que estén programadas).</p>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="pausa-cliente">Cliente</Label>
            <select
              id="pausa-cliente"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecciona un cliente…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} ({c.programadas} programadas)</option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="pausa-motivo">Motivo</Label>
          <Textarea id="pausa-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!valido || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Pausando…" : "Pausar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reanuda una OT pausada con una fecha nueva elegida a mano (solo admin). */
export function ReanudarTrabajoDialog({
  trabajo, onOpenChange,
}: {
  trabajo: { id: string; folio: string; pausa_motivo?: string | null } | null;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(reanudarTrabajo);
  const [fecha, setFecha] = useState("");
  const [emergenciaMotivo, setEmergenciaMotivo] = useState("");
  const noLaborable = fecha ? motivoNoLaborableSV(`${fecha}T12:00:00Z`) : null;
  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          id: trabajo!.id,
          fecha,
          emergencia: noLaborable ? { permitir: true, motivo: emergenciaMotivo } : undefined,
        },
      }),
    onSuccess: () => {
      toast.success(`${trabajo?.folio} reanudada`);
      qc.invalidateQueries({ queryKey: ["trabajos"] });
      qc.invalidateQueries({ queryKey: ["disponibilidad"] });
      setFecha("");
      setEmergenciaMotivo("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={!!trabajo} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reanudar {trabajo?.folio}</DialogTitle>
          <DialogDescription>
            {trabajo?.pausa_motivo ? `En pausa por: ${trabajo.pausa_motivo}. ` : ""}Elige la nueva fecha de inicio; se conserva la hora y la duración.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reanudar-fecha">Nueva fecha de inicio</Label>
          <Input id="reanudar-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        {noLaborable && (
          <div className="space-y-1.5">
            <Label htmlFor="reanudar-emerg" className="text-destructive">
              Es {noLaborable === "feriado" ? "un día feriado" : `un ${noLaborable}`}. Justifica la emergencia:
            </Label>
            <Textarea id="reanudar-emerg" value={emergenciaMotivo} onChange={(e) => setEmergenciaMotivo(e.target.value)} rows={2} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!fecha || m.isPending || (!!noLaborable && emergenciaMotivo.trim().length < 5)}
            onClick={() => m.mutate()}
          >
            {m.isPending ? "Reanudando…" : "Reanudar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
