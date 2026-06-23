import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import {
  listTrabajos,
  listPlantas,
  listEquipos,
  upsertTrabajo,
  deleteTrabajo,
} from "@/lib/operations.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { EvidenciaUploader } from "@/components/EvidenciaUploader";

export const Route = createFileRoute("/_authenticated/trabajos")({
  head: () => ({
    meta: [{ title: "Trabajos · SOLAROS" }, { name: "description", content: "Órdenes de trabajo: programadas, en progreso y completadas." }],
  }),
  component: Trabajos,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

const estadoLabel: Record<string, string> = {
  programado: "Programado",
  en_progreso: "En progreso",
  completado: "Completado",
  cancelado: "Cancelado",
};

const estadoCls: Record<string, string> = {
  programado: "bg-secondary text-foreground",
  en_progreso: "bg-primary/10 text-primary",
  completado: "bg-accent/10 text-accent",
  cancelado: "bg-destructive/10 text-destructive",
};

function toLocalInput(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Trabajos() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listTrabajos);
  const fetchPlantas = useServerFn(listPlantas);
  const fetchEquipos = useServerFn(listEquipos);
  const fetchUpsert = useServerFn(upsertTrabajo);
  const fetchDelete = useServerFn(deleteTrabajo);
  const { roles } = useAuth();
  const canEdit = ["admin", "supervisor"].includes(highestRole(roles) ?? "");

  const list = useQuery({ queryKey: ["trabajos"], queryFn: () => fetchList() });
  const plantas = useQuery({ queryKey: ["plantas"], queryFn: () => fetchPlantas() });
  const equipos = useQuery({ queryKey: ["equipos"], queryFn: () => fetchEquipos() });
  const [editing, setEditing] = useState<any | null>(null);

  const save = useMutation({
    mutationFn: (vars: any) => fetchUpsert({ data: vars }),
    onSuccess: () => {
      toast.success("Trabajo guardado");
      qc.invalidateQueries({ queryKey: ["trabajos"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchDelete({ data: { id } }),
    onSuccess: () => { toast.success("Trabajo eliminado"); qc.invalidateQueries({ queryKey: ["trabajos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({
      id: editing?.id,
      planta_id: f.get("planta_id"),
      equipo_id: f.get("equipo_id") || null,
      servicio: f.get("servicio"),
      fecha_programada: f.get("fecha_programada"),
      estado: f.get("estado"),
      notas: f.get("notas") || null,
    });
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Órdenes de Trabajo"
        description="Programa, ejecuta y cierra cada visita técnica."
        actions={canEdit && (
          <button
            onClick={() => setEditing({ estado: "programado", fecha_programada: new Date().toISOString() })}
            className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md"
          >
            <Plus className="size-3.5" /> Nuevo trabajo
          </button>
        )}
      />

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-secondary border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Folio</th>
              <th className="px-4 py-3 text-left">Cliente / Planta</th>
              <th className="px-4 py-3 text-left">Servicio</th>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Estado</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.isLoading && (
              <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">Cargando…</td></tr>
            )}
            {(list.data as any[] | undefined)?.map((t) => (
              <tr key={t.id} className="hover:bg-secondary/40 transition-colors">
                <td className="px-4 py-4 font-mono text-xs">{t.folio}</td>
                <td className="px-4 py-4">
                  <p className="font-medium">{t.cliente_nombre}</p>
                  <p className="text-[10px] text-muted-foreground">{t.planta_nombre}</p>
                </td>
                <td className="px-4 py-4 text-xs">{t.servicio}</td>
                <td className="px-4 py-4 text-xs text-muted-foreground">
                  {new Date(t.fecha_programada).toLocaleString()}
                </td>
                <td className="px-4 py-4">
                  <span className={"inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " + (estadoCls[t.estado] ?? "bg-secondary")}>
                    {estadoLabel[t.estado] ?? t.estado}
                  </span>
                </td>
                {canEdit && (
                  <td className="px-4 py-4 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => setEditing(t)} className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" aria-label="Editar">
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Eliminar ${t.folio}?`)) remove.mutate(t.id); }}
                        className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RecordDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing?.id ? `Editar ${editing.folio ?? "trabajo"}` : "Nuevo trabajo"}
        busy={save.isPending}
        error={save.error?.message}
        onSubmit={onSubmit}
      >
        <Field label="Planta">
          <select name="planta_id" required defaultValue={editing?.planta_id ?? ""} className={inputCls}>
            <option value="">— Selecciona planta —</option>
            {(plantas.data as any[] | undefined)?.map((p) => (
              <option key={p.id} value={p.id}>{p.cliente_nombre} · {p.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Servicio">
          <input name="servicio" required defaultValue={editing?.servicio ?? ""} className={inputCls} placeholder="Limpieza Robotizada" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha y hora">
            <input
              name="fecha_programada"
              type="datetime-local"
              required
              defaultValue={toLocalInput(editing?.fecha_programada)}
              className={inputCls}
            />
          </Field>
          <Field label="Estado">
            <select name="estado" defaultValue={editing?.estado ?? "programado"} className={inputCls}>
              <option value="programado">Programado</option>
              <option value="en_progreso">En progreso</option>
              <option value="completado">Completado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </Field>
        </div>
        <Field label="Equipo asignado (opcional)">
          <select name="equipo_id" defaultValue={editing?.equipo_id ?? ""} className={inputCls}>
            <option value="">— Sin equipo —</option>
            {(equipos.data as any[] | undefined)?.map((e) => (
              <option key={e.id} value={e.id}>{e.codigo} · {e.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Notas">
          <textarea name="notas" rows={3} defaultValue={editing?.notas ?? ""} className={inputCls} />
        </Field>
        {editing?.id && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Evidencias</p>
            <EvidenciaUploader trabajoId={editing.id} />
          </div>
        )}
      </RecordDialog>
    </div>
  );
}