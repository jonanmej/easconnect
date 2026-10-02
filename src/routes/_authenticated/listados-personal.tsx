import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Car, FileDown, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import {
  deleteListado,
  deleteVehiculo,
  listListados,
  listPersonalConDui,
  listTrabajosParaListado,
  listVehiculos,
  upsertListado,
  upsertVehiculo,
  type PersonaListado,
} from "@/lib/listados-personal.functions";
import { generarYDescargarListadoPersonalPdf } from "@/lib/pdf/descargar";

export const Route = createFileRoute("/_authenticated/listados-personal")({
  head: () => ({
    meta: [
      { title: "Listados de personal · EA Service Connect" },
      { name: "description", content: "Listados de personal y vehículos que se presentan a cada cliente por trabajo, con descarga en PDF." },
      { property: "og:title", content: "Listados de personal por proyecto" },
      { property: "og:description", content: "Personal (nombre y DUI) y vehículos asignados a cada trabajo del cliente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListadosPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {(error as Error)?.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">No encontrado.</div>,
});

const selectCls = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm";

function fmt(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(d).slice(0, 10);
  }
}

type Listado = Awaited<ReturnType<typeof listListados>>[number];

function ListadosPage() {
  const { roles } = useAuth() as any;
  const puedeEditar = (roles ?? []).some((r: string) => r === "admin" || r === "supervisor");
  const qc = useQueryClient();
  const fList = useServerFn(listListados);
  const fVeh = useServerFn(listVehiculos);
  const fDel = useServerFn(deleteListado);
  const listados = useQuery({ queryKey: ["listados-personal"], queryFn: () => fList() });
  const vehiculos = useQuery({ queryKey: ["vehiculos"], queryFn: () => fVeh() });
  const [filtroCliente, setFiltroCliente] = useState("");
  const [editando, setEditando] = useState<Listado | "nuevo" | null>(null);
  const [vehOpen, setVehOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);

  const clientes = useMemo(() => {
    const m = new Map<string, string>();
    (listados.data ?? []).forEach((l) => l.cliente_id && m.set(l.cliente_id, l.cliente));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [listados.data]);
  const filas = (listados.data ?? []).filter((l) => !filtroCliente || l.cliente_id === filtroCliente);

  const del = useMutation({
    mutationFn: (id: string) => fDel({ data: { id } }),
    onSuccess: () => { toast.success("Listado eliminado"); qc.invalidateQueries({ queryKey: ["listados-personal"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  async function descargar(items: Listado[]) {
    if (!items.length) return toast.error("Selecciona al menos un listado.");
    const vmap = new Map((vehiculos.data ?? []).map((v: any) => [v.id, v]));
    try {
      await generarYDescargarListadoPersonalPdf(
        {
          emitido_at: new Date().toLocaleString("es-SV"),
          listados: items.map((l) => ({
            proyecto: l.proyecto,
            cliente: l.cliente,
            folio: l.folio,
            planta: l.planta,
            fecha: fmt(l.fecha),
            personal: l.personal,
            vehiculos: l.vehiculo_ids.map((id) => vmap.get(id)).filter(Boolean).map((v: any) => ({ modelo: v.modelo, placa: v.placa })),
          })),
        },
        `Listado_personal_${items.length === 1 ? items[0].cliente.replace(/\s+/g, "_") : "varios"}.pdf`,
      );
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo generar el PDF");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Listados de personal" />
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${selectCls} sm:w-64`} value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clientes.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        {puedeEditar && <Button onClick={() => setEditando("nuevo")}><Plus className="mr-1 h-4 w-4" />Nuevo listado</Button>}
        {puedeEditar && <Button variant="outline" onClick={() => setVehOpen(true)}><Car className="mr-1 h-4 w-4" />Vehículos</Button>}
        <Button variant="outline" onClick={() => descargar(filas.filter((l) => sel.includes(l.id)))}>
          <FileDown className="mr-1 h-4 w-4" />PDF de seleccionados ({sel.length})
        </Button>
      </div>

      {listados.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : filas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Aún no hay listados de personal.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filas.map((l) => (
            <Card key={l.id} className="space-y-2 p-4">
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={sel.includes(l.id)}
                  onChange={(e) => { const c = e.currentTarget.checked; setSel((p) => c ? [...p, l.id] : p.filter((x) => x !== l.id)); }} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{l.proyecto}</p>
                  <p className="text-sm text-muted-foreground">{l.cliente} · {l.planta}</p>
                  <p className="text-xs text-muted-foreground">OT {l.folio} · {fmt(l.fecha)}</p>
                </div>
              </div>
              <p className="text-sm">{l.personal.length} personas · {l.vehiculo_ids.length} vehículos</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => descargar([l])}><FileDown className="mr-1 h-4 w-4" />PDF</Button>
                {puedeEditar && <Button size="sm" variant="outline" onClick={() => setEditando(l)}><Pencil className="mr-1 h-4 w-4" />Editar</Button>}
                {puedeEditar && (
                  <Button size="sm" variant="ghost" onClick={() => confirm("¿Eliminar este listado?") && del.mutate(l.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editando && <ListadoDialog listado={editando === "nuevo" ? null : editando} vehiculos={vehiculos.data ?? []} onClose={() => setEditando(null)} />}
      {vehOpen && <VehiculosDialog vehiculos={vehiculos.data ?? []} onClose={() => setVehOpen(false)} />}
    </div>
  );
}

function ListadoDialog({ listado, vehiculos, onClose }: { listado: Listado | null; vehiculos: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const fTrab = useServerFn(listTrabajosParaListado);
  const fPers = useServerFn(listPersonalConDui);
  const fSave = useServerFn(upsertListado);
  const trabajos = useQuery({ queryKey: ["trabajos-listado"], queryFn: () => fTrab() });
  const personal = useQuery({ queryKey: ["personal-dui"], queryFn: () => fPers() });
  const [trabajoId, setTrabajoId] = useState(listado?.trabajo_id ?? "");
  const [proyecto, setProyecto] = useState(listado?.proyecto ?? "");
  const [notas, setNotas] = useState(listado?.notas ?? "");
  const [gente, setGente] = useState<PersonaListado[]>(listado?.personal ?? []);
  const [vehIds, setVehIds] = useState<string[]>(listado?.vehiculo_ids ?? []);
  const [extNombre, setExtNombre] = useState("");
  const [extDui, setExtDui] = useState("");

  const trabajoSel = trabajos.data?.find((t) => t.id === trabajoId);

  function agregarColaborador(id: string) {
    const p = personal.data?.find((x) => x.id === id);
    if (!p || gente.some((g) => g.user_id === id)) return;
    setGente((g) => [...g, { user_id: p.id, nombre: p.nombre, dui: p.dui }]);
  }

  const save = useMutation({
    mutationFn: () =>
      fSave({ data: { id: listado?.id, trabajo_id: trabajoId, proyecto, notas, personal: gente, vehiculo_ids: vehIds } }),
    onSuccess: () => {
      toast.success("Listado guardado");
      qc.invalidateQueries({ queryKey: ["listados-personal"] });
      qc.invalidateQueries({ queryKey: ["personal-dui"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{listado ? "Editar listado" : "Nuevo listado de personal"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Trabajo (OT)</label>
            <select className={selectCls} value={trabajoId}
              onChange={(e) => {
                const v = e.target.value;
                setTrabajoId(v);
                const t = trabajos.data?.find((x) => x.id === v);
                if (t && !proyecto) setProyecto(t.servicio);
              }}>
              <option value="">Selecciona un trabajo…</option>
              {(trabajos.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.folio} · {t.cliente} · {t.planta} · {fmt(t.fecha)}</option>
              ))}
            </select>
            {trabajoSel && <p className="text-xs text-muted-foreground">Cliente: {trabajoSel.cliente}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Proyecto</label>
            <Input value={proyecto} onChange={(e) => setProyecto(e.target.value)} placeholder="Ej. Mantenimiento preventivo transformadores" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Personal</label>
            <select className={selectCls} value="" onChange={(e) => agregarColaborador(e.target.value)}>
              <option value="">Agregar colaborador registrado…</option>
              {(personal.data ?? []).filter((p) => !gente.some((g) => g.user_id === p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input placeholder="Nombre de persona externa" value={extNombre} onChange={(e) => setExtNombre(e.target.value)} />
              <Input placeholder="DUI" className="sm:w-40" value={extDui} onChange={(e) => setExtDui(e.target.value)} />
              <Button type="button" variant="outline" onClick={() => {
                if (!extNombre.trim()) return;
                setGente((g) => [...g, { user_id: null, nombre: extNombre.trim(), dui: extDui.trim() }]);
                setExtNombre(""); setExtDui("");
              }}><UserPlus className="mr-1 h-4 w-4" />Agregar</Button>
            </div>
            <div className="divide-y rounded-md border">
              {gente.length === 0 && <p className="p-3 text-sm text-muted-foreground">Sin personas aún.</p>}
              {gente.map((g, i) => (
                <div key={i} className="flex items-center gap-2 p-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{g.nombre}{!g.user_id && <span className="ml-1 text-xs text-muted-foreground">(externo)</span>}</span>
                  <Input className="h-8 w-32" placeholder="DUI" value={g.dui}
                    onChange={(e) => { const v = e.target.value; setGente((arr) => arr.map((x, j) => j === i ? { ...x, dui: v } : x)); }} />
                  <Button size="sm" variant="ghost" onClick={() => setGente((arr) => arr.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Vehículos</label>
            {vehiculos.filter((v) => v.activo).length === 0 && <p className="text-sm text-muted-foreground">Registra vehículos con el botón "Vehículos".</p>}
            <div className="grid gap-1 sm:grid-cols-2">
              {vehiculos.filter((v) => v.activo || vehIds.includes(v.id)).map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={vehIds.includes(v.id)}
                    onChange={(e) => { const c = e.currentTarget.checked; setVehIds((p) => c ? [...p, v.id] : p.filter((x) => x !== v.id)); }} />
                  {v.modelo} · {v.placa}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Notas internas</label>
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!trabajoId || !proyecto.trim() || gente.length === 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VehiculosDialog({ vehiculos, onClose }: { vehiculos: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const fUp = useServerFn(upsertVehiculo);
  const fDel = useServerFn(deleteVehiculo);
  const [modelo, setModelo] = useState("");
  const [placa, setPlaca] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["vehiculos"] });
  const add = useMutation({
    mutationFn: () => fUp({ data: { modelo, placa, activo: true } }),
    onSuccess: () => { setModelo(""); setPlaca(""); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (v: any) => fUp({ data: { id: v.id, modelo: v.modelo, placa: v.placa, activo: !v.activo } }),
    onSuccess: refresh,
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => fDel({ data: { id } }),
    onSuccess: refresh,
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Vehículos</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Modelo (ej. TOYOTA HILUX)" value={modelo} onChange={(e) => setModelo(e.target.value)} />
          <Input placeholder="Placa" className="sm:w-32" value={placa} onChange={(e) => setPlaca(e.target.value)} />
          <Button disabled={!modelo.trim() || !placa.trim() || add.isPending} onClick={() => add.mutate()}>Agregar</Button>
        </div>
        <div className="divide-y rounded-md border">
          {vehiculos.length === 0 && <p className="p-3 text-sm text-muted-foreground">Sin vehículos.</p>}
          {vehiculos.map((v) => (
            <div key={v.id} className="flex items-center gap-2 p-2 text-sm">
              <span className={`flex-1 ${v.activo ? "" : "text-muted-foreground line-through"}`}>{v.modelo} · {v.placa}</span>
              <Button size="sm" variant="outline" onClick={() => toggle.mutate(v)}>{v.activo ? "Desactivar" : "Activar"}</Button>
              <Button size="sm" variant="ghost" onClick={() => confirm("¿Eliminar vehículo?") && del.mutate(v.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
