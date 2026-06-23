import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Sparkles, FileDown, Wand2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({
    meta: [{ title: "Reportes IA · SOLAROS" }, { name: "description", content: "Reportes ejecutivos generados con IA para clientes." }],
  }),
  component: Reportes,
});

const reportes = [
  {
    cliente: "Energía Atacama",
    planta: "Atacama III",
    fecha: "23 Jun 2026",
    periodo: "Q2 2026",
    insight: "Limpieza robotizada elevó captación fotónica +12.4% vs. trimestre anterior.",
    estado: "Listo para enviar",
  },
  {
    cliente: "Hidromax S.A.",
    planta: "Los Olivos",
    fecha: "21 Jun 2026",
    periodo: "Junio 2026",
    insight: "Eficiencia se mantiene 94.1%. Recomendado adelantar próxima limpieza 5 días.",
    estado: "Enviado",
  },
  {
    cliente: "Genco Industrial",
    planta: "Central Térmica Sur",
    fecha: "20 Jun 2026",
    periodo: "Mantenimiento motor S-42",
    insight: "Vibración anómala detectada. Intervención correctiva exitosa, MTBF +320h.",
    estado: "Enviado",
  },
];

function Reportes() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Reportes Ejecutivos IA"
        description="La IA analiza datos de campo de técnicos y operadores y genera un informe profesional para cada cliente."
        actions={
          <button className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
            <Wand2 className="size-3.5" /> Generar nuevo
          </button>
        }
      />

      {/* AI panel hero */}
      <section className="relative overflow-hidden bg-slate-900 text-white rounded-xl p-6 md:p-8 mb-8">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary/40" />
        <div className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
          <div className="w-full h-20 bg-gradient-to-b from-primary/40 to-transparent animate-scanline" />
        </div>
        <div className="relative flex flex-wrap gap-6 items-start justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 mb-3 text-primary">
              <Sparkles className="size-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                Lovable AI · Gemini 3 Flash
              </span>
            </div>
            <h2 className="text-xl font-semibold mb-2">
              Convierte bitácoras de campo en informes ejecutivos
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Los técnicos suben notas, fotos y telemetría. La IA sintetiza KPIs, hallazgos y
              recomendaciones en un PDF listo para el cliente, en menos de 60 segundos.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <p className="text-2xl font-mono font-semibold">42</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">
                Generados
              </p>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <p className="text-2xl font-mono font-semibold text-primary">06</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">
                Borradores
              </p>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <p className="text-2xl font-mono font-semibold text-accent">36</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">
                Enviados
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-3">
        {reportes.map((r, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-xl p-5 flex flex-wrap items-center gap-6 hover:border-primary/40 transition-colors"
          >
            <div className="size-12 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <Sparkles className="size-5" />
            </div>
            <div className="flex-1 min-w-[240px]">
              <h3 className="text-base font-semibold tracking-tight">
                {r.cliente} <span className="text-muted-foreground font-normal">· {r.planta}</span>
              </h3>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {r.periodo} · {r.fecha}
              </p>
              <p className="text-sm mt-2 text-foreground/80">{r.insight}</p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={
                  "inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
                  (r.estado === "Enviado"
                    ? "bg-accent/10 text-accent"
                    : "bg-primary/10 text-primary")
                }
              >
                {r.estado}
              </span>
              <button className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary">
                <FileDown className="size-3.5" /> PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}