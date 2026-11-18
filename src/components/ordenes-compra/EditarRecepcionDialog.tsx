import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseDecimal } from "@/lib/parse-decimal";

export type EdicionRecepcion = { cantidad: number; costo: number; motivo: string };

export function EditarRecepcionDialog({
  ri,
  onClose,
  onSubmit,
}: {
  ri: any | null;
  onClose: () => void;
  onSubmit: (v: EdicionRecepcion) => Promise<void>;
}) {
  const [cant, setCant] = useState("");
  const [costo, setCosto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (ri) {
      setCant(String(ri.cantidad ?? ""));
      setCosto(String(ri.costo_unitario ?? ""));
      setMotivo("");
      setIntentado(false);
      setOcupado(false);
    }
  }, [ri]);

  const nCant = parseDecimal(cant);
  const nCosto = parseDecimal(costo);
  const errCant = nCant == null ? "Ingresa un número válido." : nCant <= 0 ? "La cantidad debe ser mayor que 0." : null;
  const errCosto = nCosto == null ? "Ingresa un número válido." : nCosto < 0 ? "El costo no puede ser negativo." : null;
  const errMotivo = motivo.trim().length < 3 ? "Escribe al menos 3 caracteres." : null;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (errCant || errCosto || errMotivo || nCant == null || nCosto == null) return;
    setOcupado(true);
    try {
      await onSubmit({ cantidad: nCant, costo: nCosto, motivo: motivo.trim() });
    } finally {
      setOcupado(false);
    }
  };

  const campo = (id: string, err: string | null) => ({
    id,
    "aria-invalid": intentado && !!err,
    "aria-describedby": intentado && err ? `${id}-error` : undefined,
  });
  const msg = (id: string, err: string | null) =>
    intentado && err ? <p id={`${id}-error`} className="text-xs text-destructive">{err}</p> : null;

  return (
    <Dialog open={!!ri} onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-base">Editar recepción</DialogTitle>
            <DialogDescription>
              {ri?.inventario_items?.nombre ?? "Ítem"} · actual {Number(ri?.cantidad ?? 0).toFixed(2)} a{" "}
              {Number(ri?.costo_unitario ?? 0).toFixed(4)}. El stock se reconcilia al guardar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ri-cant">Cantidad</Label>
              <Input inputMode="decimal" className="tabular-nums" value={cant} onChange={(e) => setCant(e.target.value)} {...campo("ri-cant", errCant)} />
              {msg("ri-cant", errCant)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ri-costo">Costo unitario</Label>
              <Input inputMode="decimal" className="tabular-nums" value={costo} onChange={(e) => setCosto(e.target.value)} {...campo("ri-costo", errCosto)} />
              {msg("ri-costo", errCosto)}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ri-motivo">Motivo (mínimo 3 caracteres)</Label>
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} {...campo("ri-motivo", errMotivo)} />
            {msg("ri-motivo", errMotivo)}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={ocupado}>Cancelar</Button>
            <Button type="submit" disabled={ocupado}>
              {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
