import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import {
  listOrdenesCompra,
  getOrdenCompra,
  cambiarEstadoOC,
  registrarRecepcionOC,
  eliminarOrdenCompra,
  firmarUrlCotizacion,
  editarRecepcionItemOC,
  listVariacionesOC,
} from "@/lib/ordenes-compra.functions";
import { listInventario, upsertInventarioItem } from "@/lib/inventario.functions";
import { generarYDescargarOrdenCompraPdf } from "@/lib/pdf/descargar";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { FileText, Send, PackageCheck, XCircle, Trash2, Download, ExternalLink, Pencil, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ordenes-compra")({
  head: () => ({
    meta: [
      { title: "Órdenes de compra · EA Service Connect" },
      { name: "description", content: "Ciclo de compra: borrador, envío, recepción parcial o total, y trazabilidad de proveedores." },
    ],
  }),
  component: OrdenesCompraPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm">No encontrado</div>,
});

type EstadoOC = "borrador" | "enviada" | "parcial" | "recibida" | "cancelada";

const ESTADO_COLOR: Record<EstadoOC, string> = {
  borrador: "bg-secondary text-muted-foreground border-border",
  enviada: "bg-primary/10 text-primary border-primary/30",
  parcial: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400",
  recibida: "bg-accent/10 text-accent border-accent/30",
  cancelada: "bg-destructive/10 text-destructive border-destructive/30",
};

function OrdenesCompraPage() {
  const qc = useQueryClient();
  const fList = useServerFn(listOrdenesCompra);
  const { roles } = useAuth();
  const rol = highestRole(roles) ?? "";
  const canManage = ["admin", "supervisor"].includes(rol);
  const canReceive = ["admin", "supervisor", "tecnico"].includes(rol);

  const [filtro, setFiltro] = useState<"todas" | EstadoOC>("todas");
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["ordenes-compra"], queryFn: () => fList() });
  const rows = (list.data ?? []) as any[];
  const filtradas = filtro === "todas" ? rows : rows.filter((r) => r.estado === filtro);

  const kpi = useMemo(() => {
    const c: Record<string, number> = { borrador: 0, enviada: 0, parcial: 0, recibida: 0, cancelada: 0 };
    rows.forEach((r: any) => (c[r.estado] = (c[r.estado] ?? 0) + 1));
    return c;
  }, [rows]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Órdenes de compra"
        description="Ciclo completo: borrador, envío, recepciones parciales y total, con costo promedio ponderado."
        actions={
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)} className={inputCls}>
            <option value="todas">Todos los estados</option>
            <option value="borrador">Borrador</option>
            <option value="enviada">Enviada</option>
            <option value="parcial">Parcial</option>
            <option value="recibida">Recibida</option>
            <option value="cancelada">Cancelada</option>
          </select>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {(["borrador", "enviada", "parcial", "recibida", "cancelada"] as EstadoOC[]).map((e) => (
          <button
            key={e}
            onClick={() => setFiltro(e)}
            className={`text-left p-3 rounded-lg border ${ESTADO_COLOR[e]} hover:opacity-90 transition`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider">{e}</p>
            <p className="text-xl font-mono font-semibold mt-1">{kpi[e] ?? 0}</p>
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-secondary border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Folio</th>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Solicitante</th>
              <th className="px-4 py-3 text-left">Proveedores</th>
              <th className="px-4 py-3 text-right">Líneas</th>
              <th className="px-4 py-3 text-right">Recibido / Pedido</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtradas.map((r: any) => {
              const provs = Array.isArray(r.proveedores) ? r.proveedores.map((p: any) => p?.nombre).filter(Boolean) : [];
              return (
                <tr key={r.id} className="hover:bg-secondary/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{r.folio}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.fecha_emision}</td>
                  <td className="px-4 py-3 text-xs">{r.solicitante || "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {provs.length === 0 ? <span className="text-muted-foreground">Sin definir</span> : provs.join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{r.total_lineas}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {Number(r.total_recibido).toFixed(2)} / {Number(r.total_pedido).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${ESTADO_COLOR[r.estado as EstadoOC]}`}>
                      {r.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setOpenId(r.id)}
                      className="h-8 px-3 text-xs rounded-md border border-border hover:bg-secondary"
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              );
            })}
            {!list.isLoading && filtradas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  {rows.length === 0 ? (
                    <>
                      Aún no hay órdenes.{" "}
                      <Link to="/inventario" className="text-primary underline">
                        Crea una desde Inventario.
                      </Link>
                    </>
                  ) : (
                    "Ninguna orden coincide con el filtro."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openId && (
        <OrdenDetalleDialog
          id={openId}
          onClose={() => setOpenId(null)}
          canManage={canManage}
          canReceive={canReceive}
          onChanged={() => qc.invalidateQueries({ queryKey: ["ordenes-compra"] })}
        />
      )}
    </div>
  );
}

/* ============================ DETALLE ============================ */

function OrdenDetalleDialog({
  id,
  onClose,
  canManage,
  canReceive,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  canManage: boolean;
  canReceive: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const fGet = useServerFn(getOrdenCompra);
  const fEstado = useServerFn(cambiarEstadoOC);
  const fDelete = useServerFn(eliminarOrdenCompra);
  const fInv = useServerFn(listInventario);
  const fVars = useServerFn(listVariacionesOC);
  const [tab, setTab] = useState<"detalle" | "recepcion" | "variaciones" | "historial">("detalle");

  const det = useQuery({ queryKey: ["orden-compra", id], queryFn: () => fGet({ data: { id } }) });
  const inv = useQuery({ queryKey: ["inventario"], queryFn: () => fInv() });
  const invItems = (inv.data ?? []) as any[];
  const vars = useQuery({
    queryKey: ["orden-compra-variaciones", id],
    queryFn: () => fVars({ data: { id } }),
    enabled: tab === "variaciones",
  });

  const chgEstado = useMutation({
    mutationFn: (v: { nuevo: EstadoOC; notas?: string }) =>
      fEstado({ data: { id, nuevo_estado: v.nuevo, notas: v.notas ?? null } }),
    onSuccess: () => {
      toast.success("Estado actualizado");
      qc.invalidateQueries({ queryKey: ["orden-compra", id] });
      qc.invalidateQueries({ queryKey: ["ordenes-compra"] });
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => fDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Orden eliminada");
      onChanged();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (det.isLoading || !det.data) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-sm">Cargando…</div>
      </div>
    );
  }
  const { orden, items, recepciones, estados_log } = det.data as any;
  const estado = orden.estado as EstadoOC;

  async function descargarPdf() {
    const proveedores = Array.isArray(orden.proveedores) ? orden.proveedores : [];
    await generarYDescargarOrdenCompraPdf(
      {
        folio: orden.folio,
        fecha: orden.fecha_emision,
        solicitante: orden.solicitante || "Bodega",
        proveedor: proveedores.map((p: any) => p.nombre).filter(Boolean),
        proveedores_detalle: proveedores,
        estado: orden.estado,
        notas: orden.notas,
        items: items.map((it: any) => ({
          sku: it.inventario_items?.sku || it.sku_texto || "—",
          nombre: it.nombre,
          categoria: it.categoria || "—",
          unidad: it.unidad,
          stock_actual: Number(it.inventario_items?.stock_actual ?? 0),
          stock_minimo: 0,
          cantidad_pedida: Number(it.cantidad_pedida),
          proveedor: it.proveedor,
        })),
      },
      `OrdenCompra-${orden.folio}-${orden.fecha_emision}.pdf`,
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold font-mono">{orden.folio}</h3>
            <p className="text-xs text-muted-foreground">
              {orden.fecha_emision} · Solicitante: {orden.solicitante || "—"}
            </p>
          </div>
          <span className={`ml-auto inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${ESTADO_COLOR[estado]}`}>
            {estado}
          </span>
          <div className="flex flex-wrap items-center gap-1 basis-full md:basis-auto md:ml-2">
            <button onClick={descargarPdf} className="h-8 px-3 text-xs rounded-md border border-border hover:bg-secondary inline-flex items-center gap-1">
              <Download className="size-3" /> PDF
            </button>
            {canManage && estado === "borrador" && (
              <button
                onClick={() => chgEstado.mutate({ nuevo: "enviada" })}
                className="h-8 px-3 text-xs rounded-md bg-primary text-primary-foreground inline-flex items-center gap-1"
              >
                <Send className="size-3" /> Enviar
              </button>
            )}
            {canReceive && (estado === "enviada" || estado === "parcial") && (
              <button
                onClick={() => setTab("recepcion")}
                className="h-8 px-3 text-xs rounded-md bg-accent text-accent-foreground inline-flex items-center gap-1"
              >
                <PackageCheck className="size-3" /> Registrar recepción
              </button>
            )}
            {canManage && estado !== "recibida" && estado !== "cancelada" && (
              <button
                onClick={() => {
                  const notas = prompt("Motivo de cancelación (opcional)") ?? "";
                  chgEstado.mutate({ nuevo: "cancelada", notas });
                }}
                className="h-8 px-3 text-xs rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
              >
                <XCircle className="size-3" /> Cancelar
              </button>
            )}
            {canManage && estado === "borrador" && (
              <button
                onClick={() => {
                  if (confirm("Eliminar esta orden en borrador?")) remove.mutate();
                }}
                className="h-8 px-2 text-xs rounded-md hover:bg-destructive/10 text-destructive"
                title="Eliminar"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="px-5 pt-3 border-b border-border flex gap-1 text-xs">
          {(["detalle", "recepcion", "variaciones", "historial"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-2 border-b-2 -mb-px capitalize ${
                tab === k ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {k === "recepcion" ? "Recepciones" : k}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {tab === "detalle" && (
            <>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Proveedores y cotizaciones
                </p>
                <div className="border border-border rounded-md overflow-x-auto">
                  <table className="w-full text-xs min-w-[600px]">
                    <thead className="bg-secondary text-[10px] font-bold text-muted-foreground uppercase">
                      <tr>
                        <th className="px-2 py-2 text-left">Proveedor</th>
                        <th className="px-2 py-2 text-left">Cotización #</th>
                        <th className="px-2 py-2 text-left">Fecha</th>
                        <th className="px-2 py-2 text-right">Monto</th>
                        <th className="px-2 py-2 text-left">Adjunto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(orden.proveedores ?? []).map((p: any, i: number) => (
                        <tr key={i}>
                          <td className="px-2 py-2 font-medium">{p.nombre}</td>
                          <td className="px-2 py-2">{p.cotizacion_folio || "—"}</td>
                          <td className="px-2 py-2">{p.cotizacion_fecha || "—"}</td>
                          <td className="px-2 py-2 text-right font-mono">
                            {p.cotizacion_monto != null ? `$ ${Number(p.cotizacion_monto).toFixed(2)}` : "—"}
                          </td>
                          <td className="px-2 py-2">
                            {p.cotizacion_url ? (
                              <a href={p.cotizacion_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                                <ExternalLink className="size-3" /> Ver
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {(!orden.proveedores || orden.proveedores.length === 0) && (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">
                            Sin proveedores.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Líneas
                </p>
                <div className="border border-border rounded-md overflow-x-auto">
                  <table className="w-full text-xs min-w-[700px]">
                    <thead className="bg-secondary text-[10px] font-bold text-muted-foreground uppercase">
                      <tr>
                        <th className="px-2 py-2 text-left">SKU</th>
                        <th className="px-2 py-2 text-left">Descripción</th>
                        <th className="px-2 py-2 text-left">Proveedor</th>
                        <th className="px-2 py-2 text-right">Pedida</th>
                        <th className="px-2 py-2 text-right">Recibida</th>
                        <th className="px-2 py-2 text-right">Pendiente</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map((it: any) => {
                        const pend = Number(it.cantidad_pedida) - Number(it.cantidad_recibida);
                        return (
                          <tr key={it.id}>
                            <td className="px-2 py-2 font-mono">
                              {it.inventario_items?.sku || <span className="text-muted-foreground">libre</span>}
                            </td>
                            <td className="px-2 py-2">
                              <div className="font-medium">{it.nombre}</div>
                              <div className="text-[10px] text-muted-foreground">{it.categoria || ""} · {it.unidad}</div>
                            </td>
                            <td className="px-2 py-2 text-muted-foreground">{it.proveedor || "—"}</td>
                            <td className="px-2 py-2 text-right font-mono">{Number(it.cantidad_pedida).toFixed(2)}</td>
                            <td className="px-2 py-2 text-right font-mono text-accent">{Number(it.cantidad_recibida).toFixed(2)}</td>
                            <td className={"px-2 py-2 text-right font-mono " + (pend > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground")}>
                              {pend.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {estados_log.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Historial de estados
                  </p>
                  <div className="border border-border rounded-md">
                    {estados_log.map((l: any) => (
                      <div key={l.id} className="px-3 py-2 border-b last:border-b-0 border-border text-xs flex flex-wrap gap-2">
                        <span className="font-mono text-muted-foreground">{new Date(l.changed_at).toLocaleString("es-SV")}</span>
                        <span className="text-muted-foreground">
                          {l.estado_anterior ?? "—"} → <span className="font-semibold text-foreground">{l.estado_nuevo}</span>
                        </span>
                        {l.notas && <span className="text-muted-foreground italic">· {l.notas}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "recepcion" && (
            <RecepcionForm
              ordenId={id}
              orden={orden}
              items={items}
              invItems={invItems}
              recepciones={recepciones}
              canReceive={canReceive && (estado === "enviada" || estado === "parcial")}
              canEdit={canManage}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["orden-compra", id] });
                qc.invalidateQueries({ queryKey: ["ordenes-compra"] });
                qc.invalidateQueries({ queryKey: ["inventario"] });
                qc.invalidateQueries({ queryKey: ["orden-compra-variaciones", id] });
                onChanged();
              }}
            />
          )}

          {tab === "variaciones" && (
            <VariacionesList rows={(vars.data as any[]) ?? []} loading={vars.isLoading} />
          )}

          {tab === "historial" && (
            <HistorialGlobal items={items} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================ RECEPCIÓN ============================ */

function RecepcionForm({
  ordenId,
  items,
  invItems,
  recepciones,
  canReceive,
  onDone,
}: {
  ordenId: string;
  items: any[];
  invItems: any[];
  recepciones: any[];
  canReceive: boolean;
  onDone: () => void;
}) {
  const fReg = useServerFn(registrarRecepcionOC);
  const fUpsertInv = useServerFn(upsertInventarioItem);
  const [lineas, setLineas] = useState<Record<string, { cantidad: number; costo: number; item_id_override?: string | null }>>({});
  const [notas, setNotas] = useState("");
  const [nombreRecibe, setNombreRecibe] = useState("");
  const [busy, setBusy] = useState(false);

  const registrar = useMutation({
    mutationFn: (payload: any) => fReg({ data: payload }),
    onSuccess: () => {
      toast.success("Recepción registrada");
      setLineas({});
      setNotas("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function resolverItemLibre(oi: any) {
    const opt = window.confirm(
      `El ítem "${oi.nombre}" no está en bodega.\n\nAceptar = crear un SKU nuevo con esta descripción.\nCancelar = mapear a un SKU existente.`,
    );
    if (opt) {
      // Crear SKU nuevo
      const cat = prompt("Categoría (insumo/repuesto/herramienta/epp/equipo/electrico/quimico)", "insumo") || "insumo";
      const nuevo = await fUpsertInv({
        data: {
          nombre: oi.nombre,
          categoria: cat as any,
          unidad: oi.unidad || "un",
          stock_minimo: 0,
        },
      });
      setLineas((p) => ({ ...p, [oi.id]: { ...(p[oi.id] ?? { cantidad: 0, costo: 0 }), item_id_override: (nuevo as any).id } }));
      toast.success(`SKU ${(nuevo as any).sku} creado`);
    } else {
      const sku = prompt("Ingresa el SKU existente al que mapear este ítem:");
      if (!sku) return;
      const found = invItems.find((x: any) => x.sku.toLowerCase() === sku.toLowerCase());
      if (!found) {
        toast.error("SKU no encontrado");
        return;
      }
      setLineas((p) => ({ ...p, [oi.id]: { ...(p[oi.id] ?? { cantidad: 0, costo: 0 }), item_id_override: found.id } }));
      toast.success(`Mapeado a ${found.sku}`);
    }
  }

  async function enviar() {
    const payload = Object.entries(lineas)
      .filter(([, v]) => v.cantidad > 0)
      .map(([oi_id, v]) => ({ orden_item_id: oi_id, cantidad: v.cantidad, costo_unitario: v.costo || 0, item_id_override: v.item_id_override ?? null }));
    if (payload.length === 0) {
      toast.error("Ingresa cantidades a recibir");
      return;
    }
    setBusy(true);
    try {
      await registrar.mutateAsync({ orden_id: ordenId, lineas: payload, notas: notas || null, recibido_por_nombre: nombreRecibe || null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canReceive ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Recibido por (nombre)">
              <input value={nombreRecibe} onChange={(e) => setNombreRecibe(e.target.value)} className={inputCls} placeholder="Nombre del receptor" />
            </Field>
            <Field label="Notas de recepción">
              <input value={notas} onChange={(e) => setNotas(e.target.value)} className={inputCls} placeholder="Referencia, factura…" />
            </Field>
          </div>
          <div className="border border-border rounded-md overflow-x-auto">
            <table className="w-full text-xs min-w-[800px]">
              <thead className="bg-secondary text-[10px] font-bold text-muted-foreground uppercase">
                <tr>
                  <th className="px-2 py-2 text-left">SKU</th>
                  <th className="px-2 py-2 text-left">Descripción</th>
                  <th className="px-2 py-2 text-right">Pendiente</th>
                  <th className="px-2 py-2 text-right">Recibir</th>
                  <th className="px-2 py-2 text-right">Costo unit. (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((it: any) => {
                  const pendiente = Number(it.cantidad_pedida) - Number(it.cantidad_recibida);
                  const libre = !it.item_id;
                  const override = lineas[it.id]?.item_id_override;
                  const skuMostrado = override
                    ? invItems.find((x: any) => x.id === override)?.sku ?? "resuelto"
                    : it.inventario_items?.sku;
                  return (
                    <tr key={it.id} className={pendiente <= 0 ? "opacity-50" : ""}>
                      <td className="px-2 py-2 font-mono">
                        {skuMostrado ? (
                          skuMostrado
                        ) : (
                          <button onClick={() => resolverItemLibre(it)} className="text-primary underline text-[11px]">
                            Resolver…
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{it.nombre}</div>
                        <div className="text-[10px] text-muted-foreground">{it.categoria || ""} · {it.unidad}</div>
                        {libre && !override && <div className="text-[10px] text-orange-600 dark:text-orange-400">Ítem libre — requiere resolución</div>}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{pendiente.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number" min={0} max={pendiente} step="0.01"
                          disabled={pendiente <= 0 || (libre && !override)}
                          value={lineas[it.id]?.cantidad ?? 0}
                          onChange={(e) =>
                            setLineas((p) => ({ ...p, [it.id]: { ...(p[it.id] ?? { cantidad: 0, costo: 0 }), cantidad: Number(e.target.value) } }))
                          }
                          className="h-8 w-20 px-2 text-right rounded-md border border-input bg-background font-mono disabled:opacity-40"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number" min={0} step="0.0001"
                          disabled={pendiente <= 0}
                          value={lineas[it.id]?.costo ?? it.precio_unitario ?? 0}
                          onChange={(e) =>
                            setLineas((p) => ({ ...p, [it.id]: { ...(p[it.id] ?? { cantidad: 0, costo: 0 }), costo: Number(e.target.value) } }))
                          }
                          className="h-8 w-24 px-2 text-right rounded-md border border-input bg-background font-mono disabled:opacity-40"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button
              onClick={enviar}
              disabled={busy}
              className="h-9 px-4 text-xs font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Registrando…" : "Registrar recepción"}
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          La orden debe estar en estado <b>Enviada</b> o <b>Parcial</b> para registrar recepciones.
        </p>
      )}

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Recepciones anteriores
        </p>
        {recepciones.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin recepciones registradas.</p>
        ) : (
          <div className="space-y-2">
            {recepciones.map((r: any) => (
              <div key={r.id} className="border border-border rounded-md p-3">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                  <span className="font-mono">{new Date(r.recibido_at).toLocaleString("es-SV")}</span>
                  {r.recibido_por_nombre && <span>· Recibió: {r.recibido_por_nombre}</span>}
                  {r.notas && <span>· {r.notas}</span>}
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {(r.orden_compra_recepcion_items ?? []).map((ri: any) => (
                      <tr key={ri.id} className="border-t border-border">
                        <td className="py-1 font-mono text-[11px]">{ri.inventario_items?.sku ?? "—"}</td>
                        <td className="py-1">{ri.inventario_items?.nombre ?? ""}</td>
                        <td className="py-1 text-right font-mono">{Number(ri.cantidad).toFixed(2)}</td>
                        <td className="py-1 text-right font-mono text-muted-foreground">$ {Number(ri.costo_unitario).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================ HISTORIAL ============================ */

function HistorialGlobal({ items }: { items: any[] }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Historial contextual de esta orden. Para ver el historial completo de un SKU, entra a{" "}
        <Link to="/inventario" className="text-primary underline">Inventario</Link> y usa el ícono de historial.
      </p>
      <div className="border border-border rounded-md overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead className="bg-secondary text-[10px] font-bold text-muted-foreground uppercase">
            <tr>
              <th className="px-2 py-2 text-left">Ítem</th>
              <th className="px-2 py-2 text-left">Proveedor</th>
              <th className="px-2 py-2 text-right">Pedida</th>
              <th className="px-2 py-2 text-right">Recibida</th>
              <th className="px-2 py-2 text-right">Precio unit.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((it: any) => (
              <tr key={it.id}>
                <td className="px-2 py-2">
                  <div className="font-medium">{it.nombre}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{it.inventario_items?.sku ?? "libre"}</div>
                </td>
                <td className="px-2 py-2">{it.proveedor || "—"}</td>
                <td className="px-2 py-2 text-right font-mono">{Number(it.cantidad_pedida).toFixed(2)}</td>
                <td className="px-2 py-2 text-right font-mono text-accent">{Number(it.cantidad_recibida).toFixed(2)}</td>
                <td className="px-2 py-2 text-right font-mono">
                  {it.precio_unitario != null ? `$ ${Number(it.precio_unitario).toFixed(4)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}