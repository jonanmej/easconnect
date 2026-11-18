import { useState, useSyncExternalStore, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmacionActual,
  responderConfirmacion,
  solicitarConfirmacion,
  suscribirConfirmacion,
  type OpcionesConfirmacion,
} from "@/lib/confirm-store";

export type { OpcionesConfirmacion };

/** Reemplazo de window.confirm: `if (await confirmar({ titulo })) ...` */
export const confirmar = solicitarConfirmacion;

export function useConfirm() {
  return confirmar;
}

/** Se monta una sola vez en la raíz de la app. */
export function ConfirmDialogHost() {
  const op = useSyncExternalStore(suscribirConfirmacion, confirmacionActual, () => null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setTexto("");
    setOcupado(false);
  }, [op]);

  const bloqueado = !!op?.textoRequerido && texto.trim() !== op.textoRequerido.trim();

  const aceptar = async () => {
    if (!op || bloqueado || ocupado) return;
    if (op.alConfirmar) {
      setOcupado(true);
      try {
        await op.alConfirmar();
      } catch {
        // El manejador muestra su propio error; el diálogo se cierra igual.
      }
    }
    responderConfirmacion(true);
  };

  return (
    <AlertDialog
      open={!!op}
      onOpenChange={(o) => {
        if (!o && !ocupado) responderConfirmacion(false);
      }}
    >
      {op && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{op.titulo}</AlertDialogTitle>
            {op.descripcion ? (
              <AlertDialogDescription className="whitespace-pre-line">{op.descripcion}</AlertDialogDescription>
            ) : (
              <AlertDialogDescription className="sr-only">Confirma o cancela esta acción.</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          {op.textoRequerido && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-texto" className="text-sm">
                Escribe <span className="font-semibold">{op.textoRequerido}</span> para confirmar
              </Label>
              <Input
                id="confirm-texto"
                value={texto}
                autoComplete="off"
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void aceptar();
                  }
                }}
              />
            </div>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={ocupado}>{op.cancelar ?? "Cancelar"}</AlertDialogCancel>
            <Button
              variant={op.destructivo ? "destructive" : "default"}
              disabled={bloqueado || ocupado}
              onClick={() => void aceptar()}
            >
              {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {op.accion ?? "Confirmar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
