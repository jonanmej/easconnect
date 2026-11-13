import { useState } from "react";
import { ChevronDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ExportMenuItem = { label: string; onExport: () => Promise<void> | void };

/** Agrupa varias exportaciones en un solo botón «Exportar»; mismo aviso que ExportButton. */
export function ExportMenu({ items, label = "Exportar" }: { items: ExportMenuItem[]; label?: string }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: ExportMenuItem["onExport"]) => {
    setBusy(true);
    try { await fn(); toast.success("Archivo generado"); }
    catch (e: any) { toast.error(e?.message ?? "No se pudo exportar"); }
    finally { setBusy(false); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className="h-9 min-h-11 sm:min-h-9 px-3 inline-flex items-center justify-center gap-2 text-xs font-medium border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
          {label}
          <ChevronDown className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.map((it) => (
          <DropdownMenuItem key={it.label} onSelect={() => void run(it.onExport)}>
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
