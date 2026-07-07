import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { listTrabajos, listPlantas } from "@/lib/operations.functions";
import { reprogramarTrabajoCliente, disponibilidadGlobal } from "@/lib/contratos.functions";
import { CalendarClock, CheckCircle2, FileSignature, ClipboardList, CalendarRange } from "lucide-react";

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
  const qc = useQueryClient();
  const fRepr = useServerFn(reprogramarTrabajoCliente);
  const fDisp = useServerFn(disponibilidadGlobal);
  const [reprogTrabajo, setReprogTrabajo] = useState<any | null>(null);

  const reprog = useMutation({
    mutationFn: (p: { trabajo_id: string; nueva_fecha: string }) => fRepr({ data: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mis-trabajos"] });
      qc.invalidateQueries({ queryKey: ["cumplimiento-anual"] });
      toast.success("Trabajo reprogramado");
      setReprogTrabajo(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

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
                  {new Date(t.fecha_programada).toLocaleString("es-SV", { timeZone: "America/El_Salvador", dateStyle: "medium", timeStyle: "short" })}
                </div>
                <div className="text-xs text-muted-foreground">{t.planta_nombre}</div>
                {t.auto_generado && t.estado === "programado" && (
                  <button
                    onClick={() => setReprogTrabajo(t)}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <CalendarRange className="size-3.5" /> Reprogramar
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
          <CheckCircle2 className="size-4" /> Trabajos realizados
        </h2>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
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
                    {t.fecha_completado ? new Date(t.fecha_completado).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" }) : "—"}
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

      {reprogTrabajo && (
        <ReprogramarDialog
          trabajo={reprogTrabajo}
          onClose={() => setReprogTrabajo(null)}
          onSubmit={(nueva_fecha) => reprog.mutate({ trabajo_id: reprogTrabajo.id, nueva_fecha })}
          saving={reprog.isPending}
          fetchOcupados={fDisp}
        />
      )}
    </div>
  );
}

function ReprogramarDialog({
  trabajo, onClose, onSubmit, saving, fetchOcupados,
}: { trabajo: any; onClose: () => void; onSubmit: (fecha: string) => void; saving: boolean; fetchOcupados: any }) {
  const today = new Date();
  const hoyStr = today.toISOString().slice(0, 10);
  const finStr = new Date(today.getTime() + 90 * 86400000).toISOString().slice(0, 10);
  const [fecha, setFecha] = useState<string>(new Date(trabajo.fecha_programada).toISOString().slice(0, 10));
  const ocupados = useQuery({
    queryKey: ["disp-global", trabajo.id, hoyStr, finStr],
    queryFn: () => fetchOcupados({ data: { desde: hoyStr, hasta: finStr, excluir_trabajo_id: trabajo.id } }),
  });
  const ocupadosSet = new Set<string>((ocupados.data as string[] | undefined) ?? []);
  const elegido = fecha;
  const elegidoOcupado = ocupadosSet.has(elegido);

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4" role="dialog">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Reprogramar trabajo</h2>
          <p className="text-xs text-muted-foreground mt-1">{trabajo.folio} · {trabajo.servicio} · {trabajo.planta_nombre}</p>
          <p className="text-xs text-muted-foreground">Fecha actual: {new Date(trabajo.fecha_programada).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" })}</p>
        </div>
        <div className="space-y-2 text-sm">
          <label className="block">
            <span className="text-xs text-muted-foreground">Nueva fecha</span>
            <input type="date" value={fecha} min={hoyStr}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background" />
          </label>
          {elegidoOcupado && (
            <p className="text-xs text-destructive">⚠ Esa fecha ya está ocupada por otro trabajo. Elige otra.</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Solo puedes elegir días dentro de tu ciclo y que no estén ocupados por otros clientes.
          </p>
          {!ocupados.isLoading && ocupadosSet.size > 0 && (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer">Ver próximos días ocupados</summary>
              <ul className="mt-1 max-h-32 overflow-y-auto grid grid-cols-3 gap-1 font-mono">
                {Array.from(ocupadosSet).sort().slice(0, 30).map((d) => <li key={d}>{d}</li>)}
              </ul>
            </details>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-9 px-4 rounded-md border border-input text-sm">Cancelar</button>
          <button onClick={() => onSubmit(fecha)} disabled={saving || elegidoOcupado}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">
            {saving ? "Guardando…" : "Reprogramar"}
          </button>
        </div>
      </div>
    </div>
  );
}