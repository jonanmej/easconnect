import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { trabajos } from "@/lib/mock-data";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/trabajos")({
  head: () => ({
    meta: [{ title: "Trabajos · SOLAROS" }, { name: "description", content: "Listado y seguimiento de órdenes de trabajo." }],
  }),
  component: Trabajos,
});

const estadoStyles: Record<string, string> = {
  "En Progreso": "bg-accent/10 text-accent",
  Programado: "bg-primary/10 text-primary",
  Completado: "bg-secondary text-muted-foreground",
  Cancelado: "bg-destructive/10 text-destructive",
};

function Trabajos() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Órdenes de Trabajo"
        description="Histórico y seguimiento de servicios ejecutados por los técnicos en campo."
        actions={
          <button className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
            <Plus className="size-3.5" /> Nueva orden
          </button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {["Todos", "En Progreso", "Programado", "Completado"].map((f, i) => (
          <button
            key={f}
            className={
              "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors " +
              (i === 0
                ? "bg-foreground text-background border-foreground"
                : "bg-card border-border hover:bg-secondary text-muted-foreground")
            }
          >
            {f}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-secondary border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Folio</th>
              <th className="px-4 py-3 text-left">Cliente / Planta</th>
              <th className="px-4 py-3 text-left">Servicio</th>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Técnico</th>
              <th className="px-4 py-3 text-right">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {trabajos.map((t) => (
              <tr key={t.folio} className="hover:bg-secondary/50 transition-colors">
                <td className="px-4 py-4 font-mono text-xs">{t.folio}</td>
                <td className="px-4 py-4">
                  <p className="font-medium">{t.cliente}</p>
                  <p className="text-[10px] text-muted-foreground">{t.planta}</p>
                </td>
                <td className="px-4 py-4 text-sm">{t.servicio}</td>
                <td className="px-4 py-4 text-xs text-muted-foreground">{t.fecha}</td>
                <td className="px-4 py-4 text-sm">{t.tecnico}</td>
                <td className="px-4 py-4 text-right">
                  <span
                    className={
                      "inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                      (estadoStyles[t.estado] ?? "bg-secondary")
                    }
                  >
                    {t.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}