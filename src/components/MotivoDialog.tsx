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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Diálogo con un área de texto para un motivo (obligatorio si `minimo` > 0). */
export function MotivoDialog({
  open,
  titulo,
  descripcion,
  etiqueta = "Motivo",
  minimo = 0,
  accion = "Confirmar",
  destructivo = false,
  ocupado = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  titulo: string;
  descripcion?: string;
  etiqueta?: string;
  minimo?: number;
  accion?: string;
  destructivo?: boolean;
  ocupado?: boolean;
  onConfirm: (motivo: string) => void;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [tocado, setTocado] = useState(false);
  useEffect(() => {
    if (open) {
      setMotivo("");
      setTocado(false);
    }
  }, [open]);
  const limpio = motivo.trim();
  const error = minimo > 0 && limpio.length < minimo ? `Escribe al menos ${minimo} caracteres.` : null;
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setTocado(true);
    if (error || ocupado) return;
    onConfirm(limpio);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-base">{titulo}</DialogTitle>
            <DialogDescription>{descripcion ?? (minimo > 0 ? "El motivo es obligatorio." : "El motivo es opcional.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-dialog">
              {etiqueta}
              {minimo > 0 ? ` (mínimo ${minimo} caracteres)` : " (opcional)"}
            </Label>
            <Textarea
              id="motivo-dialog"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              onBlur={() => setTocado(true)}
              rows={4}
              aria-invalid={tocado && !!error}
              aria-describedby={tocado && error ? "motivo-dialog-error" : undefined}
            />
            {tocado && error && (
              <p id="motivo-dialog-error" className="text-xs text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={ocupado}>Cancelar</Button>
            <Button type="submit" variant={destructivo ? "destructive" : "default"} disabled={ocupado}>
              {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {accion}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
