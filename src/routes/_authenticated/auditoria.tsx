import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ExportButton } from "@/components/ExportButton";
import { inputCls } from "@/components/RecordDialog";
import { listAuditoria } from "@/lib/auditoria.functions";
import { exportarExcel, fmtFechaSV } from "@/lib/excel";
import { History, Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({ meta: [{ title: "Auditoría · EA Service Connect" }] }),
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isStaff = (roles ?? []).some((r: any) => ["admin", "supervisor"].includes(r.role));
    if (!isStaff) throw redirect({ to: "/" });
  },
  component: Auditoria,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {(error as Error)?.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">No encontrado.</div>,
});

const ENTIDADES = ["trabajos","mantenimientos","solicitudes_visita","inventario_items","plantas"];
const ACCIONES = ["insert","update","delete"];
const accionIcon = { insert: Plus, update: Pencil, delete: Trash2 } as const;
const accionColor: Record<string,string> = {
  insert: "bg-accent/10 text-accent",
  update: "bg-primary/10 text-primary",
  delete: "bg-destructive/10 text-destructive",
};

function Auditoria() {
  const fList = useServerFn(listAuditoria);
  const [entidad, setEntidad] = useState("");
  const [accion, setAccion] = useState("");
  const list = useQuery({
    queryKey: ["auditoria", entidad, accion],
    queryFn: () => fList({ data: { entidad: entidad || undefined, accion: accion || undefined } }),
  });

  async function exportar() {
    const rows = (list.data as any[] | undefined) ?? [];
    await exportarExcel({
      filename: `auditoria-${new Date().toISOString().slice(0,10)}.xlsx`,
      hojas: [{
        nombre: "Auditoría",
        columnas: [
          { header: "Fecha", key: "ts", width: 22, fn: (r: any) => fmtFechaSV(r.ts) },
          { header: "Entidad", key: "entidad", width: 22 },
          { header: "Acción", key: "accion", width: 14 },
          { header: "ID Registro", key: "entidad_id", width: 38 },
          { header: "Usuario", key: "actor_nombre", width: 28 },
        ],
        filas: rows,
      }],
    });
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Auditoría"
        description="Registro inmutable de cambios sobre trabajos, mantenimientos, solicitudes, inventario y plantas."
        actions={
          <>
            <select value={entidad} onChange={(e) => setEntidad(e.target.value)} className={inputCls + " w-full sm:w-44"}>
              <option value="">Todas las entidades</option>
              {ENTIDADES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select value={accion} onChange={(e) => setAccion(e.target.value)} className={inputCls + " w-full sm:w-36"}>
              <option value="">Todas las acciones</option>
              {ACCIONES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <ExportButton onExport={exportar} />
          </>
        }
      />

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {list.isLoading && <p className="p-6 text-sm text-muted-foreground">Cargando…</p>}
        {!list.isLoading && ((list.data as any[]) ?? []).length === 0 && (
          <p className="p-8 text-sm text-muted-foreground text-center">No hay eventos.</p>
        )}
        {((list.data as any[]) ?? []).map((r: any) => {
          const Icon = (accionIcon as any)[r.accion] ?? History;
          return (
            <div key={r.id} className="p-4 flex items-start gap-3">
              <div className={"size-9 rounded-md grid place-items-center " + (accionColor[r.accion] ?? "bg-secondary")}>
                <Icon className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider">{r.accion}</span>
                  <span className="text-sm font-semibold">{r.entidad}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{r.entidad_id?.slice(0,8) ?? "—"}</span>
                </div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                  {fmtFechaSV(r.ts)} · {r.actor_nombre}
                </p>
                {r.accion === "update" && (
                  <DiffSummary antes={r.antes} despues={r.despues} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiffSummary({ antes, despues }: { antes: any; despues: any }) {
  if (!antes || !despues) return null;
  const cambios: { campo: string; de: any; a: any }[] = [];
  Object.keys(despues).forEach((k) => {
    if (["updated_at","created_at"].includes(k)) return;
    const a = antes[k], b = despues[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) cambios.push({ campo: k, de: a, a: b });
  });
  if (!cambios.length) return null;
  return (
    <div className="mt-2 text-xs space-y-0.5">
      {cambios.slice(0, 6).map((c) => (
        <div key={c.campo} className="font-mono">
          <span className="text-muted-foreground">{c.campo}:</span>{" "}
          <span className="line-through text-destructive/80">{fmt(c.de)}</span>{" "}
          <span className="text-accent">→ {fmt(c.a)}</span>
        </div>
      ))}
    </div>
  );
}
function fmt(v: any) {
  if (v == null) return "∅";
  if (typeof v === "string") return v.length > 40 ? v.slice(0,40) + "…" : v;
  return JSON.stringify(v).slice(0, 60);
}