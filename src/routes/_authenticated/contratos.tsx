import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { listPlantas } from "@/lib/operations.functions";
import {
  listContratos, upsertContrato, eliminarContrato, generarProgramacionAnual,
} from "@/lib/contratos.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { CalendarPlus, FileText, Trash2, Wand2 } from "lucide-react";
import { SERVICIOS_CONTRATO, SERVICIOS_NO_CONTRATABLES } from "@/lib/servicios";
const SERVICIOS_CONTRATO_SET = new Set<string>(SERVICIOS_CONTRATO);
const SERVICIOS_NO_CONTRATABLES_SET = new Set<string>(SERVICIOS_NO_CONTRATABLES);

export const Route = createFileRoute("/_authenticated/contratos")({
  head: () => ({
    meta: [
      { title: "Contratos · EA Service Connect" },
      { name: "description", content: "Servicios contratados por planta y autoprogramación anual." },
    ],
  }),
  component: ContratosPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">No encontrado.</div>,
});

function ContratosPage() {
  const { roles } = useAuth();
  const role = highestRole(roles);
  const isStaff = role === "admin" || role === "supervisor";
  const qc = useQueryClient();

  const fList = useServerFn(listContratos);
  const fPlantas = useServerFn(listPlantas);
  const fUpsert = useServerFn(upsertContrato);
  const fDel = useServerFn(eliminarContrato);
  const fGen = useServerFn(generarProgramacionAnual);

  const contratos = useQuery({ queryKey: ["contratos"], queryFn: () => fList() });
  const plantas = useQuery({ queryKey: ["plantas"], queryFn: () => fPlantas(), enabled: isStaff });

  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const upsert = useMutation({
    mutationFn: (payload: any) => fUpsert({ data: payload }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contratos"] }); setEditing(null); setCreating(false); toast.success("Contrato guardado"); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const del = useMutation({
    mutationFn: (id: string) => fDel({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contratos"] }); toast.success("Eliminado"); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const gen = useMutation({
    mutationFn: (contrato_id: string) => fGen({ data: { contrato_id } }),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ["trabajos"] }); toast.success(`Programación generada: ${r.creados} nuevos, ${r.ciclos_existentes} existentes`); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const rows = (contratos.data as any[] | undefined) ?? [];

  return (
    <div className="p-6 md:p-8 space-y-6">
      <PageHeader
        title="Contratos de servicio"
        description="Define la cantidad anual de servicios contratada por planta y genera la programación automática."
        actions={isStaff ? (
          <button onClick={() => setCreating(true)} className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:brightness-105">
            <FileText className="size-3.5" /> Nuevo contrato
          </button>
        ) : null}
      />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Cliente</th>
              <th className="px-4 py-2 text-left">Planta</th>
              <th className="px-4 py-2 text-left">Servicio</th>
              <th className="px-4 py-2 text-right">Cantidad/año</th>
              <th className="px-4 py-2 text-left">Inicio</th>
              <th className="px-4 py-2 text-right">Duración</th>
              {isStaff && <th className="px-4 py-2 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">{c.cliente_nombre}</td>
                <td className="px-4 py-3 font-medium">{c.planta_nombre}</td>
                <td className="px-4 py-3">{c.servicio}</td>
                <td className="px-4 py-3 text-right font-mono">{c.cantidad_anual}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.fecha_inicio}</td>
                <td className="px-4 py-3 text-right">{c.duracion_dias_default}d</td>
                {isStaff && (
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => gen.mutate(c.id)} disabled={gen.isPending} title="Generar programación anual"
                        className="size-8 grid place-items-center rounded hover:bg-secondary disabled:opacity-50">
                        <Wand2 className="size-4" />
                      </button>
                      <button onClick={() => setEditing(c)} title="Editar"
                        className="size-8 grid place-items-center rounded hover:bg-secondary">
                        <CalendarPlus className="size-4" />
                      </button>
                      <button onClick={() => { if (confirm("¿Eliminar contrato?")) del.mutate(c.id); }} title="Eliminar"
                        className="size-8 grid place-items-center rounded hover:bg-destructive/10 text-destructive">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={isStaff ? 7 : 6} className="px-4 py-6 text-center text-muted-foreground">Sin contratos definidos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(editing || creating) && isStaff && (
        <ContratoDialog
          contrato={editing}
          plantas={(plantas.data as any[] | undefined) ?? []}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={(payload) => upsert.mutate(payload)}
          saving={upsert.isPending}
        />
      )}
    </div>
  );
}

function ContratoDialog({
  contrato, plantas, onClose, onSave, saving,
}: { contrato: any | null; plantas: any[]; onClose: () => void; onSave: (p: any) => void; saving: boolean }) {
  const today = new Date();
  const anio = today.getFullYear();
  const [form, setForm] = useState({
    id: contrato?.id,
    planta_id: contrato?.planta_id ?? plantas[0]?.id ?? "",
    servicio: contrato?.servicio ?? SERVICIOS_CONTRATO[0],
    cantidad_anual: contrato?.cantidad_anual ?? 12,
    fecha_inicio: contrato?.fecha_inicio ?? `${anio}-01-01`,
    duracion_dias_default: contrato?.duracion_dias_default ?? 1,
    activo: contrato?.activo ?? true,
  });
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4" role="dialog">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">{contrato ? "Editar contrato" : "Nuevo contrato"}</h2>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-muted-foreground">Planta</span>
            <select value={form.planta_id} onChange={(e) => setForm({ ...form, planta_id: e.target.value })}
              className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background">
              {(() => {
                // Agrupar por cliente y renderizar como <optgroup> ordenados alfabéticamente.
                const grupos = new Map<string, any[]>();
                [...plantas]
                  .sort((a, b) =>
                    String(a.cliente_nombre ?? "—").localeCompare(String(b.cliente_nombre ?? "—")) ||
                    String(a.nombre ?? "").localeCompare(String(b.nombre ?? "")),
                  )
                  .forEach((p) => {
                    const c = String(p.cliente_nombre ?? "— Sin cliente");
                    if (!grupos.has(c)) grupos.set(c, []);
                    grupos.get(c)!.push(p);
                  });
                return Array.from(grupos.entries()).map(([cliente, ps]) => (
                  <optgroup key={cliente} label={cliente}>
                    {ps.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </optgroup>
                ));
              })()}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Tipo de servicio</span>
            <select value={form.servicio} onChange={(e) => setForm({ ...form, servicio: e.target.value })}
              className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background">
              {SERVICIOS_CONTRATO.map((s) => <option key={s} value={s}>{s}</option>)}
              {contrato?.servicio && !SERVICIOS_CONTRATO.includes(contrato.servicio as any) && (
                <option value={contrato.servicio}>{contrato.servicio} (legado)</option>
              )}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Cantidad / año</span>
              <input type="number" min={1} max={365} value={form.cantidad_anual}
                onChange={(e) => setForm({ ...form, cantidad_anual: Number(e.target.value) })}
                className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background" />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Duración (días)</span>
              <input type="number" min={1} max={60} value={form.duracion_dias_default}
                onChange={(e) => setForm({ ...form, duracion_dias_default: Number(e.target.value) })}
                className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-muted-foreground">Fecha de inicio del primer ciclo</span>
            <input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
              className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background" />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-9 px-4 rounded-md border border-input text-sm">Cancelar</button>
          <button
            onClick={() => {
              if (SERVICIOS_NO_CONTRATABLES_SET.has(form.servicio)) {
                toast.error(`"${form.servicio}" no es un servicio contratable. Selecciona otro tipo.`);
                return;
              }
              if (!SERVICIOS_CONTRATO_SET.has(form.servicio) && form.servicio !== contrato?.servicio) {
                toast.error("Selecciona un servicio del catálogo de contratos.");
                return;
              }
              if (!form.planta_id) { toast.error("Debes seleccionar una planta."); return; }
              if (!form.fecha_inicio) { toast.error("Indica la fecha de inicio del primer ciclo."); return; }
              onSave(form);
            }}
            disabled={saving}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}