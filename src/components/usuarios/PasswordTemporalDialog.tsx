import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type PasswordTemporal = { email: string; password: string; motivo: string };

/** Muestra una contraseña temporal una sola vez. No se registra ni se guarda. */
export function PasswordTemporalDialog({
  datos,
  onClose,
}: {
  datos: PasswordTemporal | null;
  onClose: () => void;
}) {
  const [copiada, setCopiada] = useState(false);
  const copiar = async () => {
    if (!datos) return;
    try {
      await navigator.clipboard.writeText(datos.password);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2500);
    } catch {
      toast.error("No se pudo copiar. Selecciona la contraseña y cópiala manualmente.");
    }
  };
  return (
    <Dialog
      open={!!datos}
      onOpenChange={(o) => {
        if (!o) {
          setCopiada(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base">Cuenta creada: el correo no se envió</DialogTitle>
          <DialogDescription>
            No se pudo enviar el correo a {datos?.email} ({datos?.motivo}). Entrega manualmente esta contraseña temporal.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 select-all break-all rounded-md border border-border bg-secondary px-3 py-2.5 font-mono text-base tabular-nums">
            {datos?.password}
          </code>
          <Button type="button" variant="outline" onClick={copiar} aria-live="polite">
            {copiada ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
            {copiada ? "Copiada" : "Copiar"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Esta contraseña no se volverá a mostrar. Entrégala por un canal seguro; se pedirá cambiarla al ingresar.
        </p>
        <DialogFooter>
          <Button type="button" onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
