import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { inventario } from "@/lib/mock-data";
import { Plus, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventario")({
  head: () => ({
    meta: [{ title: "Inventario · SOLAROS" }, { name: "description", content: "Stock de bodega: insumos, repuestos, herramientas y EPP." }],
  }),
  component: Inventario,
});

function Inventario() {
  const critico = inventario.filter((i) => i.stock < i.min).length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Inventario de Bodega"
        description="Insumos, repuestos, herramientas y EPP. Alertas automáticas bajo punto de pedido."
        actions={
          <button className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
            <Plus className="size-3.5" /> Nuevo SKU
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SKUs</p>
          <p className="text-2xl font-mono font-semibold mt-1">{inventario.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Categorías</p>
          <p className="text-2xl font-mono font-semibold mt-1">4</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 ring-2 ring-destructive/20">
          <p className="text-[10px] font-bold uppercase tracking-wider text-destructive">Bajo stock</p>
          <p className="text-2xl font-mono font-semibold mt-1 text-destructive">{critico}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ubicaciones</p>
          <p className="text-2xl font-mono font-semibold mt-1">3</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-secondary border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Item</th>
              <th className="px-4 py-3 text-left">Categoría</th>
              <th className="px-4 py-3 text-left">Ubicación</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Mínimo</th>
              <th className="px-4 py-3 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {inventario.map((i) => {
              const low = i.stock < i.min;
              return (
                <tr key={i.sku} className="hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-4 font-mono text-xs">{i.sku}</td>
                  <td className="px-4 py-4 font-medium">{i.item}</td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{i.categoria}</td>
                  <td className="px-4 py-4 text-xs font-mono text-muted-foreground">{i.ubic}</td>
                  <td className="px-4 py-4 text-right font-mono font-semibold">{i.stock}</td>
                  <td className="px-4 py-4 text-right font-mono text-muted-foreground">{i.min}</td>
                  <td className="px-4 py-4 text-center">
                    {low ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-destructive/10 text-destructive">
                        <AlertTriangle className="size-3" /> Pedir
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-accent/10 text-accent">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}