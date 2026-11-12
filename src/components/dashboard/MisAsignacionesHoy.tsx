import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { listTrabajos } from "@/lib/operations.functions";
import { asignacionesDeHoy } from "@/lib/dashboard-asignaciones";
import { hoyKeyTZ } from "@/lib/hoy-config";

const estados: Record<string, string> = { programado: "Programado", en_progreso: "En progreso" };

export function MisAsignacionesHoy() {
  const { user } = useAuth();
  const fetchTrabajos = useServerFn(listTrabajos);
  const trabajos = useQuery({ queryKey: ["terreno-trabajos"], queryFn: () => fetchTrabajos() });
  const asignaciones = asignacionesDeHoy(trabajos.data ?? [], user?.id, hoyKeyTZ());

  return (
    <section className="bg-card border border-border rounded-lg p-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-semibold">Mis asignaciones de hoy</h2>
        <Link to="/terreno" className="text-xs text-primary font-medium min-h-11 inline-flex items-center hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">Ver todas mis asignaciones →</Link>
      </div>
      {trabajos.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">Cargando asignaciones…</p>
      ) : trabajos.isError ? (
        <p className="text-sm text-destructive" role="alert">No se pudieron cargar tus asignaciones.</p>
      ) : asignaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tienes asignaciones para hoy.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {asignaciones.map((t) => (
            <li key={t.id}>
              <Link to="/terreno" className="flex flex-wrap items-center gap-2 py-3 min-h-11 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">
                <span className="flex-1 min-w-0 basis-48">
                  <span className="block font-medium break-words"><span className="tabular-nums">{t.folio}</span> · {t.planta_nombre}</span>
                  <span className="block text-xs text-muted-foreground break-words">{t.servicio}</span>
                </span>
                <span className="text-xs font-semibold text-primary bg-primary/10 rounded px-2 py-1">{estados[t.estado] ?? t.estado}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}