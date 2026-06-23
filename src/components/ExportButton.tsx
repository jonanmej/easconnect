import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ExportButton({ onExport, label = "Exportar Excel" }: {
  onExport: () => Promise<void> | void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true);
        try { await onExport(); toast.success("Archivo generado"); }
        catch (e: any) { toast.error(e?.message ?? "No se pudo exportar"); }
        finally { setBusy(false); }
      }}
      disabled={busy}
      className="h-9 px-3 inline-flex items-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />} {label}
    </button>
  );
}