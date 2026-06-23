import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { equipos } from "@/lib/mock-data";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/equipos")({
  head: () => ({
    meta: [{ title: "Equipos · SOLAROS" }, { name: "description", content: "Flota de robots, motores y herramientas." }],
  }),
  component: Equipos,
});

const statusStyles: Record<string, string> = {
  Operativo: "bg-accent/10 text-accent",
  Mantenimiento: "bg-amber-100 text-amber-700",
  Disponible: "bg-secondary text-foreground",
};

function Equipos() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Flota de Equipos"
        description="Robots SolarCleano, cepillos eléctricos, motores y herramientas asignadas a cuadrillas."
        actions={
          <button className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
            <Plus className="size-3.5" /> Registrar equipo
          </button>
        }
      />

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-secondary border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Equipo</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-left">Asignación</th>
              <th className="px-4 py-3 text-right">Salud</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {equipos.map((e) => (
              <tr key={e.code} className="hover:bg-secondary/50 transition-colors">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="size-9 bg-primary/10 text-primary rounded grid place-items-center text-[10px] font-bold font-mono">
                      {e.code}
                    </div>
                    <p className="font-medium">{e.name}</p>
                  </div>
                </td>
                <td className="px-4 py-4 text-xs text-muted-foreground">{e.type}</td>
                <td className="px-4 py-4">
                  <span
                    className={
                      "inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                      (statusStyles[e.status] ?? "bg-secondary")
                    }
                  >
                    {e.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-xs text-muted-foreground">{e.activity}</td>
                <td className="px-4 py-4 text-right font-mono">{e.health}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}