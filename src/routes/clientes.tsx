import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { clientes } from "@/lib/mock-data";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [{ title: "Clientes · SOLAROS" }, { name: "description", content: "Cartera de clientes empresariales." }],
  }),
  component: Clientes,
});

function Clientes() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Cartera de Clientes"
        description="Empresas que confían en SOLAROS para sus operaciones solares y térmicas."
        actions={
          <button className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
            <Plus className="size-3.5" /> Nuevo cliente
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clientes.map((c) => (
          <div
            key={c.rut}
            className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center text-sm font-bold">
                {c.name.charAt(0)}
              </div>
              <span
                className={
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                  (c.estado === "Activo"
                    ? "bg-accent/10 text-accent"
                    : c.estado === "Pausado"
                      ? "bg-secondary text-muted-foreground"
                      : "bg-amber-100 text-amber-700")
                }
              >
                {c.estado}
              </span>
            </div>
            <h3 className="text-base font-semibold tracking-tight">{c.name}</h3>
            <p className="text-[10px] text-muted-foreground font-mono mb-4">{c.rut}</p>
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  Plantas
                </p>
                <p className="text-lg font-mono font-semibold">{c.plantas}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  Capacidad
                </p>
                <p className="text-sm font-medium mt-1">{c.capacidad}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  Contacto
                </p>
                <p className="text-sm">{c.contacto}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}