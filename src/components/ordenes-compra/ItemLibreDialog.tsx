import { useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

export const CATEGORIAS_INVENTARIO = [
  { value: "insumo", label: "Insumo" },
  { value: "repuesto", label: "Repuesto" },
  { value: "herramienta", label: "Herramienta" },
  { value: "epp", label: "EPP" },
  { value: "equipo", label: "Equipo" },
  { value: "electrico", label: "Eléctrico" },
  { value: "quimico", label: "Químico" },
] as const;
export type CategoriaInventario = (typeof CATEGORIAS_INVENTARIO)[number]["value"];

export type ResolucionItemLibre =
  | { modo: "crear"; categoria: CategoriaInventario }
  | { modo: "asignar"; item: any };

export function ItemLibreDialog({
  item,
  invItems,
  onClose,
  onResolve,
}: {
  item: any | null;
  invItems: any[];
  onClose: () => void;
  onResolve: (r: ResolucionItemLibre) => Promise<void>;
}) {
  const [modo, setModo] = useState<"crear" | "asignar">("crear");
  const [categoria, setCategoria] = useState<CategoriaInventario>("insumo");
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (item) {
      setModo("crear");
      setCategoria("insumo");
      setBusqueda("");
      setElegido(null);
      setIntentado(false);
      setOcupado(false);
    }
  }, [item]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = q
      ? invItems.filter((x: any) => `${x.sku ?? ""} ${x.nombre ?? ""}`.toLowerCase().includes(q))
      : invItems;
    return base.slice(0, 50);
  }, [busqueda, invItems]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    let r: ResolucionItemLibre;
    if (modo === "crear") r = { modo, categoria };
    else {
      const found = invItems.find((x: any) => x.id === elegido);
      if (!found) return;
      r = { modo, item: found };
    }
    setOcupado(true);
    try {
      await onResolve(r);
    } finally {
      setOcupado(false);
    }
  };

  const opcion = (m: "crear" | "asignar", titulo: string, texto: string) => (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm",
        modo === m ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <input type="radio" name="modo-item-libre" className="mt-1" checked={modo === m} onChange={() => setModo(m)} />
      <span>
        <span className="block font-semibold">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{texto}</span>
      </span>
    </label>
  );

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-base">Ítem sin SKU en bodega</DialogTitle>
            <DialogDescription>«{item?.nombre}» no está en bodega. Elige cómo registrarlo.</DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Opción</legend>
            {opcion("crear", "Crear SKU nuevo", "Con esta descripción y unidad.")}
            {opcion("asignar", "Asignar a un SKU existente", "Elegir un ítem del inventario.")}
          </fieldset>
          {modo === "crear" ? (
            <div className="space-y-1.5">
              <Label htmlFor="il-cat">Categoría</Label>
              <select
                id="il-cat"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaInventario)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                {CATEGORIAS_INVENTARIO.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="il-buscar">Buscar por SKU o nombre</Label>
              <Input id="il-buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoComplete="off" />
              <div role="listbox" aria-label="Ítems de inventario" className="max-h-56 overflow-y-auto rounded-md border border-border">
                {filtrados.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Sin coincidencias.</p>
                ) : (
                  filtrados.map((x: any) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={elegido === x.id}
                      key={x.id}
                      onClick={() => setElegido(x.id)}
                      className={cn(
                        "flex w-full items-baseline gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-secondary",
                        elegido === x.id && "bg-primary/10",
                      )}
                    >
                      <span className="font-mono text-xs">{x.sku}</span>
                      <span className="truncate">{x.nombre}</span>
                    </button>
                  ))
                )}
              </div>
              {intentado && !elegido && <p className="text-xs text-destructive">Selecciona un ítem.</p>}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={ocupado}>Cancelar</Button>
            <Button type="submit" disabled={ocupado}>
              {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {modo === "crear" ? "Crear SKU" : "Asignar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
