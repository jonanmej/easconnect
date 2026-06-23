import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import { Plus, Clock, Pencil, Trash2 } from "lucide-react";
import { listEquipos } from "@/lib/operations.functions";
import { listMantenimientos, upsertMantenimiento, deleteMantenimiento } from "@/lib/mantenimientos.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { ExportButton } from "@/components/ExportButton";
import { exportarExcel } from "@/lib/excel";

export const Route = createFileRoute("/_authenticated/mantenimientos")({
  head: () => ({
    meta: [{ title: "Mantenimientos · EA Service Connect" }, { name: "description", content: "Bitácora de mantenimientos a equipos." }],
  }),
  component: Mantenimientos,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

type M = {
  id: string;
  equipo_id: string;
  equipo_label: string;
  tipo: "preventivo" | "correctivo" | "predictivo";
  fecha: string;
  horas: number;
  estado: "programado" | "pendiente" | "completado" | "cancelado";
  notas: string | null;
};

const estadoStyles: Record<M["estado"], string> = {
  completado: "bg-accent/10 text-accent",
  programado: "bg-primary/10 text-primary",
  pendiente: "bg-amber-100 text-amber-700",
  cancelado: "bg-secondary text-muted-foreground",
};

function Mantenimientos() {
  const qc = useQueryClient();
  const fList = useServerFn(listMantenimientos);
  const fEquipos = useServerFn(listEquipos);
  const fUpsert = useServerFn(upsertMantenimiento);
  const fDelete = useServerFn(deleteMantenimiento);
  const { roles } = useAuth();
  const canEdit = ["admin", "supervisor"].includes(highestRole(roles) ?? "");

  const list = useQuery({ queryKey: ["mantenimientos"], queryFn: () => fList() });
  const equipos = useQuery({ queryKey: ["equipos"], queryFn: () => fEquipos() });

  const [filtro, setFiltro] = useState<"todos" | M["estado"]>("todos");
  const [editing, setEditing] = useState<Partial<M> | null>(null);

  const rows = useMemo(() => {
    const all = (list.data as M[] | undefined) ?? [];
    return filtro === "todos" ? all : all.filter((m) => m.estado === filtro);
  }, [list.data, filtro]);

  const save = useMutation({
    mutationFn: (v: any) => fUpsert({ data: v }),
    onSuccess: () => { toast.success("Guardado"); qc.invalidateQueries({ queryKey: ["mantenimientos"] }); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => fDelete({ data: { id } }),
    onSuccess: () => { toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["mantenimientos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({
      id: editing?.id,
      equipo_id: f.get("equipo_id"),
      tipo: f.get("tipo"),
      fecha: f.get("fecha"),
      horas: Number(f.get("horas") || 0),
      estado: f.get("estado"),
      notas: f.get("notas") || null,
    });
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Bitácora de Mantenimientos"
        description="Historial preventivo, correctivo y predictivo ligado a cada equipo."
        actions={
          <>
            <ExportButton onExport={async () => {
              await exportarExcel({
                filename: `mantenimientos-${new Date().toISOString().slice(0,10)}.xlsx`,
                hojas: [{
                  nombre: "Mantenimientos",
                  columnas: [
                    { header: "Fecha", key: "fecha", width: 14 },
                    { header: "Equipo", key: "equipo_label", width: 30 },
                    { header: "Tipo", key: "tipo", width: 14 },
                    { header: "Estado", key: "estado", width: 14 },
                    { header: "Horas", key: "horas", width: 10, format: "#,##0.0" },
                    { header: "Notas", key: "notas", width: 40 },
                  ],
                  filas: rows as any[],
                  total: ["horas"],
                }],
              });
            }} />
            {canEdit && (
              <button onClick={() => setEditing({ tipo: "preventivo", estado: "programado", fecha: new Date().toISOString().slice(0, 10) })}
                className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
                <Plus className="size-3.5" /> Registrar
              </button>
            )}
          </>
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        {(["todos","programado","pendiente","completado","cancelado"] as const).map((f) => (
          <button key={f} onClick={() => setFiltro(f)}
            className={"px-3 py-1.5 rounded text-[11px] font-medium uppercase tracking-wide " +
              (filtro === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
            {f}
          </button>
        ))}
      </div>

      {list.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="space-y-3">
        {rows.map((m) => (
          <div key={m.id} className="bg-card border border-border rounded-xl p-5 flex flex-wrap gap-6 items-start">
            <div className="flex-1 min-w-[260px]">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-base font-semibold tracking-tight">{m.equipo_label}</h3>
                <span className={"inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " + (estadoStyles[m.estado] ?? "bg-secondary")}>
                  {m.estado}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3 capitalize">
                {m.tipo} · {m.fecha}
              </p>
              {m.notas && <p className="text-sm">{m.notas}</p>}
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary border border-border">
              <Clock className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-sm font-semibold">{m.horas}h</span>
            </div>
            {canEdit && (
              <div className="flex gap-1">
                <button onClick={() => setEditing(m)} className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" aria-label="Editar">
                  <Pencil className="size-3.5" />
                </button>
                <button onClick={() => { if (confirm("Eliminar mantenimiento?")) remove.mutate(m.id); }}
                  className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive" aria-label="Eliminar">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        {!list.isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Sin registros para este filtro.</p>
        )}
      </div>

      <RecordDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing?.id ? "Editar mantenimiento" : "Nuevo mantenimiento"}
        busy={save.isPending}
        error={save.error?.message}
        onSubmit={onSubmit}
      >
        <Field label="Equipo">
          <select name="equipo_id" required defaultValue={editing?.equipo_id ?? ""} className={inputCls}>
            <option value="" disabled>Selecciona…</option>
            {(equipos.data as any[] | undefined)?.map((e) => (
              <option key={e.id} value={e.id}>{e.codigo} · {e.nombre}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tipo">
            <select name="tipo" defaultValue={editing?.tipo ?? "preventivo"} className={inputCls}>
              <option value="preventivo">Preventivo</option>
              <option value="correctivo">Correctivo</option>
              <option value="predictivo">Predictivo</option>
            </select>
          </Field>
          <Field label="Fecha"><input name="fecha" type="date" required defaultValue={editing?.fecha ?? ""} className={inputCls} /></Field>
          <Field label="Horas"><input name="horas" type="number" min="0" step="0.25" defaultValue={editing?.horas ?? 0} className={inputCls} /></Field>
        </div>
        <Field label="Estado">
          <select name="estado" defaultValue={editing?.estado ?? "programado"} className={inputCls}>
            <option value="programado">Programado</option>
            <option value="pendiente">Pendiente</option>
            <option value="completado">Completado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </Field>
        <Field label="Notas">
          <textarea name="notas" rows={3} defaultValue={editing?.notas ?? ""} className={inputCls} />
        </Field>
      </RecordDialog>
    </div>
  );
}