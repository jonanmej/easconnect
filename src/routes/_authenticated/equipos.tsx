import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import {
  listEquipos,
  listPlantas,
  upsertEquipo,
  deleteEquipo,
} from "@/lib/operations.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/equipos")({
  head: () => ({
    meta: [{ title: "Equipos · SOLAROS" }, { name: "description", content: "Inventario operativo de robots, motores y herramientas." }],
  }),
  component: Equipos,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

const estadoLabel: Record<string, string> = {
  operativo: "Operativo",
  mantenimiento: "Mantenimiento",
  disponible: "Disponible",
  fuera_servicio: "Fuera de servicio",
};

const estadoCls: Record<string, string> = {
  operativo: "bg-accent/10 text-accent",
  mantenimiento: "bg-amber-100 text-amber-700",
  disponible: "bg-secondary text-foreground",
  fuera_servicio: "bg-destructive/10 text-destructive",
};

function Equipos() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listEquipos);
  const fetchPlantas = useServerFn(listPlantas);
  const fetchUpsert = useServerFn(upsertEquipo);
  const fetchDelete = useServerFn(deleteEquipo);
  const { roles } = useAuth();
  const canEdit = ["admin", "supervisor"].includes(highestRole(roles) ?? "");

  const list = useQuery({ queryKey: ["equipos"], queryFn: () => fetchList() });
  const plantas = useQuery({ queryKey: ["plantas"], queryFn: () => fetchPlantas() });
  const [editing, setEditing] = useState<any | null>(null);

  const save = useMutation({
    mutationFn: (vars: any) => fetchUpsert({ data: vars }),
    onSuccess: () => {
      toast.success("Equipo guardado");
      qc.invalidateQueries({ queryKey: ["equipos"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchDelete({ data: { id } }),
    onSuccess: () => { toast.success("Equipo eliminado"); qc.invalidateQueries({ queryKey: ["equipos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({
      id: editing?.id,
      codigo: f.get("codigo"),
      nombre: f.get("nombre"),
      tipo: f.get("tipo"),
      estado: f.get("estado"),
      salud: f.get("salud") || null,
      planta_id: f.get("planta_id") || null,
      ubicacion: f.get("ubicacion") || null,
    });
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Equipos y Herramientas"
        description="Robots, motores y maquinaria asignable a plantas."
        actions={canEdit && (
          <button
            onClick={() => setEditing({ estado: "disponible" })}
            className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md"
          >
            <Plus className="size-3.5" /> Nuevo equipo
          </button>
        )}
      />

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-secondary border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Equipo</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-left">Ubicación</th>
              <th className="px-4 py-3 text-right">Salud</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.isLoading && (
              <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">Cargando…</td></tr>
            )}
            {(list.data as any[] | undefined)?.map((e) => (
              <tr key={e.id} className="hover:bg-secondary/40 transition-colors">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="size-8 bg-secondary rounded grid place-items-center text-[10px] font-bold text-muted-foreground">{e.codigo}</div>
                    <div>
                      <p className="font-medium">{e.nombre}</p>
                      <p className="text-[10px] text-muted-foreground">{e.planta_nombre ?? "Sin asignar"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-xs">{e.tipo}</td>
                <td className="px-4 py-4">
                  <span className={"inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " + (estadoCls[e.estado] ?? "bg-secondary")}>
                    {estadoLabel[e.estado] ?? e.estado}
                  </span>
                </td>
                <td className="px-4 py-4 text-xs text-muted-foreground">{e.ubicacion ?? "—"}</td>
                <td className="px-4 py-4 text-right font-mono">{e.salud != null ? `${e.salud}%` : "—"}</td>
                {canEdit && (
                  <td className="px-4 py-4 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => setEditing(e)} className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" aria-label="Editar">
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Eliminar ${e.nombre}?`)) remove.mutate(e.id); }}
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
        title={editing?.id ? "Editar equipo" : "Nuevo equipo"}
        busy={save.isPending}
        error={save.error?.message}
        onSubmit={onSubmit}
      >
        <div className="grid grid-cols-3 gap-3">
          <Field label="Código">
            <input name="codigo" required defaultValue={editing?.codigo ?? ""} className={inputCls} placeholder="SC1" />
          </Field>
          <div className="col-span-2">
            <Field label="Nombre">
              <input name="nombre" required defaultValue={editing?.nombre ?? ""} className={inputCls} />
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <input name="tipo" required defaultValue={editing?.tipo ?? ""} className={inputCls} placeholder="Robot de Limpieza" />
          </Field>
          <Field label="Estado">
            <select name="estado" defaultValue={editing?.estado ?? "disponible"} className={inputCls}>
              <option value="operativo">Operativo</option>
              <option value="mantenimiento">Mantenimiento</option>
              <option value="disponible">Disponible</option>
              <option value="fuera_servicio">Fuera de servicio</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Salud (%)">
            <input name="salud" type="number" min="0" max="100" defaultValue={editing?.salud ?? ""} className={inputCls} />
          </Field>
          <Field label="Planta">
            <select name="planta_id" defaultValue={editing?.planta_id ?? ""} className={inputCls}>
              <option value="">— Sin asignar —</option>
              {(plantas.data as any[] | undefined)?.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Ubicación específica">
          <input name="ubicacion" defaultValue={editing?.ubicacion ?? ""} className={inputCls} placeholder="Bodega Central" />
        </Field>
      </RecordDialog>
    </div>
  );
}