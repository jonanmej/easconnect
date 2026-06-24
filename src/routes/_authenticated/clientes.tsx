import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import {
  listClientes,
  upsertCliente,
  deleteCliente,
} from "@/lib/operations.functions";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [{ title: "Clientes · EA Service Connect" }, { name: "description", content: "Cartera de clientes empresariales." }],
  }),
  component: Clientes,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

type ClienteRow = {
  id: string;
  nombre: string;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  capacidad: string | null;
  estado: "activo" | "revision" | "pausado";
  plantas_count: number;
  contrato_om: boolean;
  cuota_preventivos: number;
  cuota_correctivos: number;
  cuota_menores: number;
  cuota_medios: number;
  cuota_mayores: number;
  cuota_limpiezas: number;
};

const estadoLabel: Record<ClienteRow["estado"], string> = {
  activo: "Activo",
  revision: "En revisión",
  pausado: "Pausado",
};

function Clientes() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listClientes);
  const fetchUpsert = useServerFn(upsertCliente);
  const fetchDelete = useServerFn(deleteCliente);
  const { roles } = useAuth();
  const canEdit = ["admin", "supervisor"].includes(highestRole(roles) ?? "");

  const list = useQuery({ queryKey: ["clientes"], queryFn: () => fetchList() });
  const [editing, setEditing] = useState<Partial<ClienteRow> | null>(null);

  const save = useMutation({
    mutationFn: (vars: any) => fetchUpsert({ data: vars }),
    onSuccess: () => {
      toast.success("Cliente guardado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Cliente eliminado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["plantas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({
      id: editing?.id,
      nombre: f.get("nombre"),
      contacto: f.get("contacto") || null,
      email: f.get("email") || null,
      telefono: f.get("telefono") || null,
      capacidad: f.get("capacidad") || null,
      estado: f.get("estado"),
      contrato_om: f.get("contrato_om") === "on",
      cuota_preventivos: Number(f.get("cuota_preventivos") ?? 0),
      cuota_correctivos: Number(f.get("cuota_correctivos") ?? 0),
      cuota_menores: Number(f.get("cuota_menores") ?? 0),
      cuota_medios: Number(f.get("cuota_medios") ?? 0),
      cuota_mayores: Number(f.get("cuota_mayores") ?? 0),
      cuota_limpiezas: Number(f.get("cuota_limpiezas") ?? 0),
    });
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Cartera de Clientes"
        description="Empresas que confían en EA Service Connect para sus operaciones solares y térmicas."
        actions={canEdit && (
          <button
            onClick={() => setEditing({ estado: "activo" })}
            className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md"
          >
            <Plus className="size-3.5" /> Nuevo cliente
          </button>
        )}
      />

      {list.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(list.data as ClienteRow[] | undefined)?.map((c) => (
          <div
            key={c.id}
            className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center text-sm font-bold">
                {c.nombre.charAt(0)}
              </div>
              <span
                className={
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                  (c.estado === "activo"
                    ? "bg-accent/10 text-accent"
                    : c.estado === "pausado"
                      ? "bg-secondary text-muted-foreground"
                      : "bg-amber-100 text-amber-700")
                }
              >
                {estadoLabel[c.estado]}
              </span>
            </div>
            <h3 className="text-base font-semibold tracking-tight">{c.nombre}</h3>
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Plantas</p>
                <p className="text-lg font-mono font-semibold">{c.plantas_count}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Capacidad</p>
                <p className="text-sm font-medium mt-1">{c.capacidad ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Contacto</p>
                <p className="text-sm">{c.contacto ?? "—"}</p>
              </div>
            </div>
            {canEdit && (
              <div className="mt-4 pt-3 border-t border-border flex gap-2 justify-end">
                <button onClick={() => setEditing(c)} className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" aria-label="Editar">
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => { if (confirm(`Eliminar ${c.nombre}? Se borrarán sus plantas y equipos asociados.`)) remove.mutate(c.id); }}
                  className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive"
                  aria-label="Eliminar"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <RecordDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing?.id ? "Editar cliente" : "Nuevo cliente"}
        busy={save.isPending}
        error={save.error?.message}
        onSubmit={onSubmit}
      >
        <Field label="Nombre">
          <input name="nombre" required defaultValue={editing?.nombre ?? ""} className={inputCls} />
        </Field>
        <Field label="Estado">
          <select name="estado" defaultValue={editing?.estado ?? "activo"} className={inputCls}>
            <option value="activo">Activo</option>
            <option value="revision">En revisión</option>
            <option value="pausado">Pausado</option>
          </select>
        </Field>
        <Field label="Contacto principal">
          <input name="contacto" defaultValue={editing?.contacto ?? ""} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input name="email" type="email" defaultValue={editing?.email ?? ""} className={inputCls} placeholder="contacto@cliente.cl" />
          </Field>
          <Field label="Teléfono">
            <input name="telefono" defaultValue={editing?.telefono ?? ""} className={inputCls} placeholder="+56 9 1234 5678" />
          </Field>
        </div>
        <Field label="Capacidad declarada">
          <input name="capacidad" defaultValue={editing?.capacidad ?? ""} className={inputCls} placeholder="48 MW" />
        </Field>
        <div className="pt-3 border-t border-border">
          <label className="flex items-center gap-2 text-xs font-medium mb-3">
            <input type="checkbox" name="contrato_om" defaultChecked={!!editing?.contrato_om} />
            Tiene contrato de O&amp;M activo
          </label>
          <p className="text-[10px] text-muted-foreground mb-2">Cuotas anuales contratadas por tipo de servicio:</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { name: "cuota_preventivos", label: "Preventivos" },
              { name: "cuota_correctivos", label: "Correctivos" },
              { name: "cuota_menores", label: "Menores" },
              { name: "cuota_medios", label: "Medios" },
              { name: "cuota_mayores", label: "Mayores" },
              { name: "cuota_limpiezas", label: "Limpiezas" },
            ].map((c) => (
              <Field key={c.name} label={c.label}>
                <input
                  name={c.name}
                  type="number"
                  min={0}
                  defaultValue={(editing as any)?.[c.name] ?? 0}
                  className={inputCls + " text-xs"}
                />
              </Field>
            ))}
          </div>
        </div>
      </RecordDialog>
    </div>
  );
}