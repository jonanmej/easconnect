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

const SUGERIDAS = ["Fotovoltaica", "Motores HFO", "GPS", "PVSTOP", "ChemitekSolar"];

export function NuevoServicioDialog({
  open,
  ocupado,
  onClose,
  onSubmit,
}: {
  open: boolean;
  ocupado: boolean;
  onClose: () => void;
  onSubmit: (v: { nombre: string; categoria: string }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("Fotovoltaica");
  const [intentado, setIntentado] = useState(false);
  useEffect(() => {
    if (open) {
      setNombre("");
      setCategoria("Fotovoltaica");
      setIntentado(false);
    }
  }, [open]);
  const errNombre = nombre.trim().length < 3 ? "Escribe el nombre (mínimo 3 caracteres)." : null;
  const errCat = !categoria.trim() ? "Indica la categoría." : null;
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIntentado(true);
    if (errNombre || errCat || ocupado) return;
    onSubmit({ nombre: nombre.trim(), categoria: categoria.trim() });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-base">Agregar servicio al catálogo</DialogTitle>
            <DialogDescription>El servicio quedará disponible para todas las OT.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ns-nombre">Nombre del nuevo servicio</Label>
            <Input id="ns-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
              aria-invalid={intentado && !!errNombre} aria-describedby={intentado && errNombre ? "ns-nombre-error" : undefined} />
            {intentado && errNombre && <p id="ns-nombre-error" className="text-xs text-destructive">{errNombre}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ns-cat">Categoría del servicio</Label>
            <Input id="ns-cat" list="ns-cat-opciones" value={categoria} onChange={(e) => setCategoria(e.target.value)}
              aria-invalid={intentado && !!errCat} aria-describedby={intentado && errCat ? "ns-cat-error" : undefined} />
            <datalist id="ns-cat-opciones">
              {SUGERIDAS.map((c) => <option key={c} value={c} />)}
            </datalist>
            {intentado && errCat && <p id="ns-cat-error" className="text-xs text-destructive">{errCat}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={ocupado}>Cancelar</Button>
            <Button type="submit" disabled={ocupado}>
              {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
