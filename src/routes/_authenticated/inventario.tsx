import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import {
  listInventario,
  upsertInventarioItem,
  deleteInventarioItem,
  registrarMovimiento,
} from "@/lib/inventario.functions";
import { Plus, AlertTriangle, Pencil, Trash2, ArrowDownUp, ShoppingCart } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { ExportButton } from "@/components/ExportButton";
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
  const critico = items.filter((i) => Number(i.stock_actual) < Number(i.stock_minimo)).length;

  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [movFor, setMovFor] = useState<Item | null>(null);

  const lowStockItems = items.filter((i) => Number(i.stock_actual) < Number(i.stock_minimo));

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
              className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-secondary text-foreground rounded-md border border-border hover:bg-secondary/70"
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
                className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md">
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

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-secondary border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Item</th>
              <th className="px-4 py-3 text-left">Categoría</th>
              <th className="px-4 py-3 text-left">Ubicación</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Mínimo</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => {
              const low = Number(i.stock_actual) < Number(i.stock_minimo);
              return (
                <tr key={i.id} className="hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-4 font-mono text-xs">{i.sku}</td>
                  <td className="px-4 py-4 font-medium">{i.nombre}</td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{catLabel[i.categoria]}</td>
                  <td className="px-4 py-4 text-xs font-mono text-muted-foreground">{i.ubicacion ?? "—"}</td>
                  <td className="px-4 py-4 text-right font-mono font-semibold">{i.stock_actual} {i.unidad}</td>
                  <td className="px-4 py-4 text-right font-mono text-muted-foreground">{i.stock_minimo}</td>
                  <td className="px-4 py-4 text-center">
                    {low ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-destructive/10 text-destructive">
                        <AlertTriangle className="size-3" /> Pedir
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-accent/10 text-accent">OK</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="inline-flex gap-1">
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
                    </div>
                  </td>
                </tr>
              );
            })}
            {!list.isLoading && items.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-muted-foreground">Aún no hay items en bodega.</td></tr>
            )}
          </tbody>
        </table>
      </div>

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

      {ordenOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={() => !ordenBusy && setOrdenOpen(false)}>
          <div className="bg-card border border-border rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Generar orden de compra</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Los ítems se agrupan por proveedor en el PDF. Puedes agregar ítems del inventario o crear ítems libres (que aún no existen en bodega).
              </p>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs">
                  <span className="block text-muted-foreground mb-1">Proveedores disponibles</span>
                  <div className="flex gap-2">
                    <input
                      value={ordenProveedorInput}
                      onChange={(e) => setOrdenProveedorInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          agregarProveedor();
                        }
                      }}
                      className={inputCls}
                      placeholder="Nombre del proveedor (Enter para agregar)"
                    />
                    <button
                      type="button"
                      onClick={agregarProveedor}
                      className="px-3 py-2 text-xs rounded-md border border-border hover:bg-secondary shrink-0"
                    >
                      Agregar
                    </button>
                  </div>
                  {ordenProveedores.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {ordenProveedores.map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary border border-border text-[11px]"
                        >
                          {p}
                          <button
                            type="button"
                            onClick={() =>
                              setOrdenProveedores((prev) => prev.filter((x) => x !== p))
                            }
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Quitar ${p}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </label>
                <label className="text-xs">
                  <span className="block text-muted-foreground mb-1">Notas / referencia</span>
                  <input value={ordenNotas} onChange={(e) => setOrdenNotas(e.target.value)} className={inputCls} placeholder="Referencia interna, urgencia, etc." />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={agregarFilaLibre}
                  className="h-8 px-3 text-xs rounded-md border border-border hover:bg-secondary inline-flex items-center gap-1"
                >
                  <Plus className="size-3" /> Ítem libre (no está en bodega)
                </button>
                <select
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    const it = items.find((x) => x.id === id);
                    if (it) agregarDesdeInventario(it);
                    e.target.value = "";
                  }}
                  className={inputCls + " max-w-xs"}
                  defaultValue=""
                >
                  <option value="">+ Agregar desde inventario…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.sku} · {i.nombre}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {ordenFilas.length} ítem{ordenFilas.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="border border-border rounded-md overflow-x-auto">
                <table className="w-full text-xs min-w-[820px]">
                  <thead className="bg-secondary text-[10px] font-bold text-muted-foreground uppercase">
                    <tr>
                      <th className="px-2 py-2 text-left">SKU</th>
                      <th className="px-2 py-2 text-left">Descripción</th>
                      <th className="px-2 py-2 text-left">Unidad</th>
                      <th className="px-2 py-2 text-right">A pedir</th>
                      <th className="px-2 py-2 text-left">Proveedor</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ordenFilas.map((f) => (
                      <tr key={f.key}>
                        <td className="px-2 py-2 font-mono text-[11px] whitespace-nowrap">
                          {f.source === "inventario" ? f.sku : <span className="text-muted-foreground">— libre —</span>}
                        </td>
                        <td className="px-2 py-2">
                          {f.source === "inventario" ? (
                            <div>
                              <div className="font-medium">{f.nombre}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                stock {f.stock_actual} · mín {f.stock_minimo}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <input
                                value={f.nombre}
                                onChange={(e) => actualizarFila(f.key, { nombre: e.target.value })}
                                placeholder="Descripción del ítem"
                                className="h-8 px-2 rounded-md border border-input bg-background w-full"
                              />
                              <input
                                value={f.categoria}
                                onChange={(e) => actualizarFila(f.key, { categoria: e.target.value })}
                                placeholder="Categoría"
                                className="h-7 px-2 rounded-md border border-input bg-background w-full text-[11px]"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {f.source === "inventario" ? (
                            <span className="text-muted-foreground">{f.unidad}</span>
                          ) : (
                            <input
                              value={f.unidad}
                              onChange={(e) => actualizarFila(f.key, { unidad: e.target.value })}
                              className="h-8 w-16 px-2 rounded-md border border-input bg-background"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number" min={0} step="0.01"
                            value={f.cantidad_pedida}
                            onChange={(e) => actualizarFila(f.key, { cantidad_pedida: Number(e.target.value) })}
                            className="h-8 w-20 px-2 text-right rounded-md border border-input bg-background font-mono"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex gap-1">
                            {ordenProveedores.length > 0 ? (
                              <select
                                value={ordenProveedores.includes(f.proveedor) ? f.proveedor : ""}
                                onChange={(e) => actualizarFila(f.key, { proveedor: e.target.value })}
                                className="h-8 px-2 rounded-md border border-input bg-background text-[11px] min-w-[8rem]"
                              >
                                <option value="">— sin asignar —</option>
                                {ordenProveedores.map((p) => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                                <option value="__custom__">Otro (escribir)…</option>
                              </select>
                            ) : null}
                            {(ordenProveedores.length === 0 || f.proveedor === "__custom__" || (f.proveedor && !ordenProveedores.includes(f.proveedor))) && (
                              <input
                                value={f.proveedor === "__custom__" ? "" : f.proveedor}
                                onChange={(e) => actualizarFila(f.key, { proveedor: e.target.value })}
                                placeholder="Proveedor"
                                className="h-8 px-2 rounded-md border border-input bg-background text-[11px] min-w-[8rem]"
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => quitarFila(f.key)}
                            className="size-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive"
                            aria-label="Quitar"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {ordenFilas.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                          No hay ítems. Usa los botones de arriba para agregar desde inventario o crear un ítem libre.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setOrdenOpen(false)}
                disabled={ordenBusy}
                className="h-9 px-4 text-xs rounded-md border border-border hover:bg-secondary"
              >Cancelar</button>
              <button
                onClick={generarOrden}
                disabled={ordenBusy}
                className="h-9 px-4 text-xs font-medium bg-primary text-primary-foreground rounded-md disabled:opacity-60"
              >{ordenBusy ? "Generando…" : "Descargar PDF"}</button>
            </div>
          </div>
        </div>
      )}
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