import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listEvidencias, recordEvidencia, deleteEvidencia } from "@/lib/evidencias.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";

const BUCKET = "trabajos-evidencia";

export function EvidenciaUploader({ trabajoId }: { trabajoId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
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
        await fetchRecord({ data: { trabajo_id: trabajoId, storage_path: path, descripcion: file.name } });
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

  return (
    <div className="space-y-3">
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
            {uploading ? "Subiendo…" : "Arrastra o haz click para subir fotos"}
          </button>
        </div>
      )}

      {list.isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando evidencias…</p>
      ) : !list.data?.length ? (
        <p className="text-xs text-muted-foreground">Sin evidencias registradas todavía.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {list.data.map((ev: any) => (
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