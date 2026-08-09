import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import type { FormEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  submitLabel?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  className?: string;
};

export function RecordDialog({
  open, onOpenChange, title, description,
  submitLabel = "Guardar", busy, error, onSubmit, children, className,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Móvil: hoja inferior a ancho completo (sensación nativa).
          "w-screen max-w-none top-auto bottom-0 left-0 translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl",
          "max-h-[92dvh] overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]",
          // sm+: diálogo centrado clásico.
          "sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6 sm:pb-6",
          className,
        )}
      >
        <DialogHeader className="text-left">
          <div aria-hidden className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-border sm:hidden" />
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 min-w-0">
          <div className="space-y-3">{children}</div>
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 whitespace-pre-line">
              {error}
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto min-h-10 px-4 py-2 text-sm rounded-md border border-border hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="w-full sm:w-auto min-h-10 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Guardando…" : submitLabel}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({
  label, children, hint, error, required,
}: { label: string; children: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium mb-1 flex items-center gap-1">
        <span className="truncate">{label}</span>
        {required ? <span aria-hidden className="text-destructive">*</span> : null}
      </span>
      {children}
      {hint && !error ? <span className="mt-1 block helper-text">{hint}</span> : null}
      {error ? <span className="mt-1 block text-[11px] leading-tight text-destructive">{error}</span> : null}
    </label>
  );
}

export const inputCls =
  "w-full min-w-0 min-h-10 bg-secondary border border-border rounded-md px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-60";