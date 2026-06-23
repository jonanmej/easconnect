import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import { Sparkles, Wand2, Eye, FileDown, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { listClientes, listPlantas } from "@/lib/operations.functions";
import { listReportes, generarReporte, getReporte, marcarReporteEnviado, getReporteParaPDF } from "@/lib/reportes.functions";
import { enviarNotificacionReporte } from "@/lib/notificaciones.functions";
import { generarYDescargarPdf, buildEvidencias } from "@/lib/pdf/descargar";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({
    meta: [{ title: "Reportes IA · EA Service Connect" }, { name: "description", content: "Reportes ejecutivos generados con IA para clientes." }],
  }),
  component: Reportes,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

type R = {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  planta_id: string | null;
  planta_nombre: string | null;
  periodo: string;
  titulo: string;
  insight_resumen: string | null;
  estado: "borrador" | "enviado";
  model_used: string | null;
  created_at: string;
};

function Reportes() {
  const qc = useQueryClient();
  const fList = useServerFn(listReportes);
  const fClientes = useServerFn(listClientes);
  const fPlantas = useServerFn(listPlantas);
  const fGen = useServerFn(generarReporte);
  const fGet = useServerFn(getReporte);
  const fSend = useServerFn(marcarReporteEnviado);
  const fPdf = useServerFn(getReporteParaPDF);
  const fEmail = useServerFn(enviarNotificacionReporte);
  const { roles } = useAuth();
  const canEdit = ["admin", "supervisor"].includes(highestRole(roles) ?? "");

  const list = useQuery({ queryKey: ["reportes"], queryFn: () => fList() });
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: () => fClientes() });
  const plantas = useQuery({ queryKey: ["plantas"], queryFn: () => fPlantas() });

  const [openGen, setOpenGen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<string>("");
  const [viewing, setViewing] = useState<string | null>(null);

  const plantasFiltradas = useMemo(() => {
    const all = (plantas.data as any[] | undefined) ?? [];
    return selectedCliente ? all.filter((p) => p.cliente_id === selectedCliente) : all;
  }, [plantas.data, selectedCliente]);

  const gen = useMutation({
    mutationFn: (v: any) => fGen({ data: v }),
    onSuccess: () => { toast.success("Reporte generado"); qc.invalidateQueries({ queryKey: ["reportes"] }); setOpenGen(false); setSelectedCliente(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  const send = useMutation({
    mutationFn: (id: string) => fSend({ data: { id } }),
    onSuccess: () => { toast.success("Marcado como enviado"); qc.invalidateQueries({ queryKey: ["reportes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function descargarPdf(id: string, modo: "ejecutivo" | "interno") {
    setDownloadingId(id + modo);
    try {
      const data: any = await fPdf({ data: { id } });
      const evidencias = await buildEvidencias(data.evidencias);
      await generarYDescargarPdf({
        ...data,
        modo,
        responsable: null,
        evidencias,
      }, `EA Service Connect-${modo}-${data.periodo.replace(/\s+/g, "_")}.pdf`);
      toast.success("PDF descargado");
    } catch (e: any) {
      toast.error(e.message ?? "Error al generar PDF");
    } finally {
      setDownloadingId(null);
    }
  }

  const emailMut = useMutation({
    mutationFn: (vars: { id: string; tipo: "reporte_ejecutivo" | "reporte_interno" }) =>
      fEmail({ data: { reporte_id: vars.id, tipo: vars.tipo } }),
    onSuccess: () => { toast.success("Correo enviado al cliente"); qc.invalidateQueries({ queryKey: ["reportes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const detail = useQuery({
    queryKey: ["reporte", viewing],
    queryFn: () => fGet({ data: { id: viewing! } }),
    enabled: !!viewing,
  });

  function onGenSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const planta_id = f.get("planta_id") as string;
    gen.mutate({
      cliente_id: f.get("cliente_id"),
      planta_id: planta_id || null,
      periodo: f.get("periodo"),
      desde: f.get("desde"),
      hasta: f.get("hasta"),
    });
  }

  const items = (list.data as R[] | undefined) ?? [];
  const borradores = items.filter((r) => r.estado === "borrador").length;
  const enviados = items.filter((r) => r.estado === "enviado").length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Reportes Ejecutivos IA"
        description="La IA analiza datos reales de trabajos, mantenimientos y equipos para generar un informe profesional por cliente."
        actions={canEdit && (
          <button onClick={() => setOpenGen(true)}
            className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
            <Wand2 className="size-3.5" /> Generar nuevo
          </button>
        )}
      />

      <section className="relative overflow-hidden bg-slate-900 text-white rounded-xl p-6 md:p-8 mb-8">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary/40" />
        <div className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
          <div className="w-full h-20 bg-gradient-to-b from-primary/40 to-transparent animate-scanline" />
        </div>
        <div className="relative flex flex-wrap gap-6 items-start justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 mb-3 text-primary">
              <Sparkles className="size-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Lovable AI · Gemini 3 Flash</span>
            </div>
            <h2 className="text-xl font-semibold mb-2">Convierte tus bitácoras en informes ejecutivos</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              La IA toma los trabajos completados, mantenimientos y telemetría del periodo y produce KPIs, hallazgos y recomendaciones priorizadas para el cliente.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Generados" value={items.length} />
            <Stat label="Borradores" value={borradores} tone="primary" />
            <Stat label="Enviados" value={enviados} tone="accent" />
          </div>
        </div>
      </section>

      {list.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="space-y-3">
        {items.map((r) => (
          <div key={r.id} className="bg-card border border-border rounded-xl p-5 flex flex-wrap items-center gap-6 hover:border-primary/40 transition-colors">
            <div className="size-12 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <Sparkles className="size-5" />
            </div>
            <div className="flex-1 min-w-[240px]">
              <h3 className="text-base font-semibold tracking-tight">
                {r.titulo}
              </h3>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {r.cliente_nombre}{r.planta_nombre ? ` · ${r.planta_nombre}` : ""} · {r.periodo} · {new Date(r.created_at).toLocaleDateString()}
              </p>
              {r.insight_resumen && <p className="text-sm mt-2 text-foreground/80 line-clamp-2">{r.insight_resumen}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className={"inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                (r.estado === "enviado" ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary")}>
                {r.estado}
              </span>
              <button onClick={() => setViewing(r.id)} className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary">
                <Eye className="size-3.5" /> Ver
              </button>
              <button onClick={() => descargarPdf(r.id, "ejecutivo")} disabled={downloadingId === r.id + "ejecutivo"}
                className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
                <FileDown className="size-3.5" /> {downloadingId === r.id + "ejecutivo" ? "Generando…" : "PDF Ejec."}
              </button>
              {canEdit && (
                <button onClick={() => descargarPdf(r.id, "interno")} disabled={downloadingId === r.id + "interno"}
                  className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary disabled:opacity-50">
                  <FileDown className="size-3.5" /> PDF Interno
                </button>
              )}
              {canEdit && (
                <button onClick={() => emailMut.mutate({ id: r.id, tipo: "reporte_ejecutivo" })} disabled={emailMut.isPending}
                  className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary disabled:opacity-50"
                  title="Enviar email al cliente">
                  <Mail className="size-3.5" /> Enviar
                </button>
              )}
            </div>
          </div>
        ))}
        {!list.isLoading && items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Aún no hay reportes. Genera el primero.</p>
        )}
      </div>

      <RecordDialog
        open={openGen}
        onOpenChange={(v) => { setOpenGen(v); if (!v) setSelectedCliente(""); }}
        title="Generar reporte ejecutivo IA"
        description="La IA puede tardar 20-60 segundos. No cierres la ventana."
        submitLabel={gen.isPending ? "Generando con IA…" : "Generar"}
        busy={gen.isPending}
        error={gen.error?.message}
        onSubmit={onGenSubmit}
      >
        <Field label="Cliente">
          <select name="cliente_id" required value={selectedCliente} onChange={(e) => setSelectedCliente(e.target.value)} className={inputCls}>
            <option value="" disabled>Selecciona…</option>
            {(clientes.data as any[] | undefined)?.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Planta (opcional · todas si vacío)">
          <select name="planta_id" defaultValue="" className={inputCls}>
            <option value="">Todas las plantas del cliente</option>
            {plantasFiltradas.map((p: any) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Etiqueta del periodo">
          <input name="periodo" required placeholder="Q2 2026" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde"><input name="desde" type="date" required className={inputCls} /></Field>
          <Field label="Hasta"><input name="hasta" type="date" required className={inputCls} /></Field>
        </div>
      </RecordDialog>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{(detail.data as any)?.titulo ?? "Reporte"}</DialogTitle>
            <DialogDescription>
              {(detail.data as any)?.model_used ? `Modelo: ${(detail.data as any).model_used}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {detail.data && (
            <article className="text-sm leading-relaxed space-y-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1 [&_h3]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_strong]:font-semibold">
              <ReactMarkdown>{(detail.data as any).contenido_markdown}</ReactMarkdown>
            </article>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "primary" | "accent" }) {
  return (
    <div className="bg-white/5 rounded-lg p-3 border border-white/10 min-w-[80px]">
      <p className={"text-2xl font-mono font-semibold " + (tone === "primary" ? "text-primary" : tone === "accent" ? "text-accent" : "")}>
        {String(value).padStart(2, "0")}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">{label}</p>
    </div>
  );
}