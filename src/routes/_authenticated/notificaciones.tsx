import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Field, inputCls } from "@/components/RecordDialog";
import { Mail, RotateCw, CheckCircle2, XCircle } from "lucide-react";
import { listNotificaciones, reintentarNotificacion } from "@/lib/notificaciones.functions";
import { listClientes, listPlantas } from "@/lib/operations.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { ExportButton } from "@/components/ExportButton";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ResponsiveTable";
import { exportarExcel, fmtFechaSV } from "@/lib/excel";
import { PlantaOptions } from "@/components/PlantaOptions";

export const Route = createFileRoute("/_authenticated/notificaciones")({
  head: () => ({ meta: [{ title: "Historial de Notificaciones · EA Service Connect" }] }),
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isStaff = (roles ?? []).some((r: any) => ["admin", "supervisor", "tecnico"].includes(r.role));
    if (!isStaff) throw redirect({ to: "/" });
  },
  component: Notificaciones,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {(error as Error)?.message}</div>
  ),
});

function Notificaciones() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const role = highestRole(roles);
  const isStaff = role === "admin" || role === "supervisor" || role === "tecnico";
  const fList = useServerFn(listNotificaciones);
  const fRetry = useServerFn(reintentarNotificacion);
  const fClientes = useServerFn(listClientes);
  const fPlantas = useServerFn(listPlantas);

  const clientes = useQuery({ queryKey: ["clientes"], queryFn: () => fClientes(), enabled: isStaff });
  const plantas = useQuery({ queryKey: ["plantas"], queryFn: () => fPlantas(), enabled: isStaff });

  const [filtros, setFiltros] = useState<{ cliente_id?: string; planta_id?: string; desde?: string; hasta?: string; tipo?: string; estado?: string }>({});

  const list = useQuery({
    queryKey: ["notif-log", filtros],
    queryFn: () => fList({ data: filtros as any }),
  });

  const plantasFiltradas = useMemo(() => {
    const all = (plantas.data as any[] | undefined) ?? [];
    return filtros.cliente_id ? all.filter((p) => p.cliente_id === filtros.cliente_id) : all;
  }, [plantas.data, filtros.cliente_id]);

  const retry = useMutation({
    mutationFn: (id: string) => fRetry({ data: { id } }),
    onSuccess: () => { toast.success("Reenviado"); qc.invalidateQueries({ queryKey: ["notif-log"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = (list.data as any[] | undefined) ?? [];
  const enviados = items.filter((i) => i.estado === "enviado").length;
  const errores = items.filter((i) => i.estado === "error").length;

  const notifColumns: ResponsiveColumn<any>[] = [
    {
      key: "fecha",
      header: "Fecha",
      cell: (n) => (
        <span className="font-mono text-xs">
          {new Date(n.enviado_at).toLocaleString("es-SV", { timeZone: "America/El_Salvador", dateStyle: "short", timeStyle: "short" })}
        </span>
      ),
    },
    {
      key: "cliente",
      header: "Cliente · Planta",
      primary: true,
      cell: (n) => (
        <div>
          <p className="font-medium">{n.cliente_nombre}</p>
          {n.planta_nombre && <p className="text-xs text-muted-foreground">{n.planta_nombre}</p>}
        </div>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      secondary: true,
      cell: (n) => <span className="text-[10px] font-bold uppercase">{n.tipo}</span>,
    },
    {
      key: "destinatario",
      header: "Destinatario",
      cell: (n) => <span className="text-xs">{n.destinatario}</span>,
    },
    {
      key: "estado",
      header: "Estado",
      cell: (n) =>
        n.estado === "enviado" ? (
          <span className="inline-flex items-center gap-1.5 text-accent text-xs"><CheckCircle2 className="size-3.5" /> Enviado</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-destructive text-xs" title={n.error_mensaje ?? ""}><XCircle className="size-3.5" /> Error</span>
        ),
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Historial de Notificaciones"
        description="Auditoría de todos los correos enviados desde EA Service Connect (notificaciones automáticas y manuales)."
        actions={
          <ExportButton onExport={async () => {
            await exportarExcel({
              filename: `notificaciones-${new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" })}.xlsx`,
              hojas: [{
                nombre: "Notificaciones",
                columnas: [
                  { header: "Fecha", key: "enviado_at", width: 22, fn: (r: any) => fmtFechaSV(r.enviado_at) },
                  { header: "Tipo", key: "tipo", width: 24 },
                  { header: "Destinatario", key: "destinatario", width: 32 },
                  { header: "Asunto", key: "asunto", width: 50 },
                  { header: "Estado", key: "estado", width: 14 },
                  { header: "Error", key: "error_mensaje", width: 40 },
                ],
                filas: items,
              }],
            });
          }} />
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Total" value={items.length} />
        <Stat label="Enviados" value={enviados} tone="accent" />
        <Stat label="Errores" value={errores} tone="danger" />
      </div>

      {isStaff && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
          <Field label="Cliente">
            <select className={inputCls} value={filtros.cliente_id ?? ""} onChange={(e) => setFiltros((f) => ({ ...f, cliente_id: e.target.value || undefined, planta_id: undefined }))}>
              <option value="">Todos</option>
              {(clientes.data as any[] | undefined)?.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
            </select>
          </Field>
          <Field label="Planta">
            <select className={inputCls} value={filtros.planta_id ?? ""} onChange={(e) => setFiltros((f) => ({ ...f, planta_id: e.target.value || undefined }))}>
              <option value="">Todas</option>
              <PlantaOptions plantas={plantasFiltradas as any[]} />
            </select>
          </Field>
          <Field label="Desde">
            <input type="date" className={inputCls} value={filtros.desde ?? ""} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value ? e.target.value + "T00:00:00Z" : undefined }))} />
          </Field>
          <Field label="Hasta">
            <input type="date" className={inputCls} value={filtros.hasta?.slice(0, 10) ?? ""} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value ? e.target.value + "T23:59:59Z" : undefined }))} />
          </Field>
          <Field label="Tipo">
            <select className={inputCls} value={filtros.tipo ?? ""} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value || undefined }))}>
              <option value="">Todos</option>
              <option value="completado">Trabajo completado</option>
              <option value="reporte_ejecutivo">Reporte ejecutivo</option>
              <option value="reporte_interno">Reporte interno</option>
              <option value="manual">Manual</option>
            </select>
          </Field>
          <Field label="Estado">
            <select className={inputCls} value={filtros.estado ?? ""} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value || undefined }))}>
              <option value="">Todos</option>
              <option value="enviado">Enviado</option>
              <option value="error">Error</option>
            </select>
          </Field>
        </div>
      )}

      {list.isLoading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <ResponsiveTable
          data={items}
          rowKey={(n) => n.id}
          emptyMessage="Sin notificaciones registradas con esos filtros."
          columns={notifColumns}
          rowActions={
            isStaff
              ? (n) =>
                  n.estado === "error" ? (
                    <button onClick={() => retry.mutate(n.id)} disabled={retry.isPending}
                      className="min-h-11 md:h-8 md:min-h-0 px-2 inline-flex items-center gap-1.5 text-xs border border-border rounded-md hover:bg-secondary disabled:opacity-50">
                      <RotateCw className="size-3.5" /> Reintentar
                    </button>
                  ) : null
              : undefined
          }
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "accent" | "danger" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className={"text-2xl font-mono font-semibold " + (tone === "accent" ? "text-accent" : tone === "danger" ? "text-destructive" : "")}>
        {String(value).padStart(2, "0")}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</p>
    </div>
  );
}