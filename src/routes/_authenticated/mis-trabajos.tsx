import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { listTrabajos, listPlantas } from "@/lib/operations.functions";
import { CalendarClock, CheckCircle2, FileSignature, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mis-trabajos")({
  head: () => ({
    meta: [
      { title: "Mis trabajos · EA Service Connect" },
      { name: "description", content: "Trabajos ejecutados en sus plantas: estado, evidencias y aprobación." },
    ],
  }),
  component: MisTrabajos,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

function MisTrabajos() {
  const fList = useServerFn(listTrabajos);
  const fPlantas = useServerFn(listPlantas);
  const trabajos = useQuery({ queryKey: ["mis-trabajos"], queryFn: () => fList() });
  const plantas = useQuery({ queryKey: ["mis-plantas"], queryFn: () => fPlantas() });

  const [plantaFilter, setPlantaFilter] = useState<string>("");
  const [estadoFilter, setEstadoFilter] = useState<string>("");

  const filtered = useMemo(() => {
    const list = (trabajos.data as any[] | undefined) ?? [];
    return list.filter(
      (t) =>
        (!plantaFilter || t.planta_id === plantaFilter) &&
        (!estadoFilter || t.estado === estadoFilter),
    );
  }, [trabajos.data, plantaFilter, estadoFilter]);

  const proximos = filtered.filter((t) => t.estado === "programado" || t.estado === "en_progreso");
  const cerrados = filtered.filter((t) => t.estado === "completado");

  return (
    <div className="p-6 md:p-8 space-y-6">
      <PageHeader
        title="Mis trabajos"
        description="Revise el estado, las evidencias y aproveche para aprobar los trabajos realizados en sus plantas."
      />

      <div className="flex flex-wrap gap-3">
        <select
          value={plantaFilter}
          onChange={(e) => setPlantaFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">Todas mis plantas</option>
          {(plantas.data as any[] | undefined)?.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="programado">Programado</option>
          <option value="en_progreso">En progreso</option>
          <option value="completado">Completado</option>
        </select>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
          <CalendarClock className="size-4" /> Próximas visitas
        </h2>
        {proximos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin trabajos programados.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {proximos.map((t) => (
              <article key={t.id} className="rounded-lg border border-border bg-card p-4">
                <div className="text-[11px] uppercase tracking-wide text-primary font-semibold">{t.folio}</div>
                <div className="font-medium mt-1">{t.servicio}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(t.fecha_programada).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}
                </div>
                <div className="text-xs text-muted-foreground">{t.planta_nombre}</div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
          <CheckCircle2 className="size-4" /> Trabajos realizados
        </h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Folio</th>
                <th className="px-4 py-2 text-left">Planta</th>
                <th className="px-4 py-2 text-left">Servicio</th>
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-left">Aprobación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cerrados.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium">{t.folio}</td>
                  <td className="px-4 py-3">{t.planta_nombre}</td>
                  <td className="px-4 py-3">{t.servicio}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.fecha_completado ? new Date(t.fecha_completado).toLocaleDateString("es-CL") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {t.firmado_at ? (
                      <span className="inline-flex items-center gap-1 text-accent text-xs font-semibold">
                        <FileSignature className="size-3.5" /> Firmado
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pendiente</span>
                    )}
                  </td>
                </tr>
              ))}
              {cerrados.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground"><ClipboardList className="size-4 inline mr-1" />Sin trabajos completados aún.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}