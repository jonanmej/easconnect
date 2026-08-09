import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ResponsiveColumn<T> = {
  /** Identificador estable de la columna. */
  key: string;
  /** Encabezado en la vista tabla (desktop/tablet). */
  header: ReactNode;
  /** Contenido de la celda. */
  cell: (row: T, index: number) => ReactNode;
  /** En móvil, esta columna se renderiza como título de la card. */
  primary?: boolean;
  /** En móvil, esta columna se renderiza como subtítulo de la card. */
  secondary?: boolean;
  /** Si es true, no aparece en móvil (ni como card row). */
  hideOnMobile?: boolean;
  /** Alineación de celda tabla. */
  align?: "left" | "right" | "center";
  /** Clases extra para <td>/<th>. */
  className?: string;
  /** Etiqueta explícita para la card en móvil (por defecto = header). */
  mobileLabel?: ReactNode;
};

export type ResponsiveTableProps<T> = {
  data: T[];
  columns: ResponsiveColumn<T>[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: ReactNode;
  /** Acción/es a la derecha de cada card (móvil) y celda extra al final (desktop). */
  rowActions?: (row: T) => ReactNode;
  className?: string;
  /** Clase adicional para el contenedor de cada card en móvil. */
  cardClassName?: string | ((row: T) => string | undefined);
  /** Muestra el encabezado de la tabla también en móvil (raro). */
  showHeaderOnMobile?: boolean;
  /** Sticky del <thead> en desktop. */
  stickyHeader?: boolean;
  /** Densidad de la tabla en desktop. */
  density?: "comfortable" | "compact";
};

/**
 * Tabla responsive: en `md:` renderiza una `<table>` clásica; en móvil
 * renderiza una lista de cards apiladas usando la misma definición de
 * columnas. `primary` se usa como título, `secondary` como subtítulo, y el
 * resto como pares etiqueta / valor.
 */
export function ResponsiveTable<T>({
  data,
  columns,
  rowKey,
  onRowClick,
  emptyMessage = "Sin registros para mostrar.",
  rowActions,
  className,
  cardClassName,
  showHeaderOnMobile = false,
  stickyHeader = false,
  density = "comfortable",
}: ResponsiveTableProps<T>) {
  const padY = density === "compact" ? "py-2" : "py-3";

  if (data.length === 0) {
    return (
      <div className={cn("rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground", className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* ===== Móvil: cards apiladas ===== */}
      <div className={cn("space-y-2 md:hidden", showHeaderOnMobile ? "space-y-3" : "")}>
        {data.map((row, i) => {
          const primary = columns.find((c) => c.primary);
          const secondary = columns.find((c) => c.secondary);
          const rest = columns.filter((c) => !c.primary && !c.secondary && !c.hideOnMobile);
          const cardCls = typeof cardClassName === "function" ? cardClassName(row) : cardClassName;
          const interactive = Boolean(onRowClick);
          return (
            <div
              key={rowKey(row, i)}
              data-row-key={rowKey(row, i)}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              onClick={interactive ? () => onRowClick?.(row) : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick?.(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                "rounded-lg border border-border bg-card p-3 text-sm",
                interactive && "cursor-pointer active:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                cardCls,
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {primary ? (
                    <div className="font-semibold text-foreground truncate [&_*]:truncate [&_*]:max-w-full">
                      {primary.cell(row, i)}
                    </div>
                  ) : null}
                  {secondary ? (
                    <div className="text-xs text-muted-foreground truncate mt-0.5 [&_*]:truncate [&_*]:max-w-full">
                      {secondary.cell(row, i)}
                    </div>
                  ) : null}
                </div>
                {rowActions ? (
                  <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {rowActions(row)}
                  </div>
                ) : null}
              </div>
              {rest.length > 0 ? (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  {rest.map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold pt-0.5">
                        {c.mobileLabel ?? c.header}
                      </dt>
                      <dd className="min-w-0 text-foreground">{c.cell(row, i)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* ===== Tablet / desktop: tabla ===== */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className={cn("bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground", stickyHeader && "sticky top-0 z-10")}
          >
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2 font-semibold text-left",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
              {rowActions ? <th className="px-3 py-2 w-1" aria-label="Acciones" /> : null}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const interactive = Boolean(onRowClick);
              return (
                <tr
                  key={rowKey(row, i)}
                  data-row-key={rowKey(row, i)}
                  onClick={interactive ? () => onRowClick?.(row) : undefined}
                  className={cn(
                    "border-t border-border",
                    interactive && "cursor-pointer hover:bg-secondary/40",
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-3 align-top",
                        padY,
                        c.align === "right" && "text-right",
                        c.align === "center" && "text-center",
                        c.className,
                      )}
                    >
                      {c.cell(row, i)}
                    </td>
                  ))}
                  {rowActions ? (
                    <td className={cn("px-3 text-right", padY)} onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">{rowActions(row)}</div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}