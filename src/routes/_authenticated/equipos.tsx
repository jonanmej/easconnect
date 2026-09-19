import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ResponsiveTable";
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
import { PlantaOptions } from "@/components/PlantaOptions";

export const Route = createFileRoute("/_authenticated/equipos")({
  head: () => ({
    meta: [{ title: "Equipos · EA Service Connect" }, { name: "description", content: "Inventario operativo de robots, motores y herramientas." }],
  }),
  component: Equipos,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {(error as Error)?.message}</div>
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
  const canEdit = ["admin", "supervisor", "tecnico"].includes(highestRole(roles) ?? "");

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
      codigo: f.get("codigo") || null,
      nombre: f.get("nombre"),
      tipo: f.get("tipo"),
      estado: f.get("estado"),
      salud: null,
      planta_id: f.get("planta_id") || null,
      ubicacion: f.get("ubicacion") || null,
    });
  }

  const equipoColumns: ResponsiveColumn<any>[] = [
    {
      key: "equipo",
      header: "Equipo",
      primary: true,
      cell: (e) => (
        <div className="flex items-center gap-3">
          <div className="size-8 bg-secondary rounded grid place-items-center text-[10px] font-bold text-muted-foreground shrink-0">{e.codigo}</div>
          <div className="min-w-0">
            <p className="font-medium truncate">{e.nombre}</p>
          </div>
        </div>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      cell: (e) => <span className="text-xs">{e.tipo}</span>,
    },
    {
      key: "estado",
      header: "Estado",
      cell: (e) => (
        <span className={"inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " + (estadoCls[e.estado] ?? "bg-secondary")}>
          {estadoLabel[e.estado] ?? e.estado}
        </span>
      ),
    },
    {
      key: "ubicacion",
      header: "Ubicación",
      secondary: true,
      cell: (e) => (
        <span className="text-xs text-muted-foreground">{e.planta_nombre ?? (e.ubicacion || "Bodega")}</span>
      ),
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Equipos"
        description="Robots y maquinaria asignable a plantas."
        actions={canEdit && (
          <button
            onClick={() => setEditing({ estado: "disponible" })}
            className="min-h-11 md:h-9 md:min-h-0 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md"
          >
            <Plus className="size-3.5" /> Nuevo equipo
          </button>
        )}
      />

      {list.isLoading && (
        <p className="p-6 text-center text-xs text-muted-foreground">Cargando…</p>
      )}
      {!list.isLoading && (
        <ResponsiveTable
          data={(list.data as any[] | undefined) ?? []}
          rowKey={(e) => e.id}
          emptyMessage="Aún no hay equipos registrados."
          columns={equipoColumns}
          rowActions={
            canEdit
              ? (e) => (
                  <>
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
                  </>
                )
              : undefined
          }
        />
      )}

      <RecordDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing?.id ? "Editar equipo" : "Nuevo equipo"}
        busy={save.isPending}
        error={save.error?.message}
        onSubmit={onSubmit}
      >
        {editing?.id ? (
          <div className="form-grid-3">
            <Field label="Código" hint="Generado automáticamente">
              <input name="codigo" defaultValue={editing?.codigo ?? ""} className={inputCls + " font-mono bg-secondary"} readOnly />
            </Field>
            <div className="sm:col-span-1 md:col-span-2">
              <Field label="Nombre" required>
                <input name="nombre" required defaultValue={editing?.nombre ?? ""} className={inputCls} />
              </Field>
            </div>
          </div>
        ) : (
          <>
            <Field
              label="Nombre"
              required
              hint={<>El código se generará automáticamente como <span className="font-mono">EQP-TIPO-NNNNN</span> según el tipo.</>}
            >
              <input name="nombre" required defaultValue={editing?.nombre ?? ""} className={inputCls} />
            </Field>
          </>
        )}
        <div className="form-grid">
          <Field label="Tipo" required>
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
        <div className="form-grid">
          <Field label="Planta asignada">
            <select name="planta_id" defaultValue={editing?.planta_id ?? ""} className={inputCls}>
              <option value="">— En Bodega —</option>
              <PlantaOptions plantas={plantas.data as any[] | undefined} />
            </select>
          </Field>
          <Field label="Ubicación específica (opcional)">
            <input name="ubicacion" defaultValue={editing?.ubicacion ?? ""} className={inputCls} placeholder="Bodega Central / Sector A" />
          </Field>
        </div>
      </RecordDialog>
    </div>
  );
}