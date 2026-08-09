import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import {
  listInventario,
  upsertInventarioItem,
  deleteInventarioItem,
  registrarMovimiento,
} from "@/lib/inventario.functions";
import { Plus, AlertTriangle, Pencil, Trash2, ArrowDownUp, ShoppingCart, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { ExportButton } from "@/components/ExportButton";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ResponsiveTable";
import { exportarExcel } from "@/lib/excel";


export const Route = createFileRoute("/_authenticated/inventario")({
  head: () => ({
    meta: [{ title: "Inventario · EA Service Connect" }, { name: "description", content: "Stock de bodega con movimientos en tiempo real." }],
  }),
  component: Inventario,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

type Item = {
  id: string;
  sku: string;
  nombre: string;
  categoria: "insumo" | "repuesto" | "herramienta" | "epp" | "equipo" | "electrico" | "quimico";
  ubicacion: string | null;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
};

const catLabel: Record<Item["categoria"], string> = {
  insumo: "Insumo", repuesto: "Repuesto", herramienta: "Herramienta", epp: "EPP",
  equipo: "Equipo", electrico: "Eléctrico", quimico: "Químico",
};

function Inventario() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fList = useServerFn(listInventario);
  const fUpsert = useServerFn(upsertInventarioItem);
  const fDelete = useServerFn(deleteInventarioItem);
  const fMov = useServerFn(registrarMovimiento);
  const { roles } = useAuth();
  const canEdit = ["admin", "supervisor", "tecnico"].includes(highestRole(roles) ?? "");

  const list = useQuery({ queryKey: ["inventario"], queryFn: () => fList() });
  const items = (list.data as Item[] | undefined) ?? [];
  // Bajo stock = agotado (stock_actual <= 0) o por debajo del mínimo definido
  const isLow = (i: Item) => Number(i.stock_actual) <= 0 || Number(i.stock_actual) < Number(i.stock_minimo);
  const critico = items.filter(isLow).length;

  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [movFor, setMovFor] = useState<Item | null>(null);

  const lowStockItems = items.filter(isLow);

  // --- Vista: filtros, orden, agrupación, paginación ---
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = usePersistedState<"todas" | Item["categoria"]>("inventario.catFilter", "todas");
  const [estadoFilter, setEstadoFilter] = usePersistedState<"todos" | "bajo" | "ok">("inventario.estadoFilter", "todos");
  const [sortBy, setSortBy] = usePersistedState<"nombre" | "sku" | "stock_asc" | "critico">("inventario.sortBy", "critico");
  const [agrupar, setAgrupar] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let rows = items.filter((i) => {
      if (catFilter !== "todas" && i.categoria !== catFilter) return false;
      const low = isLow(i);
      if (estadoFilter === "bajo" && !low) return false;
      if (estadoFilter === "ok" && low) return false;
      if (!ql) return true;
      return (
        (i.sku ?? "").toLowerCase().includes(ql) ||
        i.nombre.toLowerCase().includes(ql) ||
        (i.ubicacion ?? "").toLowerCase().includes(ql)
      );
    });
    rows.sort((a, b) => {
      if (sortBy === "nombre") return a.nombre.localeCompare(b.nombre);
      if (sortBy === "sku") return (a.sku ?? "").localeCompare(b.sku ?? "");
      if (sortBy === "stock_asc") return Number(a.stock_actual) - Number(b.stock_actual);
      // critico: bajo stock primero, luego nombre
      const la = isLow(a) ? 0 : 1;
      const lb = isLow(b) ? 0 : 1;
      if (la !== lb) return la - lb;
      return a.nombre.localeCompare(b.nombre);
    });
    return rows;
  }, [items, q, catFilter, estadoFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const paginated = agrupar ? filtered : filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE);

  const grupos = useMemo(() => {
    if (!agrupar) return [] as Array<{ cat: Item["categoria"]; rows: Item[] }>;
    const map = new Map<Item["categoria"], Item[]>();
    for (const r of filtered) {
      const arr = map.get(r.categoria) ?? [];
      arr.push(r);
      map.set(r.categoria, arr);
    }
    return Array.from(map.entries())
      .map(([cat, rows]) => ({ cat, rows }))
      .sort((a, b) => catLabel[a.cat].localeCompare(catLabel[b.cat]));
  }, [filtered, agrupar]);

  function irANuevaOC(prefill: boolean) {
    if (typeof window !== "undefined") {
      if (prefill && lowStockItems.length > 0) {
        const payload = lowStockItems.map((i) => ({
          item_id: i.id,
          sku: i.sku,
          nombre: i.nombre,
          categoria: i.categoria,
          unidad: i.unidad,
          stock_actual: Number(i.stock_actual),
          stock_minimo: Number(i.stock_minimo),
          sugerido: Math.max(1, Math.ceil(Number(i.stock_minimo) - Number(i.stock_actual))),
        }));
        sessionStorage.setItem("oc_prefill_lowstock", JSON.stringify(payload));
      } else {
        sessionStorage.removeItem("oc_prefill_lowstock");
      }
      sessionStorage.setItem("oc_open_new", "1");
    }
    navigate({ to: "/ordenes-compra" });
  }

  const save = useMutation({
    mutationFn: (v: any) => fUpsert({ data: v }),
    onSuccess: () => { toast.success("SKU guardado"); qc.invalidateQueries({ queryKey: ["inventario"] }); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => fDelete({ data: { id } }),
    onSuccess: () => { toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["inventario"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mov = useMutation({
    mutationFn: (v: any) => fMov({ data: v }),
    onSuccess: () => { toast.success("Movimiento registrado"); qc.invalidateQueries({ queryKey: ["inventario"] }); setMovFor(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSaveItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({
      id: editing?.id,
      sku: f.get("sku") || null,
      nombre: f.get("nombre"),
      categoria: f.get("categoria"),
      ubicacion: f.get("ubicacion") || null,
      unidad: f.get("unidad") || "un",
      stock_minimo: Number(f.get("stock_minimo") || 0),
    });
  }

  function onMov(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!movFor) return;
    const f = new FormData(e.currentTarget);
    mov.mutate({
      item_id: movFor.id,
      tipo: f.get("tipo"),
      cantidad: Number(f.get("cantidad")),
      motivo: f.get("motivo") || null,
    });
  }

  const itemColumns: ResponsiveColumn<Item>[] = [
    {
      key: "sku",
      header: "SKU",
      cell: (i) => <span className="font-mono text-xs">{i.sku}</span>,
    },
    {
      key: "nombre",
      header: "Item",
      primary: true,
      cell: (i) => <span className="font-medium">{i.nombre}</span>,
    },
    {
      key: "categoria",
      header: "Categoría",
      secondary: true,
      cell: (i) => <span className="text-xs text-muted-foreground">{catLabel[i.categoria]}</span>,
    },
    {
      key: "ubicacion",
      header: "Ubicación",
      cell: (i) => <span className="text-xs font-mono text-muted-foreground">{i.ubicacion ?? "—"}</span>,
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      cell: (i) => <span className="font-mono font-semibold">{i.stock_actual} {i.unidad}</span>,
    },
    {
      key: "minimo",
      header: "Mínimo",
      align: "right",
      cell: (i) => <span className="font-mono text-muted-foreground">{i.stock_minimo}</span>,
    },
    {
      key: "estado",
      header: "Estado",
      align: "center",
      cell: (i) =>
        isLow(i) ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-destructive/10 text-destructive">
            <AlertTriangle className="size-3" /> Pedir
          </span>
        ) : (
          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-accent/10 text-accent">OK</span>
        ),
    },
  ];

  const itemRowActions = (i: Item) => (
    <>
      <button onClick={() => setMovFor(i)} className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" aria-label="Movimiento">
        <ArrowDownUp className="size-3.5" />
      </button>
      {canEdit && <>
        <button onClick={() => setEditing(i)} className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" aria-label="Editar">
          <Pencil className="size-3.5" />
        </button>
        <button onClick={() => { if (confirm(`Eliminar ${i.sku}?`)) remove.mutate(i.id); }}
          className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive" aria-label="Eliminar">
          <Trash2 className="size-3.5" />
        </button>
      </>}
    </>
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Inventario de Bodega"
        description="Stock real con movimientos de ingreso, salida y ajuste."
        actions={
          <>
            <ExportButton onExport={async () => {
              await exportarExcel({
                filename: `inventario-${new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" })}.xlsx`,
                hojas: [{
                  nombre: "Inventario",
                  columnas: [
                    { header: "SKU", key: "sku", width: 16 },
                    { header: "Item", key: "nombre", width: 32 },
                    { header: "Categoría", key: "categoria", width: 16 },
                    { header: "Ubicación", key: "ubicacion", width: 18 },
                    { header: "Unidad", key: "unidad", width: 10 },
                    { header: "Stock actual", key: "stock_actual", width: 14, format: "#,##0" },
                    { header: "Stock mínimo", key: "stock_minimo", width: 14, format: "#,##0" },
                    { header: "Costo unitario (USD)", key: "costo_unitario", width: 18, format: "[$$-409]#,##0.00" },
                  ],
                  filas: items as any[],
                  total: ["stock_actual"],
                }],
              });
            }} />
            <button
              onClick={() => irANuevaOC(lowStockItems.length > 0)}
              className="min-h-11 md:h-9 md:min-h-0 px-4 inline-flex items-center gap-2 text-xs font-medium bg-secondary text-foreground rounded-md border border-border hover:bg-secondary/70"
              title="Ir al módulo de Órdenes de compra (pre-carga los ítems bajo mínimo)"
            >
              <ShoppingCart className="size-3.5" /> Nueva orden de compra
              {lowStockItems.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-bold">
                  {lowStockItems.length}
                </span>
              )}
            </button>
            {canEdit && (
              <button onClick={() => setEditing({ categoria: "insumo", unidad: "un" })}
                className="min-h-11 md:h-9 md:min-h-0 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
                <Plus className="size-3.5" /> Nuevo SKU
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi label="SKUs" value={items.length} />
        <Kpi label="Categorías" value={new Set(items.map(i => i.categoria)).size} />
        <Kpi label="Bajo stock" value={critico} danger />
        <Kpi label="Ubicaciones" value={new Set(items.map(i => i.ubicacion).filter(Boolean)).size} />
      </div>

      {list.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {/* Toolbar de filtros / orden / vista */}
      <div className="bg-card border border-border rounded-lg p-3 mb-3 grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-wrap md:items-center gap-2">
        <div className="relative w-full min-w-0 sm:col-span-2 md:flex-1 md:min-w-[220px]">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Buscar por SKU, item o ubicación…"
            className={inputCls + " w-full min-w-0 pl-8"}
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => { setCatFilter(e.target.value as any); setPage(0); }}
          className={inputCls + " w-full min-w-0 md:max-w-[160px]"}
          title="Categoría"
        >
          <option value="todas">Todas las categorías</option>
          {(Object.keys(catLabel) as Item["categoria"][]).map((c) => (
            <option key={c} value={c}>{catLabel[c]}</option>
          ))}
        </select>
        <select
          value={estadoFilter}
          onChange={(e) => { setEstadoFilter(e.target.value as any); setPage(0); }}
          className={inputCls + " w-full min-w-0 md:max-w-[150px]"}
          title="Estado"
        >
          <option value="todos">Todos los estados</option>
          <option value="bajo">Solo bajo stock</option>
          <option value="ok">Solo OK</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className={inputCls + " w-full min-w-0 md:max-w-[190px]"}
          title="Ordenar"
        >
          <option value="critico">Ordenar: crítico primero</option>
          <option value="nombre">Ordenar: nombre A–Z</option>
          <option value="sku">Ordenar: SKU A–Z</option>
          <option value="stock_asc">Ordenar: stock menor</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground border border-border rounded-md px-2 min-h-11 md:h-9 md:min-h-0 cursor-pointer hover:bg-secondary w-full min-w-0 sm:col-span-2 md:w-auto">
          <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} className="size-3 shrink-0" />
          <span className="truncate">Agrupar por categoría</span>
        </label>
        <span className="text-[11px] text-muted-foreground sm:col-span-2 md:ml-auto">
          Mostrando {filtered.length} de {items.length}
        </span>
      </div>

      <>
        {!agrupar && (
          <ResponsiveTable
            data={paginated}
            rowKey={(i) => i.id}
            emptyMessage={items.length === 0 ? "Aún no hay items en bodega." : "Ningún ítem coincide con los filtros."}
            columns={itemColumns}
            rowActions={itemRowActions}
          />
        )}

        {agrupar && (
          <div className="space-y-3">
            {grupos.map(({ cat, rows }) => {
              const isCollapsed = !!collapsed[cat];
              const bajos = rows.filter(isLow).length;
              return (
                <div key={cat} className="rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}
                    className="w-full min-h-11 md:min-h-0 bg-secondary/60 px-3 py-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground text-left"
                  >
                    {isCollapsed ? <ChevronRight className="size-3.5 shrink-0" /> : <ChevronDown className="size-3.5 shrink-0" />}
                    <span className="truncate">{catLabel[cat]}</span>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                      · {rows.length} ítem{rows.length === 1 ? "" : "s"}
                      {bajos > 0 && <span className="text-destructive"> · {bajos} bajo mínimo</span>}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="p-2 bg-card">
                      <ResponsiveTable
                        data={rows}
                        rowKey={(i) => i.id}
                        columns={itemColumns}
                        rowActions={itemRowActions}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                {items.length === 0 ? "Aún no hay items en bodega." : "Ningún ítem coincide con los filtros."}
              </p>
            )}
          </div>
        )}
      </>
      {!agrupar && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 text-xs">
          <span className="text-muted-foreground">
            Página {pageSafe + 1} de {totalPages}
          </span>
          <div className="inline-flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={pageSafe === 0}
              className="h-8 px-3 rounded-md border border-border hover:bg-secondary disabled:opacity-40"
            >Anterior</button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={pageSafe >= totalPages - 1}
              className="h-8 px-3 rounded-md border border-border hover:bg-secondary disabled:opacity-40"
            >Siguiente</button>
          </div>
        </div>
      )}

      <RecordDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing?.id ? "Editar SKU" : "Nuevo SKU"}
        busy={save.isPending}
        error={save.error?.message}
        onSubmit={onSaveItem}
      >
        {editing?.id ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU"><input name="sku" defaultValue={editing?.sku ?? ""} className={inputCls + " font-mono bg-secondary"} readOnly /></Field>
            <Field label="Categoría">
              <select name="categoria" defaultValue={editing?.categoria ?? "insumo"} className={inputCls}>
                <option value="equipo">Equipo</option>
                <option value="repuesto">Repuesto</option>
                <option value="electrico">Eléctrico</option>
                <option value="quimico">Químico</option>
                <option value="insumo">Insumo</option>
                <option value="herramienta">Herramienta</option>
                <option value="epp">EPP</option>
              </select>
            </Field>
          </div>
        ) : (
          <>
            <Field label="Categoría">
              <select name="categoria" defaultValue={editing?.categoria ?? "insumo"} className={inputCls}>
                <option value="equipo">Equipo</option>
                <option value="repuesto">Repuesto</option>
                <option value="electrico">Eléctrico</option>
                <option value="quimico">Químico</option>
                <option value="insumo">Insumo</option>
                <option value="herramienta">Herramienta</option>
                <option value="epp">EPP</option>
              </select>
            </Field>
            <p className="text-[10px] text-muted-foreground -mt-2">
              El SKU se generará automáticamente como <span className="font-mono">INV-CAT-NNNNN</span> según la categoría.
            </p>
          </>
        )}
        <Field label="Nombre"><input name="nombre" required defaultValue={editing?.nombre ?? ""} className={inputCls} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Ubicación"><input name="ubicacion" defaultValue={editing?.ubicacion ?? ""} className={inputCls} placeholder="B-12" /></Field>
          <Field label="Unidad"><input name="unidad" defaultValue={editing?.unidad ?? "un"} className={inputCls} /></Field>
          <Field label="Stock mínimo"><input name="stock_minimo" type="number" min="0" step="0.01" defaultValue={editing?.stock_minimo ?? 0} className={inputCls} /></Field>
        </div>
      </RecordDialog>

      <RecordDialog
        open={!!movFor}
        onOpenChange={(v) => !v && setMovFor(null)}
        title={`Movimiento · ${movFor?.sku ?? ""}`}
        description={movFor ? `Stock actual: ${movFor.stock_actual} ${movFor.unidad}` : undefined}
        submitLabel="Registrar"
        busy={mov.isPending}
        error={mov.error?.message}
        onSubmit={onMov}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select name="tipo" defaultValue="ingreso" className={inputCls}>
              <option value="ingreso">Ingreso (+)</option>
              <option value="salida">Salida (−)</option>
              <option value="ajuste">Ajuste (=)</option>
            </select>
          </Field>
          <Field label="Cantidad"><input name="cantidad" type="number" min="0.01" step="0.01" required className={inputCls} /></Field>
        </div>
        <Field label="Motivo"><input name="motivo" className={inputCls} placeholder="Compra OC-1024, consumo trabajo T-2026-..." /></Field>
      </RecordDialog>

    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={"bg-card border border-border rounded-lg p-4 " + (danger ? "ring-2 ring-destructive/20" : "")}>
      <p className={"text-[10px] font-bold uppercase tracking-wider " + (danger ? "text-destructive" : "text-muted-foreground")}>{label}</p>
      <p className={"text-2xl font-mono font-semibold mt-1 " + (danger ? "text-destructive" : "")}>{value}</p>
    </div>
  );
}