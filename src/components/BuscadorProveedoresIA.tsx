import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inputCls } from "@/components/RecordDialog";
import { buscarProveedoresIA, listHistorialIA, eliminarHistorialIA } from "@/lib/proveedores-ia.functions";
import { Search, Sparkles, Camera, ExternalLink, Loader2, Plus, History, Trash2, RefreshCw, Truck } from "lucide-react";

export type OfertaProveedor = {
  proveedor: string;
  producto: string;
  precio: number | null;
  moneda: string;
  precio_con_impuesto?: number | null;
  precio_por_unidad?: number | null;
  unidades_por_empaque?: number;
  empaque?: string;
  tiempo_entrega?: string;
  url: string;
  disponibilidad: string;
  notas: string;
  pais?: string;
  impuesto_pct?: number;
  fecha?: string;
};

const MONEDAS = ["USD", "GTQ", "HNL", "NIO", "CRC", "MXN", "EUR", "CLP", "COP", "PEN"];

function fmt(n: number | null | undefined, moneda: string) {
  return n == null ? "—" : `${moneda} ${n.toFixed(2)}`;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function BuscadorProveedoresIA({
  onUsar,
  onClose,
}: {
  onUsar: (oferta: OfertaProveedor, termino: string) => void;
  onClose: () => void;
}) {
  const fBuscar = useServerFn(buscarProveedoresIA);
  const fHist = useServerFn(listHistorialIA);
  const fDelHist = useServerFn(eliminarHistorialIA);
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [pais, setPais] = useState("El Salvador");
  const [moneda, setMoneda] = useState("USD");
  const [impuesto, setImpuesto] = useState<number>(13);
  const [comparar, setComparar] = useState<"unidad" | "empaque">("unidad");
  const [tab, setTab] = useState<"buscar" | "historial">("buscar");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [termino, setTermino] = useState("");
  const [resultados, setResultados] = useState<OfertaProveedor[]>([]);
  const [buscado, setBuscado] = useState(false);

  const historial = useQuery({ queryKey: ["historial-ia"], queryFn: () => fHist() });

  const ordenados = useMemo(() => {
    const clave = (o: OfertaProveedor) =>
      comparar === "unidad"
        ? (o.precio_por_unidad ?? o.precio_con_impuesto ?? o.precio ?? Infinity)
        : (o.precio_con_impuesto ?? o.precio ?? Infinity);
    return [...resultados].sort((a, b) => clave(a) - clave(b));
  }, [resultados, comparar]);

  async function buscar(terminoForzado?: string) {
    const q = (terminoForzado ?? texto).trim();
    if (!q && !file) return toast.error("Escribe el producto o adjunta una foto");
    setBusy(true);
    setBuscado(false);
    setTab("buscar");
    try {
      const payload: any = { texto: q || undefined, pais, moneda, impuesto_pct: impuesto };
      if (file && !terminoForzado) {
        payload.imagen_base64 = await fileToBase64(file);
        payload.imagen_mime = file.type || "image/jpeg";
      }
      const res: any = await fBuscar({ data: payload });
      if (res?.error) toast.error(res.error);
      setTermino(res?.termino ?? "");
      setResultados(res?.resultados ?? []);
      setBuscado(true);
      qc.invalidateQueries({ queryKey: ["historial-ia"] });
      if (res?.desde_imagen && res?.termino) toast.info(`Producto detectado: ${res.termino}`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo buscar");
    } finally {
      setBusy(false);
    }
  }

  function usar(r: OfertaProveedor) {
    onUsar(
      {
        ...r,
        pais,
        impuesto_pct: impuesto,
        fecha: new Date().toISOString(),
      },
      termino,
    );
    toast.success("Agregado a la orden con su evidencia");
  }

  function reutilizar(h: any) {
    setTexto(h.termino);
    setPais(h.pais);
    setMoneda(h.moneda);
    setImpuesto(Number(h.impuesto_pct ?? 0));
    setTermino(h.termino);
    setResultados(Array.isArray(h.resultados) ? h.resultados : []);
    setBuscado(true);
    setFile(null);
    setTab("buscar");
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-start md:items-center justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))]" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-lg w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold inline-flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Buscar proveedores y precios con IA
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Busca por nombre o foto. La IA revisa la web y compara precios según tu país, moneda e impuestos.
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="text-muted-foreground hover:text-foreground text-xs">Cerrar</button>
        </div>

        <div className="px-4 pt-3 flex items-center gap-1">
          {(["buscar", "historial"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-8 px-3 text-[11px] rounded-md inline-flex items-center gap-1 ${tab === t ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-secondary/60"}`}
            >
              {t === "buscar" ? <Search className="size-3" /> : <History className="size-3" />}
              {t === "buscar" ? "Buscar" : "Historial"}
            </button>
          ))}
        </div>

        {tab === "buscar" && (
        <>
        <div className="p-4 space-y-3 border-b border-border">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
            <label className="text-[11px] md:col-span-12">
              <span className="block text-muted-foreground mb-1">Producto / descripción</span>
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void buscar(); }}
                placeholder="Ej: cepillo rotativo para limpieza de paneles solares"
                className={inputCls}
              />
            </label>
            <label className="text-[11px] md:col-span-4">
              <span className="block text-muted-foreground mb-1">País / mercado</span>
              <input value={pais} onChange={(e) => setPais(e.target.value)} className={inputCls} />
            </label>
            <label className="text-[11px] md:col-span-3">
              <span className="block text-muted-foreground mb-1">Moneda</span>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={inputCls}>
                {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="text-[11px] md:col-span-3">
              <span className="block text-muted-foreground mb-1">Impuesto % (IVA)</span>
              <input type="number" min={0} max={100} step="0.5" value={impuesto} onChange={(e) => setImpuesto(Number(e.target.value) || 0)} className={inputCls} />
            </label>
            <div className="md:col-span-2">
              <button
                onClick={() => void buscar()}
                disabled={busy}
                className="w-full min-h-11 md:h-9 md:min-h-0 px-3 inline-flex items-center justify-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} Buscar
              </button>
            </div>
          </div>

          <label className="text-[11px] block">
            <span className="text-muted-foreground mb-1 inline-flex items-center gap-1"><Camera className="size-3" /> Foto del producto (opcional)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-[11px]"
            />
            {file && <span className="block text-[10px] text-muted-foreground mt-1 truncate">{file.name}</span>}
          </label>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Comparar por:</span>
            {(["unidad", "empaque"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setComparar(m)}
                className={`h-7 px-2 rounded-md border text-[11px] ${comparar === m ? "border-primary text-primary font-medium" : "border-border text-muted-foreground"}`}
              >
                {m === "unidad" ? "Precio por unidad" : "Precio por empaque"}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 overflow-y-auto">
          {busy && <p className="text-xs text-muted-foreground">Consultando la web y comparando precios…</p>}
          {!busy && buscado && resultados.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin ofertas claras para “{termino}”. Prueba con otro término o agrega marca/modelo.</p>
          )}
          {!busy && ordenados.length > 0 && (
            <>
              <p className="text-[11px] text-muted-foreground mb-2">
                Resultados para <span className="font-medium text-foreground">{termino}</span> · {pais} · {moneda} · IVA {impuesto}% · ordenados por {comparar === "unidad" ? "precio por unidad" : "precio del empaque"}
              </p>
              <div className="space-y-2">
                {ordenados.map((r, i) => (
                  <div key={`${r.url}-${i}`} className="border border-border rounded-md p-3 flex flex-col md:flex-row md:items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{r.proveedor}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{r.producto}</div>
                      {(r.empaque || (r.unidades_por_empaque ?? 1) > 1) && (
                        <div className="text-[10px] text-muted-foreground">
                          Empaque: {r.empaque || `${r.unidades_por_empaque} un`}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {[r.disponibilidad, r.notas].filter(Boolean).join(" · ")}
                      </div>
                      {r.tiempo_entrega && (
                        <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                          <Truck className="size-3" /> Entrega: {r.tiempo_entrega}
                        </div>
                      )}
                    </div>
                    <div className="text-right md:w-36">
                      <div className="font-mono text-sm font-semibold">
                        {comparar === "unidad"
                          ? fmt(r.precio_por_unidad ?? r.precio_con_impuesto ?? r.precio, r.moneda)
                          : fmt(r.precio_con_impuesto ?? r.precio, r.moneda)}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {comparar === "unidad"
                          ? `empaque ${fmt(r.precio_con_impuesto ?? r.precio, r.moneda)}`
                          : `c/u ${fmt(r.precio_por_unidad ?? r.precio_con_impuesto ?? r.precio, r.moneda)}`}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.precio != null ? `sin imp. ${fmt(r.precio, r.moneda)}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noreferrer" className="h-8 px-2 inline-flex items-center gap-1 text-[11px] rounded-md border border-border hover:bg-secondary">
                          <ExternalLink className="size-3" /> Fuente
                        </a>
                      )}
                      <button
                        onClick={() => usar(r)}
                        className="h-8 px-2 inline-flex items-center gap-1 text-[11px] rounded-md bg-primary text-primary-foreground"
                      >
                        <Plus className="size-3" /> Usar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                Precios de referencia obtenidos de la web (impuesto estimado {impuesto}%); verifica con el proveedor antes de emitir la orden.
              </p>
            </>
          )}
        </div>
        </>
        )}

        {tab === "historial" && (
          <div className="p-4 overflow-y-auto space-y-2">
            {historial.isLoading && <p className="text-xs text-muted-foreground">Cargando historial…</p>}
            {!historial.isLoading && ((historial.data as any[]) ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Aún no hay búsquedas guardadas.</p>
            )}
            {((historial.data as any[]) ?? []).map((h: any) => (
              <div key={h.id} className="border border-border rounded-md p-3 flex flex-col md:flex-row md:items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{h.termino}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(h.created_at).toLocaleString("es-SV")} · {h.pais} · {h.moneda} · IVA {Number(h.impuesto_pct)}% ·{" "}
                    {(Array.isArray(h.resultados) ? h.resultados.length : 0)} ofertas
                    {h.desde_imagen ? " · desde foto" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => reutilizar(h)} className="h-8 px-2 inline-flex items-center gap-1 text-[11px] rounded-md border border-border hover:bg-secondary">
                    <History className="size-3" /> Reutilizar
                  </button>
                  <button
                    onClick={() => { setPais(h.pais); setMoneda(h.moneda); setImpuesto(Number(h.impuesto_pct ?? 0)); void buscar(h.termino); }}
                    disabled={busy}
                    className="h-8 px-2 inline-flex items-center gap-1 text-[11px] rounded-md bg-primary text-primary-foreground disabled:opacity-60"
                  >
                    <RefreshCw className="size-3" /> Re-checar precios
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await fDelHist({ data: { id: h.id } });
                        qc.invalidateQueries({ queryKey: ["historial-ia"] });
                      } catch (e: any) { toast.error(e?.message ?? "No se pudo eliminar"); }
                    }}
                    className="h-8 px-2 inline-flex items-center text-[11px] rounded-md border border-border text-destructive hover:bg-secondary"
                    title="Eliminar del historial"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
