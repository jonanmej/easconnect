import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2, Inbox } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  listMisNotificaciones,
  eliminarMiNotificacion,
  eliminarTodasMisNotificaciones,
  type NotifInApp,
} from "@/lib/notif-inapp.functions";

function fmtRel(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return "hace instantes";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-SV", { day: "2-digit", month: "short" });
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fList = useServerFn(listMisNotificaciones);
  const fDel = useServerFn(eliminarMiNotificacion);
  const fDelAll = useServerFn(eliminarTodasMisNotificaciones);

  const list = useQuery({
    queryKey: ["mis-notificaciones"],
    queryFn: () => fList(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const items: NotifInApp[] = (list.data as NotifInApp[] | undefined) ?? [];
  const total = items.length;

  const remove = useMutation({
    mutationFn: (id: string) => fDel({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mis-notificaciones"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAll = useMutation({
    mutationFn: () => fDelAll(),
    onSuccess: () => {
      toast.success("Notificaciones limpiadas");
      qc.invalidateQueries({ queryKey: ["mis-notificaciones"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function abrir(n: NotifInApp) {
    if (n.trabajo_id) {
      navigate({ to: "/trabajos" });
    }
    remove.mutate(n.id);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notificaciones (${total})`}
          title={total > 0 ? `${total} notificaciones` : "Sin notificaciones"}
          className="relative size-11 grid place-items-center rounded-md hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Bell className="size-[18px] text-foreground" aria-hidden="true" />
          {total > 0 && (
            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold grid place-items-center">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-sm font-semibold">Notificaciones</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {total === 0 ? "Sin pendientes" : `${total} pendiente${total === 1 ? "" : "s"}`}
            </p>
          </div>
          {total > 0 && (
            <button
              type="button"
              onClick={() => removeAll.mutate()}
              disabled={removeAll.isPending}
              className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Limpiar todo
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {list.isLoading && (
            <p className="p-6 text-center text-xs text-muted-foreground">Cargando…</p>
          )}
          {!list.isLoading && total === 0 && (
            <div className="p-8 flex flex-col items-center gap-2 text-center">
              <Inbox className="size-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Estás al día. Las notificaciones nuevas aparecerán acá.
              </p>
            </div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              className="group flex items-start gap-2 px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary/50 transition-colors"
            >
              <button
                type="button"
                onClick={() => abrir(n)}
                className="flex-1 text-left min-w-0 focus:outline-none"
              >
                <p className="text-sm font-medium truncate">{n.titulo}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{n.mensaje}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {n.tipo} · {fmtRel(n.created_at)}
                </p>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove.mutate(n.id);
                }}
                aria-label="Descartar notificación"
                className="size-7 shrink-0 grid place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}