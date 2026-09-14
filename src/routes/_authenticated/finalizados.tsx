import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileDown, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ResponsiveTable";
import { listClientes, listPlantas } from "@/lib/operations.functions";
import { listTrabajosFinalizados } from "@/lib/finalizados.functions";
import { generarYDescargarFinalizadosPdf } from "@/lib/pdf/descargar";

export const Route = createFileRoute("/_authenticated/finalizados")({
  head: () => ({
    meta: [
      { title: "Trabajos finalizados · EA Service Connect" },
      {
        name: "description",
        content: "Día y hora de finalización de los trabajos por cliente y planta, con descarga en PDF.",
      },
      { property: "og:title", content: "Trabajos finalizados por cliente" },
      {
        property: "og:description",
        content: "Consulta y descarga en PDF los trabajos finalizados por cliente, planta y período.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinalizadosPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">No encontrado.</div>,
});

const TZ = "America/El_Salvador";

function fmtFecha(dia: string) {
  try {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(String(dia).slice(0, 10))
      ? new Date(`${String(dia).slice(0, 10)}T12:00:00`)
      : new Date(dia);
    return base.toLocaleDateString("es-SV", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(dia).slice(0, 10);
  }
}

function fmtHora(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("es-SV", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

const TRIMESTRES = [
  { value: 1, label: "T1 · Ene – Mar", nombre: "1er trimestre" },
  { value: 2, label: "T2 · Abr – Jun", nombre: "2do trimestre" },
  { value: 3, label: "T3 · Jul – Sep", nombre: "3er trimestre" },
  { value: 4, label: "T4 · Oct – Dic", nombre: "4to trimestre" },
] as const;

function trimestreActual() {
  return (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}
function rangoTrimestre(t: number, anio: number) {
  const mesInicio = (t - 1) * 3;
  const desde = new Date(Date.UTC(anio, mesInicio, 1)).toISOString().slice(0, 10);
  const hasta = new Date(Date.UTC(anio, mesInicio + 3, 0)).toISOString().slice(0, 10);
  return { desde, hasta };
}

function FinalizadosPage() {
  const fClientes = useServerFn(listClientes);
  const fPlantas = useServerFn(listPlantas);
  const fFinalizados = useServerFn(listTrabajosFinalizados);

  const [clienteId, setClienteId] = useState("");
  const [plantaId, setPlantaId] = useState("");
  const [servicio, setServicio] = useState("");
  const [trimestre, setTrimestre] = useState<number>(trimestreActual());
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [descargando, setDescargando] = useState(false);

  const clientes = useQuery({ queryKey: ["clientes"], queryFn: () => fClientes() });
  const plantas = useQuery({ queryKey: ["plantas"], queryFn: () => fPlantas() });

  const finalizados = useQuery({
    queryKey: ["trabajos-finalizados", clienteId, plantaId, servicio, trimestre, anio],
    queryFn: () =>
      fFinalizados({
        data: {
          ...(clienteId ? { cliente_id: clienteId } : {}),
          ...(plantaId ? { planta_id: plantaId } : {}),
          ...(servicio ? { servicio } : {}),
          trimestre,
          anio,
        },
      }),
  });

  const { desde, hasta } = rangoTrimestre(trimestre, anio);
  const nombreTrimestre = `${TRIMESTRES.find((t) => t.value === trimestre)?.nombre ?? `T${trimestre}`} ${anio}`;
  const aniosDisponibles = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  // Opciones de servicio calculadas SIN el filtro de servicio, para que la lista
  // no se reduzca a la opción ya elegida.
  const opcionesServicio = useQuery({
    queryKey: ["trabajos-finalizados-servicios", clienteId, plantaId, trimestre, anio],
    queryFn: () =>
      fFinalizados({
        data: {
          ...(clienteId ? { cliente_id: clienteId } : {}),
          ...(plantaId ? { planta_id: plantaId } : {}),
          trimestre,
          anio,
        },
      }),
  });

  const rows = (finalizados.data as any[] | undefined) ?? [];
  const listaPlantas = ((plantas.data as any[] | undefined) ?? []).filter(
    (p) => !clienteId || p.cliente_id === clienteId,
  );
  const serviciosBase = (opcionesServicio.data as any[] | undefined) ?? [];
  const servicios = useMemo(
    () =>
      Array.from(new Set(serviciosBase.map((r) => r.servicio).filter(Boolean))).sort((a, b) =>
        String(a).localeCompare(String(b), "es"),
      ),
    [serviciosBase],
  );

  const columns: ResponsiveColumn<(typeof rows)[number]>[] = [
    { key: "cliente", header: "Cliente", primary: true, cell: (r) => r.cliente_nombre },
    { key: "planta", header: "Planta", secondary: true, cell: (r) => r.planta_nombre },
    {
      key: "finalizado",
      header: "Fecha de finalización",
      cell: (r) => <span className="font-medium">{fmtFecha(r.fecha_finalizacion ?? r.fecha_completado)}</span>,
    },
  ];


  async function descargarPdf() {
    if (rows.length === 0) {
      toast.error("No hay trabajos finalizados con los filtros actuales.");
      return;
    }
    setDescargando(true);
    try {
      const nombreCliente =
        (clienteId && ((clientes.data as any[] | undefined) ?? []).find((c) => c.id === clienteId)?.nombre) || "Todos los clientes";
      const nombrePlanta =
        (plantaId && listaPlantas.find((p) => p.id === plantaId)?.nombre) || "Todas las plantas";
      const periodo = nombreTrimestre.charAt(0).toUpperCase() + nombreTrimestre.slice(1);
      await generarYDescargarFinalizadosPdf(
        {
          filas: rows as any,
          periodo,
          filtros: [
            { label: "Cliente", value: nombreCliente },
            { label: "Planta", value: nombrePlanta },
            { label: "Servicio", value: servicio || "Todos" },
            { label: "Período", value: periodo },
          ],
          emitido_at: new Date().toLocaleString("es-SV", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }),
          documento_clasificacion: clienteId ? "Confidencial · Cliente" : "Uso interno",
        },
        `Trabajos-finalizados_${(clienteId ? nombreCliente : "Todos").replace(/[^\p{L}\p{N}]+/gu, "-")}_T${trimestre}-${anio}.pdf`,
      );
      toast.success("PDF generado");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el PDF");
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-full">
      <PageHeader
        title="Trabajos finalizados"
        description="Consulta por cliente y planta qué día y a qué hora se finalizaron los trabajos, y descárgalo en PDF."
        actions={
          <button
            onClick={descargarPdf}
            disabled={descargando}
            className="min-h-11 md:h-9 px-4 inline-flex items-center justify-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:brightness-105 disabled:opacity-50 w-full sm:w-auto"
          >
            {descargando ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />} Descargar PDF
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 bg-card border border-border rounded-xl p-4">
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Cliente</span>
          <select
            value={clienteId}
            onChange={(e) => {
              setClienteId(e.target.value);
              setPlantaId("");
            }}
            className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-base sm:text-sm"
          >
            <option value="">Todos los clientes</option>
            {((clientes.data as any[] | undefined) ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Planta</span>
          <select
            value={plantaId}
            onChange={(e) => setPlantaId(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-base sm:text-sm"
          >
            <option value="">Todas las plantas</option>
            {listaPlantas.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Servicio</span>
          <select
            value={servicio}
            onChange={(e) => setServicio(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-base sm:text-sm"
          >
            <option value="">Todos</option>
            {servicios.map((sv) => (
              <option key={sv} value={sv}>{sv}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Trimestre</span>
          <select
            value={trimestre}
            onChange={(e) => setTrimestre(Number(e.target.value))}
            className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-base sm:text-sm"
          >
            {TRIMESTRES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Año</span>
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-base sm:text-sm"
          >
            {aniosDisponibles.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-emerald-500" />
        {finalizados.isLoading ? "Cargando…" : `${rows.length} trabajo(s) finalizado(s) en el período`}
      </div>

      <ResponsiveTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.id}
        emptyMessage="Sin trabajos finalizados con estos filtros."
      />
    </div>
  );
}
