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
import {
  listUsuariosCliente,
  listUsuariosAsignables,
  asignarUsuarioCliente,
  quitarUsuarioCliente,
} from "@/lib/clientes-usuarios.functions";
import { Plus, Pencil, Trash2, UserCog, X } from "lucide-react";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
  const [managing, setManaging] = useState<ClienteRow | null>(null);
  const [query, setQuery] = useState("");
  const [omFilter, setOmFilter] = useState<"todos" | "con" | "sin">("todos");

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
      solo_capacitacion: f.get("solo_capacitacion") === "on",
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

      {(() => {
        const all = (list.data as ClienteRow[] | undefined) ?? [];
        const total = all.length;
        const conOM = all.filter((c) => c.contrato_om).length;
        const sinOM = total - conOM;
        const q = query.trim().toLowerCase();
        const filtered = all.filter((c) => {
          if (omFilter === "con" && !c.contrato_om) return false;
          if (omFilter === "sin" && c.contrato_om) return false;
          if (!q) return true;
          return [c.nombre, c.contacto, c.email, c.telefono, c.capacidad]
            .filter(Boolean)
            .some((v) => (v as string).toLowerCase().includes(q));
        });
        return (
          <>
            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre, contacto, email…"
                  className="w-full h-10 pl-9 pr-3 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div className="inline-flex rounded-md border border-border bg-card overflow-hidden text-xs font-medium">
                {([
                  { v: "todos", l: `Todos (${total})` },
                  { v: "con", l: `Con O&M (${conOM})` },
                  { v: "sin", l: `Sin O&M (${sinOM})` },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setOmFilter(opt.v)}
                    className={
                      "px-3 py-2 transition-colors " +
                      (omFilter === opt.v
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary")
                    }
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
            {filtered.length === 0 && !list.isLoading && (
              <p className="text-sm text-muted-foreground py-6">No hay clientes que coincidan con el filtro.</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((c) => (
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
            <div className="mt-1">
              <span
                className={
                  "inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                  (c.contrato_om
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-600")
                }
                title={c.contrato_om ? "Cliente con contrato de O&M activo" : "Cliente sin contrato de O&M"}
              >
                {c.contrato_om ? "Con O&M" : "Sin O&M"}
              </span>
            </div>
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
                <button
                  onClick={() => setManaging(c)}
                  className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-primary"
                  aria-label="Gestionar encargados"
                  title="Gestionar encargados"
                >
                  <UserCog className="size-3.5" />
                </button>
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
          </>
        );
      })()}

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
              { name: "cuota_preventivos", label: "Servicio técnico de drone" },
              { name: "cuota_correctivos", label: "Mantenimiento de transformador eléctrico" },
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

      <EncargadosDialog
        cliente={managing}
        onClose={() => setManaging(null)}
      />
    </div>
  );
}

function EncargadosDialog({
  cliente,
  onClose,
}: {
  cliente: ClienteRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fList = useServerFn(listUsuariosCliente);
  const fAsignables = useServerFn(listUsuariosAsignables);
  const fAsignar = useServerFn(asignarUsuarioCliente);
  const fQuitar = useServerFn(quitarUsuarioCliente);
  const open = !!cliente;

  const encargados = useQuery({
    queryKey: ["cliente-encargados", cliente?.id],
    queryFn: () => fList({ data: { clienteId: cliente!.id } }),
    enabled: open,
  });
  const asignables = useQuery({
    queryKey: ["usuarios-asignables-cliente"],
    queryFn: () => fAsignables(),
    enabled: open,
  });

  const [selUserId, setSelUserId] = useState("");

  const asignar = useMutation({
    mutationFn: (userId: string) => fAsignar({ data: { userId, clienteId: cliente!.id } }),
    onSuccess: () => {
      toast.success("Encargado asignado al cliente");
      qc.invalidateQueries({ queryKey: ["cliente-encargados", cliente!.id] });
      qc.invalidateQueries({ queryKey: ["usuarios-asignables-cliente"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setSelUserId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quitar = useMutation({
    mutationFn: (userId: string) => fQuitar({ data: { userId } }),
    onSuccess: () => {
      toast.success("Encargado desvinculado");
      qc.invalidateQueries({ queryKey: ["cliente-encargados", cliente!.id] });
      qc.invalidateQueries({ queryKey: ["usuarios-asignables-cliente"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Sólo permitir asignar usuarios "cliente" que no estén ya asignados a este cliente
  const disponibles = (asignables.data ?? []).filter(
    (u: any) => u.cliente_id !== cliente?.id,
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Encargados de {cliente?.nombre}</DialogTitle>
          <DialogDescription>
            Asigna o cambia los usuarios responsables del cliente. Útil cuando hay un cambio
            de encargado por parte del cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Usuarios actuales
            </p>
            {encargados.isLoading && (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            )}
            {encargados.data?.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin encargados asignados.</p>
            )}
            <ul className="space-y-2">
              {encargados.data?.map((u: any) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between border border-border rounded-md px-3 py-2 bg-secondary/40"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {u.display_name ?? u.email}
                    </div>
                    {u.display_name && (
                      <div className="text-[10px] text-muted-foreground">{u.email}</div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`¿Quitar a ${u.email} como encargado?`)) quitar.mutate(u.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    title="Quitar"
                    aria-label="Quitar"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-3 border-t border-border">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              Asignar nuevo encargado
            </p>
            <div className="flex gap-2">
              <select
                value={selUserId}
                onChange={(e) => setSelUserId(e.target.value)}
                className={inputCls + " flex-1"}
              >
                <option value="">— Selecciona un usuario con rol cliente —</option>
                {disponibles.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                    {u.cliente_id ? " (ya en otro cliente)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selUserId || asignar.isPending}
                onClick={() => asignar.mutate(selUserId)}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                Asignar
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Para crear una cuenta nueva, ve a Usuarios → Invitar usuario con rol "cliente".
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}