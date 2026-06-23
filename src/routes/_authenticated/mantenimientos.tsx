import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { mantenimientos } from "@/lib/mock-data";
import { Plus, Clock } from "lucide-react";

export const Route = createFileRoute("/mantenimientos")({
  head: () => ({
    meta: [{ title: "Mantenimientos · SOLAROS" }, { name: "description", content: "Bitácora de mantenimientos a equipos." }],
  }),
  component: Mantenimientos,
});

const estadoStyles: Record<string, string> = {
  Completado: "bg-accent/10 text-accent",
  Programado: "bg-primary/10 text-primary",
  Pendiente: "bg-amber-100 text-amber-700",
};

function Mantenimientos() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Bitácora de Mantenimientos"
        description="Historial preventivo, correctivo y predictivo de cada equipo de la flota."
        actions={
          <button className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
            <Plus className="size-3.5" /> Registrar
          </button>
        }
      />

      <div className="space-y-3">
        {mantenimientos.map((m, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-xl p-5 flex flex-wrap gap-6 items-start"
          >
            <div className="flex-1 min-w-[260px]">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-base font-semibold tracking-tight">{m.equipo}</h3>
                <span
                  className={
                    "inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                    (estadoStyles[m.estado] ?? "bg-secondary")
                  }
                >
                  {m.estado}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {m.tipo} · {m.fecha} · {m.tecnico}
              </p>
              <p className="text-sm">{m.notas}</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary border border-border">
              <Clock className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-sm font-semibold">{m.horas}h</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}