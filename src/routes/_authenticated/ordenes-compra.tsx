import { createFileRoute, Link } from "@tanstack/react-router";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ResponsiveTable";
import { Field, inputCls } from "@/components/RecordDialog";
import {
  listOrdenesCompra,
  getOrdenCompra,
  cambiarEstadoOC,
  registrarRecepcionOC,
  eliminarOrdenCompra,
  editarRecepcionItemOC,
  listVariacionesOC,
  guardarOrdenCompra,
  subirCotizacion,
} from "@/lib/ordenes-compra.functions";
import { listInventario, upsertInventarioItem } from "@/lib/inventario.functions";
import { BuscadorProveedoresIA, type OfertaProveedor } from "@/components/BuscadorProveedoresIA";
import { generarYDescargarOrdenCompraPdf } from "@/lib/pdf/descargar";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { Send, PackageCheck, XCircle, Trash2, Download, ExternalLink, Pencil, AlertTriangle, Plus, Paperclip, Sparkles } from "lucide-react";

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
  const { roles, user } = useAuth();
  const rol = highestRole(roles) ?? "";
  const canManage = ["admin", "supervisor"].includes(rol);
  const canReceive = ["admin", "supervisor", "tecnico"].includes(rol);

  const [filtro, setFiltro] = usePersistedState<"todas" | EstadoOC>("oc.filtro", "todas");
  const [openId, setOpenId] = useState<string | null>(null);
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [prefill, setPrefill] = useState<any[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("oc_open_new") === "1") {
      sessionStorage.removeItem("oc_open_new");
      const raw = sessionStorage.getItem("oc_prefill_lowstock");
      sessionStorage.removeItem("oc_prefill_lowstock");
      if (raw) {
        try { setPrefill(JSON.parse(raw)); } catch { setPrefill(null); }
      } else setPrefill(null);
      setNuevaOpen(true);
    }
  }, []);

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
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as any)}
              className={`${inputCls} w-full min-w-0 min-h-11 sm:min-h-9 sm:w-auto`}
            >
              <option value="todas">Todos los estados</option>
              <option value="borrador">Borrador</option>
              <option value="enviada">Enviada</option>
              <option value="parcial">Parcial</option>
              <option value="recibida">Recibida</option>
              <option value="cancelada">Cancelada</option>
            </select>
            {canManage && (
              <button
                onClick={() => { setPrefill(null); setNuevaOpen(true); }}
                className="min-h-11 sm:h-9 px-4 inline-flex items-center justify-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md w-full sm:w-auto"
              >
                <Plus className="size-3.5" /> Nueva orden
              </button>
            )}
          </div>
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

      <ResponsiveTable
        data={filtradas}
        rowKey={(r: any) => r.id}
        emptyMessage={
          rows.length === 0 ? (
            <>
              Aún no hay órdenes.{" "}
              <Link to="/inventario" className="text-primary underline">
                Crea una desde Inventario.
              </Link>
            </>
          ) : (
            "Ninguna orden coincide con el filtro."
          )
        }
        columns={[
          {
            key: "folio",
            header: "Folio",
            primary: true,
            cell: (r: any) => <span className="font-mono font-semibold">{r.folio}</span>,
          },
          {
            key: "fecha",
            header: "Fecha",
            secondary: true,
            cell: (r: any) => r.fecha_emision,
          },
          {
            key: "solicitante",
            header: "Solicitante",
            cell: (r: any) => r.solicitante || "—",
          },
          {
            key: "proveedores",
            header: "Proveedores",
            hideOnMobile: true,
            cell: (r: any) => {
              const provs = Array.isArray(r.proveedores) ? r.proveedores.map((p: any) => p?.nombre).filter(Boolean) : [];
              return provs.length === 0 ? <span className="text-muted-foreground">Sin definir</span> : provs.join(", ");
            },
          },
          {
            key: "lineas",
            header: "Líneas",
            align: "right",
            cell: (r: any) => <span className="font-mono">{r.total_lineas}</span>,
          },
          {
            key: "recibido",
            header: "Recibido / Pedido",
            align: "right",
            hideOnMobile: true,
            cell: (r: any) => (
              <span className="font-mono">
                {Number(r.total_recibido).toFixed(2)} / {Number(r.total_pedido).toFixed(2)}
              </span>
            ),
          },
          {
            key: "estado",
            header: "Estado",
            align: "center",
            cell: (r: any) => (
              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${ESTADO_COLOR[r.estado as EstadoOC]}`}>
                {r.estado}
              </span>
            ),
          },
        ]}
        rowActions={(r: any) => (
          <button
            onClick={() => setOpenId(r.id)}
            className="h-8 px-3 text-xs rounded-md border border-border hover:bg-secondary"
          >
            Abrir
          </button>
        )}
      />

      {openId && (
        <OrdenDetalleDialog
          id={openId}
          onClose={() => setOpenId(null)}
          canManage={canManage}
          canReceive={canReceive}
          onChanged={() => qc.invalidateQueries({ queryKey: ["ordenes-compra"] })}
        />
      )}

      {nuevaOpen && (
        <NuevaOrdenDialog
          prefill={prefill}
          solicitanteDefault={user?.email ?? "Bodega"}
          onClose={() => setNuevaOpen(false)}
          onCreated={(id) => {
            setNuevaOpen(false);
            qc.invalidateQueries({ queryKey: ["ordenes-compra"] });
            qc.invalidateQueries({ queryKey: ["inventario"] });
            setOpenId(id);
          }}
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
  const [tab, setTab] = usePersistedState<"detalle" | "recepcion" | "variaciones" | "historial">("oc.tab", "detalle");

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
  orden,
  items,
  invItems,
  recepciones,
  canReceive,
  canEdit,
  onDone,
}: {
  ordenId: string;
  orden: any;
  items: any[];
  invItems: any[];
  recepciones: any[];
  canReceive: boolean;
  canEdit: boolean;
  onDone: () => void;
}) {
  const fReg = useServerFn(registrarRecepcionOC);
  const fUpsertInv = useServerFn(upsertInventarioItem);
  const fEditItem = useServerFn(editarRecepcionItemOC);
  type LineaState = {
    cantidad: number;
    costo: number;
    moneda: string;
    impuesto: number;
    variacion_motivo?: string;
    item_id_override?: string | null;
  };
  const monedaOc: string = (orden?.moneda as string) || "USD";
  const impuestoOc = Number(orden?.impuesto_pct ?? 0);
  const [lineas, setLineas] = useState<Record<string, LineaState>>({});
  const [notas, setNotas] = useState("");
  const [nombreRecibe, setNombreRecibe] = useState("");
  const [busy, setBusy] = useState(false);

  function upd(id: string, patch: Partial<LineaState>) {
    setLineas((p) => {
      const base: LineaState = { cantidad: 0, costo: 0, moneda: monedaOc, impuesto: impuestoOc };
      const prev = p[id] ?? base;
      return { ...p, [id]: { ...prev, ...patch } };
    });
  }

  const reconciliacion = useMemo(() => {
    const proveedores: any[] = Array.isArray(orden?.proveedores) ? orden.proveedores : [];
    const totalesPorProv: Record<string, { subtotal: number; impuesto: number; total: number }> = {};
    for (const it of items) {
      const st = lineas[it.id];
      if (!st || !st.cantidad) continue;
      const prov = ((it.proveedor as string) || "Sin proveedor").trim();
      const sub = Number(st.cantidad) * Number(st.costo || 0);
      const imp = sub * (Number(st.impuesto ?? 0) / 100);
      const acc = totalesPorProv[prov] ?? { subtotal: 0, impuesto: 0, total: 0 };
      acc.subtotal += sub; acc.impuesto += imp; acc.total += sub + imp;
      totalesPorProv[prov] = acc;
    }
    return Object.entries(totalesPorProv).map(([prov, tot]) => {
      const cot = proveedores.find((p: any) => ((p?.nombre as string) || "").trim() === prov);
      const cotMonto = cot?.cotizacion_monto != null ? Number(cot.cotizacion_monto) : null;
      const delta = cotMonto != null ? tot.total - cotMonto : null;
      return { proveedor: prov, ...tot, cot_monto: cotMonto, delta };
    });
  }, [items, lineas, orden?.proveedores]);

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
      upd(oi.id, { item_id_override: (nuevo as any).id });
      toast.success(`SKU ${(nuevo as any).sku} creado`);
    } else {
      const sku = prompt("Ingresa el SKU existente al que mapear este ítem:");
      if (!sku) return;
      const found = invItems.find((x: any) => x.sku.toLowerCase() === sku.toLowerCase());
      if (!found) {
        toast.error("SKU no encontrado");
        return;
      }
      upd(oi.id, { item_id_override: found.id });
      toast.success(`Mapeado a ${found.sku}`);
    }
  }

  async function enviar() {
    const payload: any[] = [];
    for (const [oi_id, v] of Object.entries(lineas)) {
      if (!v.cantidad || v.cantidad <= 0) continue;
      const it = items.find((x: any) => x.id === oi_id);
      const precioEsp = it?.precio_unitario != null ? Number(it.precio_unitario) : null;
      const cambioPrecio = precioEsp != null && Math.abs(precioEsp - Number(v.costo || 0)) > 0.0001;
      const cambioMoneda = (v.moneda || monedaOc) !== monedaOc;
      const cambioImp = Number(v.impuesto ?? 0) !== impuestoOc;
      if ((cambioPrecio || cambioMoneda || cambioImp) && (!v.variacion_motivo || v.variacion_motivo.trim().length < 3)) {
        toast.error(`"${it?.nombre}": ingresa el motivo de la variación`);
        return;
      }
      payload.push({
        orden_item_id: oi_id,
        cantidad: v.cantidad,
        costo_unitario: v.costo || 0,
        item_id_override: v.item_id_override ?? null,
        moneda: v.moneda || monedaOc,
        impuesto_pct: Number(v.impuesto ?? 0),
        precio_esperado: precioEsp,
        variacion_motivo: v.variacion_motivo || null,
      });
    }
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

  async function editarRi(ri: any) {
    const cantStr = prompt(`Nueva cantidad para "${ri.inventario_items?.nombre ?? ""}" (actual: ${Number(ri.cantidad).toFixed(2)})`, String(ri.cantidad));
    if (cantStr == null) return;
    const costStr = prompt(`Nuevo costo unitario (actual: ${Number(ri.costo_unitario).toFixed(4)})`, String(ri.costo_unitario));
    if (costStr == null) return;
    const motivo = prompt("Motivo de la edición (mín. 3 caracteres):");
    if (!motivo || motivo.trim().length < 3) { toast.error("Motivo obligatorio"); return; }
    try {
      await fEditItem({ data: { recepcion_item_id: ri.id, nueva_cantidad: Number(cantStr), nuevo_costo: Number(costStr), motivo } });
      toast.success("Recepción actualizada y stock reconciliado");
      onDone();
    } catch (e: any) { toast.error(e.message); }
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

          {reconciliacion.length > 0 && (
            <div className="border border-border rounded-md p-3 bg-secondary/40 text-xs space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Reconciliación contra cotizaciones
              </p>
              {reconciliacion.map((r) => (
                <div key={r.proveedor} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.proveedor}</span>
                  <span className="text-muted-foreground">
                    Subtotal ${r.subtotal.toFixed(2)} · Imp ${r.impuesto.toFixed(2)} · Total <b>${r.total.toFixed(2)}</b>
                  </span>
                  {r.cot_monto != null ? (
                    <span className={Math.abs(r.delta ?? 0) > 0.01 ? "text-orange-600 dark:text-orange-400 inline-flex items-center gap-1" : "text-accent"}>
                      {Math.abs(r.delta ?? 0) > 0.01 && <AlertTriangle className="size-3" />}
                      vs cotización ${r.cot_monto.toFixed(2)} · Δ ${(r.delta ?? 0).toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">Sin cotización registrada</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="border border-border rounded-md overflow-x-auto">
            <table className="w-full text-xs min-w-[800px]">
              <thead className="bg-secondary text-[10px] font-bold text-muted-foreground uppercase">
                <tr>
                  <th className="px-2 py-2 text-left">SKU</th>
                  <th className="px-2 py-2 text-left">Descripción</th>
                  <th className="px-2 py-2 text-right">Pendiente</th>
                  <th className="px-2 py-2 text-right">Recibir</th>
                  <th className="px-2 py-2 text-right">Costo unit.</th>
                  <th className="px-2 py-2 text-left">Moneda</th>
                  <th className="px-2 py-2 text-right">Imp %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((it: any) => {
                  const pendiente = Number(it.cantidad_pedida) - Number(it.cantidad_recibida);
                  const libre = !it.item_id;
                  const st = lineas[it.id];
                  const override = st?.item_id_override;
                  const skuMostrado = override
                    ? invItems.find((x: any) => x.id === override)?.sku ?? "resuelto"
                    : it.inventario_items?.sku;
                  const precioEsp = it.precio_unitario != null ? Number(it.precio_unitario) : null;
                  const costoActual = st?.costo ?? it.precio_unitario ?? 0;
                  const monedaAct = st?.moneda ?? monedaOc;
                  const impAct = st?.impuesto ?? impuestoOc;
                  const cambioPrecio = precioEsp != null && Math.abs(precioEsp - Number(costoActual)) > 0.0001;
                  const cambioMoneda = monedaAct !== monedaOc;
                  const cambioImp = Number(impAct) !== impuestoOc;
                  const hayVariacion = cambioPrecio || cambioMoneda || cambioImp;
                  return (
                    <>
                      <tr key={it.id} className={pendiente <= 0 ? "opacity-50" : ""}>
                        <td className="px-2 py-2 font-mono">
                          {skuMostrado ? skuMostrado : (
                            <button onClick={() => resolverItemLibre(it)} className="text-primary underline text-[11px]">Resolver…</button>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium">{it.nombre}</div>
                          <div className="text-[10px] text-muted-foreground">{it.categoria || ""} · {it.unidad}</div>
                          {libre && !override && <div className="text-[10px] text-orange-600 dark:text-orange-400">Ítem libre — requiere resolución</div>}
                          {precioEsp != null && <div className="text-[10px] text-muted-foreground">Esperado: ${precioEsp.toFixed(4)}</div>}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">{pendiente.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number" min={0} max={pendiente} step="0.01"
                            disabled={pendiente <= 0 || (libre && !override)}
                            value={st?.cantidad ?? 0}
                            onChange={(e) => upd(it.id, { cantidad: Number(e.target.value) })}
                            className="h-8 w-20 px-2 text-right rounded-md border border-input bg-background font-mono disabled:opacity-40"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number" min={0} step="0.0001"
                            disabled={pendiente <= 0}
                            value={costoActual}
                            onChange={(e) => upd(it.id, { costo: Number(e.target.value) })}
                            className={"h-8 w-24 px-2 text-right rounded-md border bg-background font-mono disabled:opacity-40 " + (cambioPrecio ? "border-orange-500/60" : "border-input")}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            disabled={pendiente <= 0}
                            value={monedaAct}
                            onChange={(e) => upd(it.id, { moneda: e.target.value.toUpperCase().slice(0, 8) })}
                            className={"h-8 w-16 px-2 rounded-md border bg-background font-mono uppercase disabled:opacity-40 " + (cambioMoneda ? "border-orange-500/60" : "border-input")}
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number" min={0} max={100} step="0.01"
                            disabled={pendiente <= 0}
                            value={impAct}
                            onChange={(e) => upd(it.id, { impuesto: Number(e.target.value) })}
                            className={"h-8 w-16 px-2 text-right rounded-md border bg-background font-mono disabled:opacity-40 " + (cambioImp ? "border-orange-500/60" : "border-input")}
                          />
                        </td>
                      </tr>
                      {hayVariacion && (st?.cantidad ?? 0) > 0 && (
                        <tr key={it.id + "-motivo"} className="bg-orange-500/5">
                          <td colSpan={7} className="px-2 py-2">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="size-3.5 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
                              <div className="flex-1 space-y-1">
                                <p className="text-[10px] uppercase tracking-wider font-bold text-orange-600 dark:text-orange-400">
                                  Variación detectada — motivo obligatorio
                                </p>
                                <input
                                  type="text"
                                  placeholder="Ej: alza de proveedor, cambio de moneda, IVA aplicado…"
                                  value={st?.variacion_motivo ?? ""}
                                  onChange={(e) => upd(it.id, { variacion_motivo: e.target.value })}
                                  className={inputCls}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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
                <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <tbody>
                    {(r.orden_compra_recepcion_items ?? []).map((ri: any) => (
                      <tr key={ri.id} className="border-t border-border">
                        <td className="py-1 font-mono text-[11px]">{ri.inventario_items?.sku ?? "—"}</td>
                        <td className="py-1">{ri.inventario_items?.nombre ?? ""}</td>
                        <td className="py-1 text-right font-mono">{Number(ri.cantidad).toFixed(2)}</td>
                        <td className="py-1 text-right font-mono text-muted-foreground">
                          {ri.moneda || "USD"} {Number(ri.costo_unitario).toFixed(4)}
                          {ri.impuesto_pct ? ` +${Number(ri.impuesto_pct).toFixed(1)}%` : ""}
                        </td>
                        <td className="py-1 text-right">
                          {canEdit && (
                            <button
                              onClick={() => editarRi(ri)}
                              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                              title="Editar y reconciliar"
                            >
                              <Pencil className="size-3" /> Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {(r.orden_compra_recepcion_items ?? []).some((ri: any) => ri.variacion_motivo) && (
                  <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
                    {(r.orden_compra_recepcion_items ?? [])
                      .filter((ri: any) => ri.variacion_motivo)
                      .map((ri: any) => (
                        <div key={ri.id + "-mot"}>
                          <b>{ri.inventario_items?.sku ?? "—"}:</b> {ri.variacion_motivo}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================ VARIACIONES ============================ */

function VariacionesList({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (loading) return <p className="text-xs text-muted-foreground">Cargando variaciones…</p>;
  if (!rows.length) return <p className="text-xs text-muted-foreground">Sin variaciones registradas para esta orden.</p>;
  const badge: Record<string, string> = {
    precio: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400",
    moneda: "bg-primary/10 text-primary border-primary/30",
    impuesto: "bg-accent/10 text-accent border-accent/30",
    cantidad: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return (
    <div className="border border-border rounded-md overflow-x-auto">
      <table className="w-full text-xs min-w-[600px]">
        <thead className="bg-secondary text-[10px] font-bold text-muted-foreground uppercase">
          <tr>
            <th className="px-2 py-2 text-left">Fecha</th>
            <th className="px-2 py-2 text-left">Tipo</th>
            <th className="px-2 py-2 text-left">Esperado</th>
            <th className="px-2 py-2 text-left">Recibido</th>
            <th className="px-2 py-2 text-left">Motivo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((v: any) => (
            <tr key={v.id}>
              <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">
                {new Date(v.created_at).toLocaleString("es-SV")}
              </td>
              <td className="px-2 py-2">
                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${badge[v.tipo] ?? ""}`}>
                  {v.tipo}
                </span>
              </td>
              <td className="px-2 py-2 font-mono">{v.valor_esperado ?? "—"}</td>
              <td className="px-2 py-2 font-mono">{v.valor_recibido ?? "—"}</td>
              <td className="px-2 py-2">{v.motivo || <span className="text-muted-foreground italic">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

/* ==================== NUEVA ORDEN DIALOG ==================== */

type NuevaFila = {
  key: string;
  source: "inventario" | "libre";
  item_id: string | null;
  sku_texto: string | null;
  nombre: string;
  categoria: string;
  unidad: string;
  cantidad_pedida: number;
  precio_unitario: number | "";
  proveedor: string;
};

type NuevoProv = {
  key: string;
  nombre: string;
  cotizacion_folio: string;
  cotizacion_fecha: string;
  cotizacion_monto: number | "";
  cotizacion_storage_path: string | null;
  file: File | null;
};

function NuevaOrdenDialog({
  prefill,
  solicitanteDefault,
  onClose,
  onCreated,
}: {
  prefill: any[] | null;
  solicitanteDefault: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const fList = useServerFn(listInventario);
  const fSave = useServerFn(guardarOrdenCompra);
  const fUpload = useServerFn(subirCotizacion);
  const inv = useQuery({ queryKey: ["inventario"], queryFn: () => fList() });
  const items = (inv.data as any[] | undefined) ?? [];

  const [solicitante, setSolicitante] = useState(solicitanteDefault);
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);
  const [proveedores, setProveedores] = useState<NuevoProv[]>([]);
  const [filas, setFilas] = useState<NuevaFila[]>(() => {
    if (!prefill?.length) return [];
    return prefill.map((p, i) => ({
      key: `pre-${i}`,
      source: "inventario",
      item_id: p.item_id,
      sku_texto: p.sku ?? null,
      nombre: p.nombre,
      categoria: p.categoria ?? "",
      unidad: p.unidad || "un",
      cantidad_pedida: Number(p.sugerido) || 1,
      precio_unitario: "",
      proveedor: "",
    }));
  });

  function addProv() {
    setProveedores((p) => [
      ...p,
      {
        key: `prov-${Date.now()}-${p.length}`,
        nombre: "",
        cotizacion_folio: "",
        cotizacion_fecha: "",
        cotizacion_monto: "",
        cotizacion_storage_path: null,
        file: null,
      },
    ]);
  }
  function updProv(key: string, patch: Partial<NuevoProv>) {
    setProveedores((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }
  function rmProv(key: string) {
    const prov = proveedores.find((x) => x.key === key);
    setProveedores((p) => p.filter((x) => x.key !== key));
    if (prov?.nombre) {
      setFilas((fs) => fs.map((f) => (f.proveedor === prov.nombre ? { ...f, proveedor: "" } : f)));
    }
  }

  function addFromInv(it: any) {
    setFilas((fs) => [
      ...fs,
      {
        key: `inv-${it.id}-${Date.now()}`,
        source: "inventario",
        item_id: it.id,
        sku_texto: it.sku ?? null,
        nombre: it.nombre,
        categoria: it.categoria ?? "",
        unidad: it.unidad || "un",
        cantidad_pedida: 1,
        precio_unitario: "",
        proveedor: "",
      },
    ]);
  }
  function cargarBajoMinimo() {
    const lows = items.filter(
      (i: any) => Number(i.stock_actual) <= 0 || Number(i.stock_actual) < Number(i.stock_minimo),
    );
    if (lows.length === 0) {
      toast.info("No hay ítems bajo mínimo en inventario");
      return;
    }
    setFilas((fs) => {
      const yaCargados = new Set(fs.filter((f) => f.item_id).map((f) => f.item_id as string));
      const nuevos: NuevaFila[] = lows
        .filter((it: any) => !yaCargados.has(it.id))
        .map((it: any, idx: number) => {
          const faltante = Math.max(1, Math.ceil(Number(it.stock_minimo) - Number(it.stock_actual)));
          return {
            key: `low-${it.id}-${Date.now()}-${idx}`,
            source: "inventario",
            item_id: it.id,
            sku_texto: it.sku ?? null,
            nombre: it.nombre,
            categoria: it.categoria ?? "",
            unidad: it.unidad || "un",
            cantidad_pedida: faltante,
            precio_unitario: "",
            proveedor: "",
          };
        });
      if (nuevos.length === 0) {
        toast.info("Los ítems bajo mínimo ya están cargados");
        return fs;
      }
      toast.success(`Agregados ${nuevos.length} ítem(s) bajo mínimo`);
      return [...fs, ...nuevos];
    });
  }
  function addFree() {
    setFilas((fs) => [
      ...fs,
      {
        key: `free-${Date.now()}-${fs.length}`,
        source: "libre",
        item_id: null,
        sku_texto: null,
        nombre: "",
        categoria: "",
        unidad: "un",
        cantidad_pedida: 1,
        precio_unitario: "",
        proveedor: "",
      },
    ]);
  }
  function updFila(key: string, patch: Partial<NuevaFila>) {
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }
  function rmFila(key: string) {
    setFilas((fs) => fs.filter((f) => f.key !== key));
  }

  const nombresProv = useMemo(
    () => proveedores.map((p) => p.nombre.trim()).filter((n) => n.length > 0),
    [proveedores],
  );

  async function fileToBase64(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  async function guardar() {
    if (filas.length === 0) return toast.error("Agrega al menos un ítem");
    for (const f of filas) {
      if (!f.nombre.trim()) return toast.error("Todas las filas necesitan descripción");
      if (!f.cantidad_pedida || f.cantidad_pedida <= 0) return toast.error("Cantidades deben ser positivas");
    }
    for (const p of proveedores) {
      if (!p.nombre.trim()) return toast.error("Los proveedores necesitan nombre");
    }
    setBusy(true);
    try {
      // 1) crear orden en borrador
      const provsPayload = proveedores.map((p) => ({
        nombre: p.nombre.trim(),
        cotizacion_folio: p.cotizacion_folio || null,
        cotizacion_fecha: p.cotizacion_fecha || null,
        cotizacion_monto: p.cotizacion_monto === "" ? null : Number(p.cotizacion_monto),
        cotizacion_storage_path: null as string | null,
      }));
      const itemsPayload = filas.map((f) => ({
        item_id: f.item_id,
        sku_texto: f.sku_texto,
        nombre: f.nombre.trim(),
        categoria: f.categoria || null,
        unidad: f.unidad || "un",
        cantidad_pedida: Number(f.cantidad_pedida),
        precio_unitario: f.precio_unitario === "" ? null : Number(f.precio_unitario),
        proveedor: f.proveedor?.trim() || null,
      }));
      const res = await fSave({ data: { solicitante, notas: notas || null, proveedores: provsPayload, items: itemsPayload } });
      const ordenId = (res as any).id as string;

      // 2) subir cotizaciones y re-guardar rutas
      const conFile = proveedores.filter((p) => p.file);
      if (conFile.length > 0) {
        const uploaded: Record<string, string> = {};
        for (const p of conFile) {
          try {
            const b64 = await fileToBase64(p.file!);
            const up = await fUpload({
              data: {
                orden_id: ordenId,
                filename: p.file!.name,
                content_type: p.file!.type || "application/octet-stream",
                base64: b64,
              },
            });
            uploaded[p.key] = (up as any).path as string;
          } catch (e: any) {
            toast.error(`Cotización de ${p.nombre}: ${e.message}`);
          }
        }
        const provsConPath = proveedores.map((p) => ({
          nombre: p.nombre.trim(),
          cotizacion_folio: p.cotizacion_folio || null,
          cotizacion_fecha: p.cotizacion_fecha || null,
          cotizacion_monto: p.cotizacion_monto === "" ? null : Number(p.cotizacion_monto),
          cotizacion_storage_path: uploaded[p.key] ?? null,
        }));
        await fSave({ data: { id: ordenId, solicitante, notas: notas || null, proveedores: provsConPath, items: itemsPayload } });
      }

      toast.success("Orden creada en Borrador");
      onCreated(ordenId);
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-lg w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold">Nueva orden de compra</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Se crea en estado Borrador. Podrás enviarla y registrar recepciones desde el detalle.
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="text-muted-foreground hover:text-foreground text-xs">Cerrar</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Solicitante">
              <input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Notas / referencia">
              <input value={notas} onChange={(e) => setNotas(e.target.value)} className={inputCls} placeholder="Urgencia, motivo, referencia interna…" />
            </Field>
          </div>

          {/* Proveedores */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Proveedores y cotizaciones</h4>
              <button type="button" onClick={addProv} className="h-7 px-2 text-[11px] rounded-md border border-border hover:bg-secondary inline-flex items-center gap-1">
                <Plus className="size-3" /> Agregar proveedor
              </button>
            </div>
            {proveedores.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Opcional. Puedes cargar cotizaciones ahora o agregarlas más tarde.</p>
            )}
            <div className="space-y-2">
              {proveedores.map((p) => (
                <div key={p.key} className="border border-border rounded-md p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                  <label className="text-[11px] md:col-span-3">
                    <span className="block text-muted-foreground mb-1">Proveedor</span>
                    <input value={p.nombre} onChange={(e) => updProv(p.key, { nombre: e.target.value })} className={inputCls} placeholder="Nombre" />
                  </label>
                  <label className="text-[11px] md:col-span-2">
                    <span className="block text-muted-foreground mb-1">Cotización #</span>
                    <input value={p.cotizacion_folio} onChange={(e) => updProv(p.key, { cotizacion_folio: e.target.value })} className={inputCls} />
                  </label>
                  <label className="text-[11px] md:col-span-2">
                    <span className="block text-muted-foreground mb-1">Fecha</span>
                    <input type="date" value={p.cotizacion_fecha} onChange={(e) => updProv(p.key, { cotizacion_fecha: e.target.value })} className={inputCls} />
                  </label>
                  <label className="text-[11px] md:col-span-2">
                    <span className="block text-muted-foreground mb-1">Monto</span>
                    <input type="number" min={0} step="0.01" value={p.cotizacion_monto} onChange={(e) => updProv(p.key, { cotizacion_monto: e.target.value === "" ? "" : Number(e.target.value) })} className={inputCls} />
                  </label>
                  <label className="text-[11px] md:col-span-2">
                    <span className="block text-muted-foreground mb-1 flex items-center gap-1"><Paperclip className="size-3" /> Adjunto</span>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => updProv(p.key, { file: e.target.files?.[0] ?? null })}
                      className="block w-full text-[10px]"
                    />
                    {p.file && <span className="block text-[10px] text-muted-foreground mt-1 truncate">{p.file.name}</span>}
                  </label>
                  <div className="md:col-span-1 flex justify-end">
                    <button onClick={() => rmProv(p.key)} className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive" aria-label="Quitar">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Ítems */}
          <section className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ítems solicitados</h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cargarBajoMinimo}
                  className="h-8 px-2 text-[11px] rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
                  title="Agrega los ítems agotados o por debajo del mínimo"
                >
                  <AlertTriangle className="size-3" /> Cargar bajo mínimo
                </button>
                <select
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    const it = items.find((x) => x.id === id);
                    if (it) addFromInv(it);
                    e.target.value = "";
                  }}
                  defaultValue=""
                  className={inputCls + " max-w-xs"}
                >
                  <option value="">+ Desde inventario…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.sku} · {i.nombre}</option>
                  ))}
                </select>
                <button type="button" onClick={addFree} className="h-8 px-2 text-[11px] rounded-md border border-border hover:bg-secondary inline-flex items-center gap-1">
                  <Plus className="size-3" /> Ítem libre
                </button>
              </div>
            </div>

            <div className="border border-border rounded-md overflow-x-auto">
              <table className="w-full text-xs min-w-[880px]">
                <thead className="bg-secondary text-[10px] font-bold text-muted-foreground uppercase">
                  <tr>
                    <th className="px-2 py-2 text-left">SKU</th>
                    <th className="px-2 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-left">Unidad</th>
                    <th className="px-2 py-2 text-right">Cantidad</th>
                    <th className="px-2 py-2 text-right">Precio unit.</th>
                    <th className="px-2 py-2 text-left">Proveedor</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filas.map((f) => (
                    <tr key={f.key}>
                      <td className="px-2 py-2 font-mono text-[11px] whitespace-nowrap">
                        {f.source === "inventario" ? (f.sku_texto ?? "—") : <span className="text-muted-foreground">— libre —</span>}
                      </td>
                      <td className="px-2 py-2">
                        {f.source === "inventario" ? (
                          <div className="font-medium">{f.nombre}</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <input value={f.nombre} onChange={(e) => updFila(f.key, { nombre: e.target.value })} placeholder="Descripción" className="h-8 px-2 rounded-md border border-input bg-background w-full" />
                            <input value={f.categoria} onChange={(e) => updFila(f.key, { categoria: e.target.value })} placeholder="Categoría" className="h-7 px-2 rounded-md border border-input bg-background w-full text-[11px]" />
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {f.source === "inventario" ? (
                          <span className="text-muted-foreground">{f.unidad}</span>
                        ) : (
                          <input value={f.unidad} onChange={(e) => updFila(f.key, { unidad: e.target.value })} className="h-8 w-16 px-2 rounded-md border border-input bg-background" />
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input type="number" min={0} step="0.01" value={f.cantidad_pedida} onChange={(e) => updFila(f.key, { cantidad_pedida: Number(e.target.value) })} className="h-8 w-20 px-2 text-right rounded-md border border-input bg-background font-mono" />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input type="number" min={0} step="0.01" value={f.precio_unitario} onChange={(e) => updFila(f.key, { precio_unitario: e.target.value === "" ? "" : Number(e.target.value) })} className="h-8 w-24 px-2 text-right rounded-md border border-input bg-background font-mono" placeholder="—" />
                      </td>
                      <td className="px-2 py-2">
                        {nombresProv.length > 0 ? (
                          <select value={nombresProv.includes(f.proveedor) ? f.proveedor : ""} onChange={(e) => updFila(f.key, { proveedor: e.target.value })} className="h-8 px-2 rounded-md border border-input bg-background text-[11px] min-w-[9rem]">
                            <option value="">— sin asignar —</option>
                            {nombresProv.map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        ) : (
                          <input value={f.proveedor} onChange={(e) => updFila(f.key, { proveedor: e.target.value })} placeholder="Proveedor" className="h-8 px-2 rounded-md border border-input bg-background text-[11px] min-w-[9rem]" />
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button onClick={() => rmFila(f.key)} className="size-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive" aria-label="Quitar">
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">
                        Sin ítems. Agrega desde inventario o crea un ítem libre.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="h-9 px-4 text-xs rounded-md border border-border hover:bg-secondary">Cancelar</button>
          <button onClick={guardar} disabled={busy || filas.length === 0} className="h-9 px-4 text-xs font-medium bg-primary text-primary-foreground rounded-md disabled:opacity-60">
            {busy ? "Guardando…" : "Crear orden (Borrador)"}
          </button>
        </div>
      </div>
    </div>
  );
}