import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock, LayoutGrid, PanelsTopLeft } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { MapaAvanceDiario } from "@/components/MapaAvanceDiario";
import { getAvanceTrabajo } from "@/lib/reportes-diarios.functions";

const FUENTE_TXT: Record<string, string> = {
  zonas: "zonas completadas en el mapa satelital",
  paneles: "paneles limpiados sobre el total de la planta",
  meta: "cumplimiento de la meta diaria reportada",
};

/**
 * Avance de la OT calculado en vivo desde los reportes diarios cargados por
 * los técnicos (horas, paneles y zonas marcadas en el mapa satelital).
 */
export function AvanceOTCard({ trabajoId, conMapa = true }: { trabajoId: string; conMapa?: boolean }) {
  const fAvance = useServerFn(getAvanceTrabajo);
  const q = useQuery({
    queryKey: ["avance-ot", trabajoId],
    queryFn: () => fAvance({ data: { trabajo_id: trabajoId } }),
  });
  const a = q.data as any;

  const estados = useMemo(() => {
    const out: Record<string, "en_proceso" | "completada" | null> = {};
    for (const z of ((a?.zonas ?? []) as any[])) out[z.id] = z.estado ?? null;
    return out;
  }, [a?.zonas]);

  if (q.isLoading) {
    return <p className="text-[11px] text-muted-foreground">Calculando avance desde los reportes diarios…</p>;
  }
  if (!a) return null;

  if (!a.dias_reportados && !a.zonas_completadas) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Aún no hay reportes diarios cargados: el avance de esta orden se actualizará automáticamente
        cuando el técnico registre su primer reporte del día.
      </p>
    );
  }

  const pct = typeof a.avance_pct === "number" ? Math.max(0, Math.min(100, a.avance_pct)) : null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold flex items-center gap-1.5">
            <Activity className="size-3.5 text-primary" />
            Avance de la orden
          </span>
          <span className="text-sm font-bold tabular-nums">{pct == null ? "—" : `${pct}%`}</span>
        </div>
        <Progress value={pct ?? 0} className="h-2" />
        <p className="text-[10px] text-muted-foreground">
          Calculado con {FUENTE_TXT[a.fuente] ?? "los reportes diarios"}. Se actualiza solo con cada
          reporte diario cargado por el equipo en campo.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <Dato icon={<Clock className="size-3" />} label="Horas trabajadas" valor={`${a.horas_trabajadas ?? 0} h`} />
          <Dato
            icon={<PanelsTopLeft className="size-3" />}
            label="Paneles limpiados"
            valor={`${a.paneles_limpiados ?? 0}${a.paneles_planta ? ` / ${a.paneles_planta}` : ""}`}
          />
          <Dato
            icon={<LayoutGrid className="size-3" />}
            label="Zonas completadas"
            valor={a.zonas_total ? `${a.zonas_completadas} / ${a.zonas_total}` : "Sin zonas"}
          />
          <Dato
            icon={<Activity className="size-3" />}
            label="Días reportados"
            valor={`${a.dias_reportados}${a.duracion_dias ? ` / ${a.duracion_dias}` : ""}`}
          />
        </div>
        {a.ultima_fecha && (
          <p className="text-[10px] text-muted-foreground">
            Último reporte: {a.ultima_fecha}
            {a.ultima_jornada?.hora_inicio || a.ultima_jornada?.hora_fin
              ? ` · jornada ${a.ultima_jornada?.hora_inicio ?? "—"} a ${a.ultima_jornada?.hora_fin ?? "—"}`
              : ""}
          </p>
        )}
      </div>
      {conMapa && a.zonas_total > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold">Mapa satelital · avance acumulado de la OT</p>
          <MapaAvanceDiario trabajoId={trabajoId} estadosExternos={estados} />
        </div>
      )}
    </div>
  );
}

function Dato({ icon, label, valor }: { icon: React.ReactNode; label: string; valor: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-[12px] font-semibold tabular-nums">{valor}</p>
    </div>
  );
}
