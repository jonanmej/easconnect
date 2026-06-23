import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Trash2, ExternalLink, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listEvidencias, recordEvidencia, deleteEvidencia } from "@/lib/evidencias.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";

const BUCKET = "trabajos-evidencia";

type Categoria = "antes" | "durante" | "despues" | "anomalia";
const CATEGORIAS: { value: Categoria; label: string; hint: string }[] = [
  { value: "antes", label: "Antes", hint: "Estado inicial del sitio." },
  { value: "durante", label: "Durante", hint: "Trabajo en ejecución." },
  { value: "despues", label: "Después", hint: "Resultado final." },
  { value: "anomalia", label: "Anomalías", hint: "Hallazgos y fallas." },
];

export function EvidenciaUploader({ trabajoId }: { trabajoId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [categoria, setCategoria] = useState<Categoria>("antes");
  const { roles } = useAuth();
  const role = highestRole(roles);
  const canEdit = role && ["admin", "supervisor", "tecnico"].includes(role);

  const fetchList = useServerFn(listEvidencias);
  const fetchRecord = useServerFn(recordEvidencia);
  const fetchDelete = useServerFn(deleteEvidencia);

  const list = useQuery({
    queryKey: ["evidencias", trabajoId],
    queryFn: () => fetchList({ data: { trabajo_id: trabajoId } }),
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

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `trabajos/${trabajoId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (upErr) throw upErr;
        await fetchRecord({ data: { trabajo_id: trabajoId, storage_path: path, descripcion: file.name, categoria } });
      }
      toast.success(`${files.length} foto(s) subida(s)`);
      qc.invalidateQueries({ queryKey: ["evidencias", trabajoId] });
    } catch (err: any) {
      toast.error(err.message ?? "Error al subir");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const all = (list.data as any[] | undefined) ?? [];
  const filtered = all.filter((e) => (e.categoria ?? "durante") === categoria);
  const counts: Record<Categoria, number> = { antes: 0, durante: 0, despues: 0, anomalia: 0 };
  all.forEach((e) => { const c = (e.categoria ?? "durante") as Categoria; counts[c] = (counts[c] ?? 0) + 1; });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {CATEGORIAS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategoria(c.value)}
            className={
              "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 " +
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
      <p className="text-[10px] text-muted-foreground">{CATEGORIAS.find((c) => c.value === categoria)?.hint}</p>

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
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full border border-dashed border-border rounded-lg p-4 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <ImagePlus className="size-4" />
            {uploading ? "Subiendo…" : `Subir fotos a "${CATEGORIAS.find((c) => c.value === categoria)?.label}"`}
          </button>
        </div>
      )}

      {list.isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando evidencias…</p>
      ) : !filtered.length ? (
        <p className="text-xs text-muted-foreground">Sin fotos en esta categoría todavía.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {filtered.map((ev: any) => (
            <div key={ev.id} className="group relative aspect-square rounded-md overflow-hidden border border-border bg-secondary">
              {ev.url ? (
                <img
                  src={ev.url}
                  alt={ev.descripcion ?? "evidencia"}
                  className="w-full h-full object-cover"
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
                <a
                  href={ev.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-1 left-1 size-6 grid place-items-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"
                  aria-label="Abrir"
                >
                  <ExternalLink className="size-3" />
                </a>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => { if (confirm("¿Eliminar esta foto?")) remove.mutate(ev.id); }}
                  className="absolute top-1 right-1 size-6 grid place-items-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"
                  aria-label="Eliminar"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}