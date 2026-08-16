import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Trash2, ExternalLink, AlertTriangle, X, Loader2, CheckCircle2, RefreshCw, CloudOff } from "lucide-react";
import { Camera, Images } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listEvidencias, recordEvidencia, deleteEvidencia } from "@/lib/evidencias.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { enqueue, flushQueue, pendingCount, onQueueChange } from "@/lib/offline-queue";
import { mensajeDeError } from "@/lib/error-msg";

const BUCKET = "trabajos-evidencia";

type Categoria = "antes" | "durante" | "despues" | "anomalia" | "mediciones";
const CATEGORIAS: { value: Categoria; label: string; hint: string }[] = [
  { value: "antes", label: "Antes", hint: "Estado inicial del sitio." },
  { value: "durante", label: "Durante", hint: "Trabajo en ejecución." },
  { value: "despues", label: "Después", hint: "Resultado final." },
  { value: "anomalia", label: "Anomalías", hint: "Hallazgos y fallas." },
  { value: "mediciones", label: "Mediciones", hint: "Lecturas de TDS, ángulo de inclinación y presión de agua." },
];

type Estado = "pendiente" | "subiendo" | "ok" | "error" | "encolado";
type ItemSubida = {
  id: string;
  file: File;
  categoria: Categoria;
  estado: Estado;
  intentos: number;
  error?: string;
  preview: string;
};

const MAX_INTENTOS = 3;

function fileToDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const MAX_LADO = 2000;
const MAX_BYTES_DIRECTO = 1_200_000;

/**
 * Reduce la foto antes de subirla: las cámaras de teléfono generan archivos de
 * 4-8 MB que fallan con conexión de campo y desbordan el respaldo offline.
 */
async function comprimirImagen(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (file.size <= MAX_BYTES_DIRECTO) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size) return file;
    const nombre = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg" });
  } catch (e) {
    console.warn("[Evidencias] no se pudo comprimir, se sube original", e);
    return file;
  }
}

export function EvidenciaUploader({
  trabajoId,
  reporteDiarioId,
  readOnly = false,
}: {
  trabajoId: string;
  reporteDiarioId?: string | null;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const procesandoRef = useRef<Set<string>>(new Set());
  const [categoria, setCategoria] = useState<Categoria>("antes");
  const [cola, setCola] = useState<ItemSubida[]>([]);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const [offlineN, setOfflineN] = useState<number>(0);
  const [flushing, setFlushing] = useState(false);
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const { roles } = useAuth();
  const role = highestRole(roles);
  const canEdit = !readOnly && role && ["admin", "supervisor", "tecnico"].includes(role);

  const fetchList = useServerFn(listEvidencias);
  const fetchRecord = useServerFn(recordEvidencia);
  const fetchDelete = useServerFn(deleteEvidencia);

  const list = useQuery({
    queryKey: ["evidencias", trabajoId, reporteDiarioId ?? null],
    queryFn: () => fetchList({
      data: {
        trabajo_id: trabajoId,
        ...(reporteDiarioId !== undefined ? { reporte_diario_id: reporteDiarioId } : {}),
      },
    }),
    enabled: !!trabajoId,
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Foto eliminada");
      qc.invalidateQueries({ queryKey: ["evidencias", trabajoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Sincronizar estado de cola offline + conectividad
  useEffect(() => {
    setOfflineN(pendingCount());
    const off = onQueueChange(() => setOfflineN(pendingCount()));
    const on = () => { setOnline(true); flushPending(); };
    const offEv = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", offEv);
    return () => {
      off();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", offEv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guarda contra estados "pendiente" atascados por renders asíncronos o recargas rápidas del diálogo.
  useEffect(() => {
    cola
      .filter((item) => item.estado === "pendiente")
      .forEach((item) => procesar(item.id, item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cola]);

  async function subirItem(item: ItemSubida, cat: Categoria): Promise<void> {
    if (!trabajoId) throw new Error("trabajoId no definido");
    const archivo = await comprimirImagen(item.file);
    const rawExt = (archivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const ext = rawExt.slice(0, 5) || "jpg";
    const path = `trabajos/${trabajoId}/${crypto.randomUUID()}.${ext}`;
    const contentType = archivo.type
      || (ext === "heic" ? "image/heic" : ext === "png" ? "image/png" : "image/jpeg");
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, archivo, {
      contentType,
      upsert: false,
    });
    if (upErr) {
      console.error("[Evidencias] storage upload error", upErr);
      const detalle = await mensajeDeError(upErr);
      throw new Error(detalle || "Falló la subida a Storage");
    }
    try {
      await fetchRecord({
        data: {
          trabajo_id: trabajoId,
          storage_path: path,
          descripcion: item.file.name,
          categoria: cat,
          ...(reporteDiarioId ? { reporte_diario_id: reporteDiarioId } : {}),
        },
      });
    } catch (e) {
      // Limpieza: si no se logró asociar la fila, borrar el archivo huérfano del storage.
      console.error("[Evidencias] record insert error, removing orphan", e);
      try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* noop */ }
      throw e;
    }
  }

  async function procesar(itemId: string, itemInicial?: ItemSubida) {
    if (procesandoRef.current.has(itemId)) return;
    let item = itemInicial ?? cola.find((c) => c.id === itemId);
    if (!item) return;
    // Al reintentar manualmente se reinicia el contador; si no, el bucle no se
    // ejecutaba y el aviso salía sin detalle del error.
    if (item.intentos >= MAX_INTENTOS) item = { ...item, intentos: 0, error: undefined };
    procesandoRef.current.add(itemId);
    try {
      for (let intento = item.intentos; intento < MAX_INTENTOS; intento++) {
        setCola((prev) => prev.map((c) => c.id === itemId
          ? { ...c, estado: "subiendo", intentos: intento + 1, error: undefined }
          : c));
        try {
          await subirItem(item, item.categoria);
          setCola((prev) => prev.map((c) => c.id === itemId ? { ...c, estado: "ok" } : c));
          qc.invalidateQueries({ queryKey: ["evidencias", trabajoId] });
          // limpiar de la cola luego de 2s
          setTimeout(() => setCola((prev) => prev.filter((c) => c.id !== itemId)), 2000);
          return;
        } catch (e: any) {
          const msg = await mensajeDeError(e);
          console.error("[Evidencias] intento fallido", intento + 1, msg, e);
          item = { ...item, intentos: intento + 1, error: msg };
          await new Promise((r) => setTimeout(r, 400 * (intento + 1)));
        }
      }
      // Fallback: encolar offline
      try {
        const comprimida = await comprimirImagen(item.file);
        const dataUrl = await fileToDataURL(comprimida);
        enqueue({
          trabajo_id: trabajoId,
          reporte_diario_id: reporteDiarioId ?? null,
          categoria: item.categoria,
          descripcion: item.file.name,
          data_url: dataUrl,
        });
        setCola((prev) => prev.map((c) => c.id === itemId ? { ...c, estado: "encolado" } : c));
        toast.warning(`No se pudo subir "${item.file.name}". Guardada offline para reintento. (${item.error ?? "Error"})`);
        setTimeout(() => setCola((prev) => prev.filter((c) => c.id !== itemId)), 2500);
      } catch (e2) {
        const detalleCola = await mensajeDeError(e2);
        console.error("[Evidencias] fallo al guardar offline", e2);
        setCola((prev) => prev.map((c) => c.id === itemId ? { ...c, estado: "error" } : c));
        toast.error(
          `Error al subir "${item.file.name}": ${item.error ?? detalleCola ?? "sin detalle"}` +
            (item.error ? ` · respaldo offline falló: ${detalleCola}` : ""),
        );
      }
    } finally {
      procesandoRef.current.delete(itemId);
    }
  }

  async function flushPending() {
    if (flushing || pendingCount() === 0) return;
    setFlushing(true);
    try {
      const r = await flushQueue();
      if (r.subidas) {
        toast.success(`Se sincronizaron ${r.subidas} foto(s) pendientes.`);
        qc.invalidateQueries({ queryKey: ["evidencias", trabajoId] });
      }
    } finally {
      setFlushing(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const nuevos: ItemSubida[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      categoria,
      estado: "pendiente",
      intentos: 0,
      preview: URL.createObjectURL(file),
    }));
    setCola((prev) => [...prev, ...nuevos]);
    if (inputRef.current) inputRef.current.value = "";
    // Procesar en paralelo. Pasamos el item explícitamente porque setState es asíncrono.
    for (const n of nuevos) procesar(n.id, n);
  }

  const all = (list.data as any[] | undefined) ?? [];
  const filtered = all.filter((e) => (e.categoria ?? "durante") === categoria);
  const counts: Record<Categoria, number> = { antes: 0, durante: 0, despues: 0, anomalia: 0, mediciones: 0 };
  all.forEach((e) => { const c = (e.categoria ?? "durante") as Categoria; counts[c] = (counts[c] ?? 0) + 1; });
  const enCola = cola.filter((c) => c.categoria === categoria);
  const subiendoN = cola.filter((c) => c.estado === "subiendo" || c.estado === "pendiente").length;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-border overflow-x-auto -mx-1 px-1 scrollbar-thin">
        {CATEGORIAS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategoria(c.value)}
            className={
              "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 whitespace-nowrap " +
              (categoria === c.value
                ? (c.value === "anomalia" ? "border-destructive text-destructive" : "border-primary text-primary")
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {c.value === "anomalia" && <AlertTriangle className="size-3" />}
            {c.label}
            <span className="text-[10px] font-mono text-muted-foreground">({counts[c.value] ?? 0})</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">{CATEGORIAS.find((c) => c.value === categoria)?.hint}</p>
        <div className="flex items-center gap-2">
          {!online && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
              <CloudOff className="size-3" /> Sin conexión
            </span>
          )}
          {offlineN > 0 && (
            <button
              type="button"
              onClick={flushPending}
              disabled={flushing || !online}
              className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              <RefreshCw className={"size-3 " + (flushing ? "animate-spin" : "")} />
              {offlineN} pendiente(s) · sincronizar
            </button>
          )}
        </div>
      </div>

      {canEdit && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onPick}
            className="hidden"
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPick}
            className="hidden"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="border border-dashed border-border rounded-lg p-3 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center justify-center gap-2"
            >
              <Camera className="size-4" />
              {subiendoN > 0 ? `Subiendo ${subiendoN}…` : "Tomar foto"}
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="border border-dashed border-border rounded-lg p-3 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center justify-center gap-2"
            >
              <Images className="size-4" />
              Desde galería
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-1">
            Categoría: {CATEGORIAS.find((c) => c.value === categoria)?.label}
          </p>
        </div>
      )}

      {/* Cola de subidas en curso para la categoría visible */}
      {enCola.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {enCola.map((it) => (
            <div key={it.id} className="relative aspect-square rounded-md overflow-hidden border border-border bg-secondary">
              <img src={it.preview} alt="preview" className="w-full h-full object-cover opacity-80" />
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-[10px] gap-1">
                {it.estado === "subiendo" && <><Loader2 className="size-4 animate-spin" /><span>Subiendo… ({it.intentos}/{MAX_INTENTOS})</span></>}
                {it.estado === "pendiente" && <><Loader2 className="size-4 animate-spin" /><span>En cola</span></>}
                {it.estado === "ok" && <><CheckCircle2 className="size-4 text-emerald-300" /><span>Subida</span></>}
                {it.estado === "encolado" && <><CloudOff className="size-4 text-amber-300" /><span>Offline</span></>}
                {it.estado === "error" && (
                  <>
                    <AlertTriangle className="size-4 text-destructive-foreground" />
                    <span className="px-1 text-center line-clamp-2">{it.error ?? "Error"}</span>
                    <button
                      type="button"
                      onClick={() => procesar(it.id)}
                      className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30"
                    >
                      <RefreshCw className="size-3" /> Reintentar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {list.isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando evidencias…</p>
      ) : !filtered.length ? (
        <p className="text-xs text-muted-foreground">Sin fotos en esta categoría todavía.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {filtered.map((ev: any) => (
            <button
              type="button"
              key={ev.id}
              onClick={() => ev.url && setLightbox({ url: ev.url, alt: ev.descripcion ?? "evidencia" })}
              className="group relative aspect-square rounded-md overflow-hidden border border-border bg-secondary text-left"
            >
              {ev.url ? (
                <img
                  src={ev.url}
                  alt={ev.descripcion ?? "evidencia"}
                  className="w-full h-full object-cover active:scale-95 transition-transform"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full grid place-items-center text-[10px] text-muted-foreground">
                  Sin URL
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate opacity-0 group-hover:opacity-100">
                {ev.descripcion ?? ""}
              </div>
              {ev.url && (
                <span
                  className="absolute top-1 left-1 size-6 grid place-items-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"
                  aria-label="Abrir"
                >
                  <ExternalLink className="size-3" />
                </span>
              )}
              {canEdit && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); if (confirm("¿Eliminar esta foto?")) remove.mutate(ev.id); }}
                  className="absolute top-1 right-1 size-6 grid place-items-center rounded bg-black/60 text-white opacity-100 cursor-pointer"
                  aria-label="Eliminar"
                >
                  <Trash2 className="size-3" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 grid place-items-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 size-11 grid place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 z-10"
            style={{ top: "max(env(safe-area-inset-top), 1rem)" }}
            onClick={() => setLightbox(null)}
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
          <img src={lightbox.url} alt={lightbox.alt} className="max-h-[78vh] max-w-[95vw] object-contain rounded" />
        </div>
      )}
    </div>
  );
}