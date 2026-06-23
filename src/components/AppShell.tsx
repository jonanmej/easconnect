import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarRange,
  ClipboardList,
  Building2,
  Sun,
  Bot,
  Boxes,
  Wrench,
  Sparkles,
  Search,
  Bell,
  LogOut,
  ShieldCheck,
  Users,
  RefreshCw,
  CalendarPlus,
  Mail,
  History,
  AlertTriangle,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { canAccess, highestRole, ROLE_LABEL } from "@/lib/roles";
import { EALogo } from "@/components/logos/EALogo";
import { ChemitekLogo } from "@/components/logos/ChemitekLogo";
import { PVStopLogo } from "@/components/logos/PVStopLogo";
import { GlobalSearch } from "@/components/GlobalSearch";
import { dashboardAlertas } from "@/lib/dashboard.functions";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type NavGroup = { title: string; items: NavItem[] };

const allGroups: NavGroup[] = [
  {
    title: "Operaciones",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/programacion", label: "Programación", icon: CalendarRange },
      { to: "/trabajos", label: "Trabajos", icon: ClipboardList },
      { to: "/solicitudes", label: "Solicitudes", icon: CalendarPlus },
    ],
  },
  {
    title: "Activos",
    items: [
      { to: "/clientes", label: "Clientes", icon: Building2 },
      { to: "/plantas", label: "Plantas Solares", icon: Sun },
      { to: "/equipos", label: "Equipos", icon: Bot },
      { to: "/inventario", label: "Inventario", icon: Boxes },
    ],
  },
  {
    title: "Inteligencia",
    items: [
      { to: "/mantenimientos", label: "Mantenimientos", icon: Wrench },
      { to: "/reportes", label: "Reportes IA", icon: Sparkles },
      { to: "/notificaciones", label: "Notificaciones", icon: Mail },
    ],
  },
  {
    title: "Administración",
    items: [
      { to: "/usuarios", label: "Usuarios y Roles", icon: Users },
      { to: "/auditoria", label: "Auditoría", icon: History },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, roles, signOut, refreshRoles } = useAuth();
  const navigate = useNavigate();
  const role = highestRole(roles);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const fAlertas = useServerFn(dashboardAlertas);
  const alertas = useQuery({
    queryKey: ["alertas-sidebar"],
    queryFn: () => fAlertas(),
    enabled: roles.length > 0 && role !== "cliente",
    refetchInterval: 60_000,
  });
  const totalAlertas = ((alertas.data?.sla_vencidos ?? 0) + (alertas.data?.stock_critico ?? 0) + (alertas.data?.solicitudes_estancadas ?? 0));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setSearchOpen(true);
      } else if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault(); setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = allGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => canAccess(roles, i.to)),
    }))
    .filter((g) => g.items.length > 0);

  const initials = (user?.email ?? "??").slice(0, 2).toUpperCase();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshRoles();
      toast.success("Permisos actualizados");
    } catch {
      toast.error("No se pudieron actualizar los permisos");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border flex-col bg-sidebar">
        <Link to="/" className="p-6 flex items-center" aria-label="EA Service & Consulting">
          <EALogo className="h-10 w-auto text-foreground" accentClassName="text-primary" />
        </Link>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto pb-4">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 mb-2 mt-4">
                {group.title}
              </div>
              {group.items.map((item) => {
                const active = pathname === item.to;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors " +
                      (active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground")
                    }
                  >
                    <Icon className="size-4" />
                    <span className="flex-1">{item.label}</span>
                    {item.to === "/trabajos" && alertas.data?.sla_vencidos ? (
                      <span className="text-[10px] font-bold px-1.5 rounded bg-destructive/10 text-destructive">{alertas.data.sla_vencidos}</span>
                    ) : null}
                    {item.to === "/inventario" && alertas.data?.stock_critico ? (
                      <span className="text-[10px] font-bold px-1.5 rounded bg-destructive/10 text-destructive">{alertas.data.stock_critico}</span>
                    ) : null}
                    {item.to === "/solicitudes" && alertas.data?.solicitudes_estancadas ? (
                      <span className="text-[10px] font-bold px-1.5 rounded bg-primary/10 text-primary">{alertas.data.solicitudes_estancadas}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="mb-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 mb-2">
              Marcas asociadas
            </p>
            <div className="flex items-center gap-3 px-2">
              <ChemitekLogo
                className="h-4 w-auto text-muted-foreground hover:text-foreground transition-colors"
                accentClassName="text-primary"
              />
              <PVStopLogo
                className="h-4 w-auto text-muted-foreground hover:text-foreground transition-colors"
                accentClassName="text-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 p-2">
            <div className="size-8 rounded-full bg-secondary grid place-items-center text-xs font-bold">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{user?.email}</p>
              <p className="text-[10px] text-muted-foreground truncate uppercase flex items-center gap-1">
                <ShieldCheck className="size-3" />
                {role ? ROLE_LABEL[role] : "Sin rol asignado"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Cerrar sesión"
              className="size-8 grid place-items-center rounded-md hover:bg-secondary"
            >
              <LogOut className="size-4 text-muted-foreground" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="mt-2 w-full flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={"size-3 " + (refreshing ? "animate-spin" : "")} />
            Sincronizar permisos
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="w-full bg-secondary border border-border rounded-md pl-9 pr-12 py-1.5 text-sm text-left text-muted-foreground hover:bg-secondary/70 transition-colors"
              >
                Buscar planta, cliente, trabajo…
                <kbd className="absolute right-2 top-1/2 -translate-y-1/2 h-5 px-1.5 rounded border border-border bg-background text-[10px] text-muted-foreground flex items-center font-mono">⌘K</kbd>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {role !== "cliente" && (
              <Link
                to="/trabajos"
                className="relative size-9 grid place-items-center rounded-md hover:bg-secondary transition-colors"
                aria-label="Alertas"
                title={`${totalAlertas} alertas activas`}
              >
                {totalAlertas > 0
                  ? <AlertTriangle className="size-4 text-destructive" />
                  : <Bell className="size-4 text-muted-foreground" />}
                {totalAlertas > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold grid place-items-center">{totalAlertas}</span>
                )}
              </Link>
            )}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full">
              <span className="size-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[10px] font-bold text-accent uppercase tracking-tight">
                Sistemas OK
              </span>
            </div>
          </div>
        </header>

        {children}
      </main>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}