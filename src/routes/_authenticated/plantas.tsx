import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { plantas } from "@/lib/mock-data";
import { Plus, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/plantas")({
  head: () => ({
    meta: [{ title: "Plantas · SOLAROS" }, { name: "description", content: "Instalaciones bajo gestión: solares y térmicas." }],
  }),
  component: Plantas,
});

function Plantas() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Plantas en Operación"
        description="Cada planta enlaza su cliente, equipos asignados y bitácora de mantenimientos."
        actions={
          <button className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
            <Plus className="size-3.5" /> Nueva planta
          </button>
        }
      />

      <div className="space-y-3">
        {plantas.map((p) => (
          <div
            key={p.name}
            className="bg-card border border-border rounded-xl p-5 flex flex-wrap items-center gap-6 hover:border-primary/40 transition-colors"
          >
            <div className="size-12 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <MapPin className="size-5" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <h3 className="text-base font-semibold tracking-tight">{p.name}</h3>
              <p className="text-xs text-muted-foreground">
                {p.cliente} · {p.ubicacion}
              </p>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  Paneles
                </p>
                <p className="font-mono font-semibold">
                  {p.paneles ? p.paneles.toLocaleString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  Capacidad
                </p>
                <p className="font-medium">{p.capacidad}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  Última limpieza
                </p>
                <p className="text-xs text-muted-foreground">{p.ultimaLimpieza}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  Eficiencia
                </p>
                <p className="font-mono font-semibold text-accent">{p.eficiencia}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}