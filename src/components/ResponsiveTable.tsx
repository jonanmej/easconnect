import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/hooks/usePersistedState";

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
  /**
   * Activa buscador dentro del componente. El texto se persiste por usuario
   * con esta clave (también sobrevive a refrescos y cambios de dispositivo).
   */
  searchKey?: string;
  /** Texto por el que se busca en cada fila. Requerido si usas `searchKey`. */
  searchValue?: (row: T) => string;
  /** Placeholder del buscador. */
  searchPlaceholder?: string;
  /** Chips de filtro rápido (opcional), mostrados junto al buscador. */
  filters?: ReactNode;
  /**
   * Acciones rápidas reveladas al deslizar la card hacia la izquierda (móvil).
   * En escritorio se muestran junto a `rowActions`.
   */
  swipeActions?: (row: T) => ReactNode;
  /**
   * Paginación inteligente: cantidad de filas por lote. Se cargan más
   * automáticamente al acercarse al final de la lista. Por defecto 50.
   */
  pageSize?: number;
  /**
   * Virtualiza las tarjetas en móvil cuando hay muchas filas (por defecto
   * automático a partir de 40 filas visibles). `false` lo desactiva.
   */
  virtualize?: boolean;
  /** Etiqueta accesible de la tabla (para lectores de pantalla). */
  label?: string;
};

/** Card con acciones reveladas por swipe (solo móvil). */
function SwipeCard({
  children,
  actions,
  className,
  ...rest
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);

  if (!actions) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div
        className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3"
        onClick={(e) => e.stopPropagation()}
      >
        {actions}
      </div>
      <div
        {...rest}
        className={className}
        style={{ transform: `translateX(${-offset}px)`, transition: startX.current == null ? "transform .18s ease" : undefined }}
        onTouchStart={(e) => {
          startX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchMove={(e) => {
          if (startX.current == null) return;
          const dx = startX.current - (e.touches[0]?.clientX ?? startX.current);
          setOffset(Math.max(0, Math.min(dx, 132)));
        }}
        onTouchEnd={() => {
          startX.current = null;
          setOffset((o) => (o > 56 ? 132 : 0));
        }}
      >
        {children}
      </div>
    </div>
  );
}

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
  searchKey,
  searchValue,
  searchPlaceholder = "Buscar…",
  filters,
  swipeActions,
  pageSize = 50,
  virtualize,
  label,
}: ResponsiveTableProps<T>) {
  const padY = density === "compact" ? "py-2" : "py-3";
  const [q, setQ] = usePersistedState<string>(`tabla.${searchKey ?? "sin-clave"}.q`, "", {
    url: false,
  });
  const buscando = Boolean(searchKey && searchValue);
  const term = buscando ? q.trim().toLowerCase() : "";
  const rows = useMemo(() => {
    if (!buscando || !term) return data;
    return data.filter((r) => (searchValue?.(r) ?? "").toLowerCase().includes(term));
  }, [data, buscando, term, searchValue]);

  // ===== Paginación inteligente: se agranda el lote al llegar al final =====
  const [shown, setShown] = useState(pageSize);
  useEffect(() => {
    setShown(pageSize);
  }, [pageSize, term, data]);
  const visibles = useMemo(() => rows.slice(0, shown), [rows, shown]);
  const hayMas = visibles.length < rows.length;
  const sentinela = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinela.current;
    if (!el || !hayMas || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((s) => s + pageSize);
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hayMas, pageSize, visibles.length]);

  // ===== Virtualización de tarjetas en móvil =====
  const listaRef = useRef<HTMLDivElement | null>(null);
  const virtualizando = (virtualize ?? visibles.length > 40) && virtualize !== false;
  const virtualizer = useVirtualizer({
    count: virtualizando ? visibles.length : 0,
    getScrollElement: () => listaRef.current,
    estimateSize: () => 132,
    overscan: 8,
  });

  const toolbar =
    buscando || filters ? (
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap">
        {buscando ? (
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        ) : null}
        {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
      </div>
    ) : null;

  if (rows.length === 0) {
    return (
      <div className={className}>
        {toolbar}
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {term ? `Sin resultados para “${q}”.` : emptyMessage}
        </div>
      </div>
    );
  }

  const primaryCol = columns.find((c) => c.primary);
  const secondaryCol = columns.find((c) => c.secondary);
  const restCols = columns.filter((c) => !c.primary && !c.secondary && !c.hideOnMobile);

  const renderCard = (row: T, i: number) => {
    const cardCls = typeof cardClassName === "function" ? cardClassName(row) : cardClassName;
    const interactive = Boolean(onRowClick);
    return (
      <SwipeCard
        actions={swipeActions?.(row)}
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
          interactive &&
            "cursor-pointer active:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          cardCls,
        )}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {primaryCol ? (
              <div className="font-semibold text-foreground truncate [&_*]:truncate [&_*]:max-w-full">
                {primaryCol.cell(row, i)}
              </div>
            ) : null}
            {secondaryCol ? (
              <div className="text-xs text-muted-foreground truncate mt-0.5 [&_*]:truncate [&_*]:max-w-full">
                {secondaryCol.cell(row, i)}
              </div>
            ) : null}
          </div>
          {rowActions ? (
            <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {rowActions(row)}
            </div>
          ) : null}
        </div>
        {restCols.length > 0 ? (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {restCols.map((c) => (
              <div key={c.key} className="contents">
                <dt className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold pt-0.5">
                  {c.mobileLabel ?? c.header}
                </dt>
                <dd className="min-w-0 text-foreground">{c.cell(row, i)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </SwipeCard>
    );
  };

  const items = virtualizer.getVirtualItems();

  return (
    <div className={className}>
      {toolbar}
      <p aria-live="polite" role="status" className="sr-only">
        {`Mostrando ${visibles.length} de ${rows.length} registros.`}
      </p>
      {/* ===== Móvil: cards apiladas (virtualizadas si hay muchas) ===== */}
      <div
        ref={listaRef}
        className={cn(
          "md:hidden",
          virtualizando && "max-h-[70dvh] overflow-y-auto overscroll-contain",
        )}
      >
        {virtualizando ? (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {items.map((v) => {
              const row = visibles[v.index]!;
              return (
                <div
                  key={rowKey(row, v.index)}
                  ref={virtualizer.measureElement}
                  data-index={v.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${v.start}px)`,
                    paddingBottom: 8,
                  }}
                >
                  {renderCard(row, v.index)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {visibles.map((row, i) => (
              <div key={rowKey(row, i)}>{renderCard(row, i)}</div>
            ))}
          </div>
        )}
      </div>

      {/* ===== Tablet / desktop: tabla ===== */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          {label ? <caption className="sr-only">{label}</caption> : null}
          <thead
            className={cn(
              "bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground",
              stickyHeader && "sticky top-0 z-10",
            )}
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
              {rowActions || swipeActions ? <th className="px-3 py-2 w-1">
                <span className="sr-only">Acciones</span>
              </th> : null}
            </tr>
          </thead>
          <tbody>
            {visibles.map((row, i) => {
              const interactive = Boolean(onRowClick);
              return (
                <tr
                  key={rowKey(row, i)}
                  data-row-key={rowKey(row, i)}
                  onClick={interactive ? () => onRowClick?.(row) : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  role={interactive ? "button" : undefined}
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
                    "border-t border-border",
                    interactive &&
                      "cursor-pointer hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
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
                  {rowActions || swipeActions ? (
                    <td className={cn("px-3 text-right", padY)} onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {swipeActions?.(row)}
                        {rowActions?.(row)}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hayMas ? (
        <div ref={sentinela} className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setShown((s) => s + pageSize)}
            className="min-h-11 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {`Cargar más (${rows.length - visibles.length} restantes)`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
