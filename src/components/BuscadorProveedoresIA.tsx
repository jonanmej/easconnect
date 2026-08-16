import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { inputCls } from "@/components/RecordDialog";
import { buscarProveedoresIA } from "@/lib/proveedores-ia.functions";
import { Search, Sparkles, Camera, ExternalLink, Loader2, Plus } from "lucide-react";

export type OfertaProveedor = {
  proveedor: string;
  producto: string;
  precio: number | null;
  moneda: string;
  url: string;
  disponibilidad: string;
  notas: string;
};

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
  const [texto, setTexto] = useState("");
  const [pais, setPais] = useState("El Salvador");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [termino, setTermino] = useState("");
  const [resultados, setResultados] = useState<OfertaProveedor[]>([]);
  const [buscado, setBuscado] = useState(false);

  async function buscar() {
    if (!texto.trim() && !file) return toast.error("Escribe el producto o adjunta una foto");
    setBusy(true);
    setBuscado(false);
    try {
      const payload: any = { texto: texto.trim() || undefined, pais };
      if (file) {
        payload.imagen_base64 = await fileToBase64(file);
        payload.imagen_mime = file.type || "image/jpeg";
      }
      const res: any = await fBuscar({ data: payload });
      if (res?.error) toast.error(res.error);
      setTermino(res?.termino ?? "");
      setResultados(res?.resultados ?? []);
      setBuscado(true);
      if (res?.desde_imagen && res?.termino) toast.info(`Producto detectado: ${res.termino}`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo buscar");
    } finally {
      setBusy(false);
    }
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
              Busca por nombre o adjunta una foto del producto. La IA revisa la web y resume las mejores ofertas.
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="text-muted-foreground hover:text-foreground text-xs">Cerrar</button>
        </div>

        <div className="p-4 space-y-3 border-b border-border">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
            <label className="text-[11px] md:col-span-7">
              <span className="block text-muted-foreground mb-1">Producto / descripción</span>
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") buscar(); }}
                placeholder="Ej: cepillo rotativo para limpieza de paneles solares"
                className={inputCls}
              />
            </label>
            <label className="text-[11px] md:col-span-3">
              <span className="block text-muted-foreground mb-1">País / mercado</span>
              <input value={pais} onChange={(e) => setPais(e.target.value)} className={inputCls} />
            </label>
            <div className="md:col-span-2">
              <button
                onClick={buscar}
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
        </div>

        <div className="p-4 overflow-y-auto">
          {busy && <p className="text-xs text-muted-foreground">Consultando la web y comparando precios…</p>}
          {!busy && buscado && resultados.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin ofertas claras para “{termino}”. Prueba con otro término o agrega marca/modelo.</p>
          )}
          {!busy && resultados.length > 0 && (
            <>
              <p className="text-[11px] text-muted-foreground mb-2">Resultados para <span className="font-medium text-foreground">{termino}</span> · ordenados por precio</p>
              <div className="space-y-2">
                {resultados.map((r, i) => (
                  <div key={`${r.url}-${i}`} className="border border-border rounded-md p-3 flex flex-col md:flex-row md:items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{r.proveedor}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{r.producto}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {[r.disponibilidad, r.notas].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="text-right md:w-28">
                      <div className="font-mono text-sm font-semibold">
                        {r.precio != null ? `${r.moneda} ${r.precio.toFixed(2)}` : "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noreferrer" className="h-8 px-2 inline-flex items-center gap-1 text-[11px] rounded-md border border-border hover:bg-secondary">
                          <ExternalLink className="size-3" /> Fuente
                        </a>
                      )}
                      <button
                        onClick={() => { onUsar(r, termino); toast.success("Agregado a la orden"); }}
                        className="h-8 px-2 inline-flex items-center gap-1 text-[11px] rounded-md bg-primary text-primary-foreground"
                      >
                        <Plus className="size-3" /> Usar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                Precios de referencia obtenidos de la web; verifica con el proveedor antes de emitir la orden.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
