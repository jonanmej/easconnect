import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { trabajos, equipos } from "@/lib/mock-data";
import { Plus, Filter } from "lucide-react";

export const Route = createFileRoute("/programacion")({
  head: () => ({
    meta: [{ title: "Programación · SOLAROS" }, { name: "description", content: "Calendario semanal y disponibilidad de equipos." }],
  }),
  component: Programacion,
});

const days = ["Lun 22", "Mar 23", "Mié 24", "Jue 25", "Vie 26", "Sáb 27", "Dom 28"];
const hours = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];

const events = [
  { day: 1, hour: 0, dur: 1, title: "Atacama III · Limpieza", tone: "primary" },
  { day: 1, hour: 1, dur: 1, title: "Los Olivos · Cepillo", tone: "accent" },
  { day: 1, hour: 4, dur: 1, title: "Genco · Motor", tone: "primary" },
  { day: 2, hour: 2, dur: 2, title: "Valle Escondido · Drones", tone: "accent" },
  { day: 3, hour: 0, dur: 3, title: "Atacama III · Limpieza Total", tone: "primary" },
  { day: 4, hour: 3, dur: 1, title: "Hidromax · Inspección", tone: "muted" },
  { day: 5, hour: 1, dur: 2, title: "AgroSolar · Instalación", tone: "primary" },
] as const;

function Programacion() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Programación Semanal"
        description="Vista de calendario con disponibilidad de equipos y técnicos. Arrastra para mover, click para editar."
        actions={
          <>
            <button className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary">
              <Filter className="size-3.5" /> Filtrar
            </button>
            <button className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
              <Plus className="size-3.5" /> Agendar trabajo
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Calendar */}
        <div className="xl:col-span-3 bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-secondary text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <div className="p-3" />
            {days.map((d) => (
              <div key={d} className="p-3 text-center border-l border-border">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
            <div className="flex flex-col">
              {hours.map((h) => (
                <div
                  key={h}
                  className="h-20 p-2 text-[10px] font-mono text-muted-foreground border-b border-border"
                >
                  {h}
                </div>
              ))}
            </div>
            {days.map((_, dayIdx) => (
              <div key={dayIdx} className="border-l border-border relative">
                {hours.map((_, hIdx) => (
                  <div key={hIdx} className="h-20 border-b border-border" />
                ))}
                {events
                  .filter((e) => e.day === dayIdx)
                  .map((e, i) => (
                    <div
                      key={i}
                      className={
                        "absolute left-1 right-1 rounded-md p-2 text-[10px] font-medium overflow-hidden " +
                        (e.tone === "primary"
                          ? "bg-primary/15 text-primary border border-primary/30"
                          : e.tone === "accent"
                            ? "bg-accent/15 text-accent border border-accent/30"
                            : "bg-secondary text-foreground border border-border")
                      }
                      style={{ top: `${e.hour * 80 + 4}px`, height: `${e.dur * 80 - 8}px` }}
                    >
                      {e.title}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>

        {/* Equipment availability */}
        <aside className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider">Disponibilidad de Equipos</h3>
          <div className="space-y-2">
            {equipos.map((e) => (
              <div
                key={e.code}
                className="bg-card border border-border rounded-lg p-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-semibold">{e.name}</p>
                  <p className="text-[10px] text-muted-foreground">{e.activity}</p>
                </div>
                <span
                  className={
                    "size-2 rounded-full " +
                    (e.status === "Operativo"
                      ? "bg-accent"
                      : e.status === "Mantenimiento"
                        ? "bg-amber-500"
                        : "bg-muted-foreground")
                  }
                />
              </div>
            ))}
          </div>

          <div className="bg-secondary border border-dashed border-border rounded-lg p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Próximos esta semana
            </p>
            <p className="text-2xl font-mono font-semibold">{trabajos.length}</p>
            <p className="text-xs text-muted-foreground mt-1">trabajos programados</p>
          </div>
        </aside>
      </div>
    </div>
  );
}