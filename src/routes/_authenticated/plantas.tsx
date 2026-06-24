import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { RecordDialog, Field, inputCls } from "@/components/RecordDialog";
import {
  listClientes,
  listPlantas,
  upsertPlanta,
  deletePlanta,
} from "@/lib/operations.functions";
import { useAuth } from "@/lib/auth-context";
import { highestRole } from "@/lib/roles";
import { Plus, MapPin, Pencil, Trash2, Map as MapIcon, Navigation } from "lucide-react";

export const Route = createFileRoute("/_authenticated/plantas")({
  head: () => ({
    meta: [{ title: "Plantas · EA Service Connect" }, { name: "description", content: "Instalaciones bajo gestión: solares y térmicas." }],
  }),
  component: Plantas,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Error: {error.message}</div>
  ),
});

function Plantas() {
  const qc = useQueryClient();
  const fetchPlantas = useServerFn(listPlantas);
  const fetchClientes = useServerFn(listClientes);
  const fetchUpsert = useServerFn(upsertPlanta);
  const fetchDelete = useServerFn(deletePlanta);
  const { roles } = useAuth();
  const canEdit = ["admin", "supervisor"].includes(highestRole(roles) ?? "");

  const list = useQuery({ queryKey: ["plantas"], queryFn: () => fetchPlantas() });
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: () => fetchClientes() });
  const [editing, setEditing] = useState<any | null>(null);
  const [openMap, setOpenMap] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (vars: any) => fetchUpsert({ data: vars }),
    onSuccess: () => {
      toast.success("Planta guardada");
      qc.invalidateQueries({ queryKey: ["plantas"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Planta eliminada");
      qc.invalidateQueries({ queryKey: ["plantas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({
      id: editing?.id,
      nombre: f.get("nombre"),
      cliente_id: f.get("cliente_id"),
      ubicacion: f.get("ubicacion") || null,
      paneles: f.get("paneles") || 0,
      capacidad: f.get("capacidad") || null,
      eficiencia: f.get("eficiencia") || null,
      notificaciones_completado: f.get("notificaciones_completado") === "on",
      email_notificaciones: f.get("email_notificaciones") || "",
      sla_horas_respuesta: f.get("sla_horas_respuesta") || null,
      sla_horas_resolucion: f.get("sla_horas_resolucion") || null,
      latitud: f.get("latitud") || null,
      longitud: f.get("longitud") || null,
    });
  }

  // Agrupar plantas por cliente
  const grupos = (() => {
    const map = new Map<string, { cliente_nombre: string; plantas: any[] }>();
    ((list.data as any[] | undefined) ?? []).forEach((p) => {
      const key = p.cliente_id ?? "sin";
      if (!map.has(key)) map.set(key, { cliente_nombre: p.cliente_nombre, plantas: [] });
      map.get(key)!.plantas.push(p);
    });
    return Array.from(map.values()).sort((a, b) => a.cliente_nombre.localeCompare(b.cliente_nombre));
  })();

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Plantas en Operación"
        description="Cada planta enlaza su cliente, equipos asignados y bitácora de mantenimientos."
        actions={canEdit && (
          <button
            onClick={() => setEditing({})}
            className="h-9 px-4 inline-flex items-center gap-2 text-xs font-medium bg-primary text-primary-foreground rounded-md"
          >
            <Plus className="size-3.5" /> Nueva planta
          </button>
        )}
      />

      {list.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <div className="space-y-8">
        {grupos.map((g) => (
          <section key={g.cliente_nombre}>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {g.cliente_nombre}
              </h2>
              <span className="text-[10px] text-muted-foreground">
                {g.plantas.length} planta{g.plantas.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-3">
              {g.plantas.map((p) => {
                const hasGeo = p.latitud != null && p.longitud != null;
                const mapsUrl = hasGeo
                  ? `https://www.google.com/maps/search/?api=1&query=${p.latitud},${p.longitud}`
                  : p.ubicacion
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.ubicacion)}`
                    : null;
                const earthUrl = hasGeo
                  ? `https://earth.google.com/web/search/${p.latitud},${p.longitud}`
                  : null;
                const embedQuery = hasGeo
                  ? `${p.latitud},${p.longitud}`
                  : p.ubicacion
                    ? p.ubicacion
                    : null;
                const embedUrl = embedQuery
                  ? `https://maps.google.com/maps?q=${encodeURIComponent(embedQuery)}&z=15&output=embed`
                  : null;
                const isOpen = openMap === p.id;
                return (
                  <div key={p.id} className="bg-card border border-border rounded-xl hover:border-primary/40 transition-colors overflow-hidden">
                    <div className="p-5 flex flex-wrap items-center gap-6">
                    <div className="size-12 rounded-lg bg-primary/10 text-primary grid place-items-center">
                      <MapPin className="size-5" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <h3 className="text-base font-semibold tracking-tight">{p.nombre}</h3>
                      <p className="text-xs text-muted-foreground">{p.ubicacion ?? "Sin dirección"}</p>
                      {hasGeo && (
                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                          {Number(p.latitud).toFixed(5)}, {Number(p.longitud).toFixed(5)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-6 text-sm">
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Paneles</p>
                        <p className="font-mono font-semibold">{p.paneles ? p.paneles.toLocaleString() : "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Capacidad</p>
                        <p className="font-medium">{p.capacidad ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Eficiencia</p>
                        <p className="font-mono font-semibold text-accent">{p.eficiencia ? `${p.eficiencia}%` : "—"}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {embedUrl && (
                        <button
                          onClick={() => setOpenMap(isOpen ? null : p.id)}
                          className={`size-8 grid place-items-center rounded-md hover:bg-secondary ${isOpen ? "text-primary bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
                          title={isOpen ? "Ocultar mapa" : "Ver mapa"}
                          aria-label="Mapa"
                        >
                          <MapIcon className="size-3.5" />
                        </button>
                      )}
                      {earthUrl && (
                        <a href={earthUrl} target="_blank" rel="noreferrer" className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" title="Abrir en Google Earth" aria-label="Google Earth">
                          <Navigation className="size-3.5" />
                        </a>
                      )}
                      {canEdit && (
                        <>
                          <button onClick={() => setEditing(p)} className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" aria-label="Editar">
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Eliminar ${p.nombre}?`)) remove.mutate(p.id); }}
                            className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive"
                            aria-label="Eliminar"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                    </div>
                    {isOpen && embedUrl && (
                      <div className="border-t border-border bg-background">
                        <iframe
                          title={`Mapa de ${p.nombre}`}
                          src={embedUrl}
                          className="w-full h-80 block"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                        <div className="px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{hasGeo ? "Coordenadas exactas" : "Búsqueda por dirección"}</span>
                          {mapsUrl && (
                            <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              Abrir en pestaña nueva ↗
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <RecordDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing?.id ? "Editar planta" : "Nueva planta"}
        busy={save.isPending}
        error={save.error?.message}
        onSubmit={onSubmit}
      >
        <Field label="Nombre">
          <input name="nombre" required defaultValue={editing?.nombre ?? ""} className={inputCls} />
        </Field>
        <Field label="Cliente">
          <select name="cliente_id" required defaultValue={editing?.cliente_id ?? ""} className={inputCls}>
            <option value="">— Selecciona cliente —</option>
            {(clientes.data as any[] | undefined)?.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Ubicación">
          <input name="ubicacion" defaultValue={editing?.ubicacion ?? ""} className={inputCls} placeholder="San Salvador, SV" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitud">
            <input name="latitud" type="number" step="0.0000001" min="-90" max="90"
              defaultValue={editing?.latitud ?? ""} className={inputCls} placeholder="13.6929" />
          </Field>
          <Field label="Longitud">
            <input name="longitud" type="number" step="0.0000001" min="-180" max="180"
              defaultValue={editing?.longitud ?? ""} className={inputCls} placeholder="-89.2182" />
          </Field>
        </div>
        <p className="text-[10px] text-muted-foreground -mt-2">
          Para obtener las coordenadas: abre Google Maps, haz clic derecho en el punto exacto y copia los dos números que aparecen.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Paneles">
            <input name="paneles" type="number" min="0" defaultValue={editing?.paneles ?? 0} className={inputCls} />
          </Field>
          <Field label="Capacidad">
            <input name="capacidad" defaultValue={editing?.capacidad ?? ""} className={inputCls} placeholder="32 MW" />
          </Field>
          <Field label="Eficiencia (%)">
            <input name="eficiencia" type="number" step="0.1" min="0" max="100" defaultValue={editing?.eficiencia ?? ""} className={inputCls} />
          </Field>
        </div>
        <div className="pt-2 border-t border-border space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notificaciones al cliente</p>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="notificaciones_completado"
              defaultChecked={!!editing?.notificaciones_completado}
              className="size-4"
            />
            Avisar al cliente cuando un trabajo se complete
          </label>
          <Field label="Email del cliente">
            <input
              name="email_notificaciones"
              type="email"
              defaultValue={editing?.email_notificaciones ?? ""}
              className={inputCls}
              placeholder="cliente@empresa.com"
            />
          </Field>
        </div>
        <div className="pt-2 border-t border-border space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SLA (horas)</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Respuesta">
              <input name="sla_horas_respuesta" type="number" min="0"
                defaultValue={editing?.sla_horas_respuesta ?? ""} className={inputCls} placeholder="4" />
            </Field>
            <Field label="Resolución">
              <input name="sla_horas_resolucion" type="number" min="0"
                defaultValue={editing?.sla_horas_resolucion ?? ""} className={inputCls} placeholder="24" />
            </Field>
          </div>
        </div>
      </RecordDialog>
    </div>
  );
}