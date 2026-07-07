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
  LogOut,
  ShieldCheck,
  Users,
  RefreshCw,
  CalendarPlus,
  Mail,
  History,
  AlertTriangle,
  FileSignature,
  Moon,
  Sun as SunIcon,
  Laptop,
  Settings,
  HardHat,
  Briefcase,
  Map as MapIcon,
  Satellite,
  UserCheck,
  Menu,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { canAccess, highestRole, ROLE_LABEL } from "@/lib/roles";
import { useTheme } from "@/lib/theme-context";
import { BrandLogo } from "@/components/BrandLogo";
import { ChemitekLogo } from "@/components/logos/ChemitekLogo";
import { GlobalSearch } from "@/components/GlobalSearch";
import { dashboardAlertas } from "@/lib/dashboard.functions";
import { NotificationsBell } from "@/components/NotificationsBell";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

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
      { to: "/terreno", label: "A.T.", icon: HardHat },
      { to: "/mis-trabajos", label: "Mis trabajos", icon: Briefcase },
      { to: "/solicitudes", label: "Solicitudes", icon: CalendarPlus },
      { to: "/rutas", label: "Rutas", icon: MapIcon },
    ],
  },
  {
    title: "Activos",
    items: [
      { to: "/clientes", label: "Clientes", icon: Building2 },
      { to: "/plantas", label: "Plantas Solares", icon: Sun },
      { to: "/mapa", label: "Mapa satelital", icon: Satellite },
      { to: "/equipos", label: "Equipos", icon: Bot },
      { to: "/inventario", label: "Inventario", icon: Boxes },
    ],
  },
  {
    title: "Inteligencia",
    items: [
      { to: "/mantenimientos", label: "Mantenimientos", icon: Wrench },
      { to: "/reportes", label: "Reportes", icon: Sparkles },
      { to: "/notificaciones", label: "Notificaciones", icon: Mail },
      { to: "/contratos", label: "Contratos", icon: FileSignature },
    ],
  },
  {
    title: "Administración",
    items: [
      { to: "/usuarios", label: "Usuarios y Roles", icon: Users },
      { to: "/auditoria", label: "Auditoría", icon: History },
      { to: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, roles, signOut, refreshRoles } = useAuth();
  const navigate = useNavigate();
  const { preference, setPreference, theme } = useTheme();
  void theme;
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

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  // Cierra el drawer al cambiar de ruta en móvil
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const sidebarBody = (
    <>
      <Link
        to="/"
        className="px-6 pt-6 pb-3 flex items-center justify-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        aria-label="EA Service & Consulting — Ir al inicio"
      >
        <BrandLogo variant="ea-main" className="h-20 w-auto object-contain" />
      </Link>

      <nav aria-label="Navegación principal" className="flex-1 px-4 space-y-1 overflow-y-auto pb-4">
        {groups.map((group) => {
          const items = group.items;
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.14em] px-2 mb-2 mt-4">
                {group.title}
              </div>
              {items.map((item) => {
                const active = pathname === item.to;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={
                      "flex items-center gap-3 px-3 py-2.5 min-h-11 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar " +
                      (active
                        ? "bg-primary/12 text-primary font-semibold shadow-[inset_3px_0_0_0_var(--color-primary)]"
                        : "text-sidebar-foreground/80 hover:bg-secondary hover:text-foreground")
                    }
                  >
                    <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.to === "/trabajos" && alertas.data?.sla_vencidos ? (
                      <span aria-label={`${alertas.data.sla_vencidos} SLA vencidos`} className="text-[10px] font-bold px-1.5 rounded bg-destructive/15 text-destructive">{alertas.data.sla_vencidos}</span>
                    ) : null}
                    {item.to === "/inventario" && alertas.data?.stock_critico ? (
                      <span aria-label={`${alertas.data.stock_critico} en stock crítico`} className="text-[10px] font-bold px-1.5 rounded bg-destructive/15 text-destructive">{alertas.data.stock_critico}</span>
                    ) : null}
                    {item.to === "/solicitudes" && alertas.data?.solicitudes_estancadas ? (
                      <span aria-label={`${alertas.data.solicitudes_estancadas} solicitudes estancadas`} className="text-[10px] font-bold px-1.5 rounded bg-primary/15 text-primary">{alertas.data.solicitudes_estancadas}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="mb-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 mb-2">
            Marcas asociadas
          </p>
          <div className="flex items-center gap-4 px-2">
            {/* Chemitek es un wordmark puro → necesita más alto para igualar la altura tipográfica de PVSTOP */}
            <ChemitekLogo className="h-8 w-auto text-muted-foreground hover:text-foreground transition-colors" accentClassName="text-primary" />
            {/* PVSTOP incluye ícono + wordmark + bajada; se reduce para que su wordmark iguale la altura del texto Chemitek */}
            <BrandLogo variant="pvstop" className="h-12 w-auto object-contain" />
          </div>
        </div>
        <div className="flex items-center gap-3 p-2">
          <div className="size-8 shrink-0 rounded-full bg-secondary grid place-items-center text-xs font-bold">{initials}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{user?.email}</p>
            <p className="text-[10px] text-muted-foreground truncate uppercase flex items-center gap-1">
              <ShieldCheck className="size-3 shrink-0" />
              {role ? ROLE_LABEL[role] : "Sin rol asignado"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Cerrar sesión"
            className="size-9 shrink-0 grid place-items-center rounded-md hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
          >
            <LogOut className="size-4 text-muted-foreground" />
          </button>
        </div>
        <Link
          to="/completar-perfil"
          className="mt-2 w-full flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          <UserCheck className="size-3" />
          Completar perfil
        </Link>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="mt-2 w-full flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-secondary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          <RefreshCw className={"size-3 " + (refreshing ? "animate-spin" : "")} />
          Sincronizar permisos
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Saltar al contenido
      </a>
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border flex-col bg-sidebar">
        {sidebarBody}
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between gap-2 px-3 sm:px-4 md:px-8">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Abrir menú de navegación"
                  className="md:hidden size-10 shrink-0 grid place-items-center rounded-md hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 max-w-[85vw] bg-sidebar flex flex-col">
                <VisuallyHidden>
                  <SheetTitle>Navegación</SheetTitle>
                </VisuallyHidden>
                {sidebarBody}
              </SheetContent>
            </Sheet>
            <div className="relative w-full max-w-md min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Abrir búsqueda global (atajo: Ctrl/Cmd + K)"
                className="w-full bg-secondary border border-border rounded-md pl-9 pr-3 sm:pr-12 py-1.5 text-sm text-left text-muted-foreground hover:bg-secondary/70 transition-colors truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="hidden sm:inline">Buscar planta, cliente, trabajo…</span>
                <span className="sm:hidden">Buscar…</span>
                <kbd className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 h-5 px-1.5 rounded border border-border bg-background text-[10px] text-muted-foreground items-center font-mono">⌘K</kbd>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div
              role="radiogroup"
              aria-label="Modo de color"
              className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-md bg-secondary border border-border"
            >
              {([
                { value: "light", icon: SunIcon, label: "Modo claro" },
                { value: "system", icon: Laptop, label: "Modo automático (sigue el sistema)" },
                { value: "dark", icon: Moon, label: "Modo oscuro" },
              ] as const).map(({ value, icon: Icon, label }) => {
                const selected = preference === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={label}
                    title={label}
                    onClick={() => setPreference(value)}
                    className={
                      "size-8 grid place-items-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-secondary " +
                      (selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            {role !== "cliente" && totalAlertas > 0 && (() => {
              const sla = alertas.data?.sla_vencidos ?? 0;
              const stock = alertas.data?.stock_critico ?? 0;
              const soli = alertas.data?.solicitudes_estancadas ?? 0;
              const destino = sla ? "/trabajos" : stock ? "/inventario" : "/solicitudes";
              const alertaKey = sla ? "sla" : stock ? "stock" : "estancadas";
              const motivos: string[] = [];
              if (sla) motivos.push(`${sla} SLA vencido${sla === 1 ? "" : "s"}`);
              if (stock) motivos.push(`${stock} item${stock === 1 ? "" : "s"} en stock crítico`);
              if (soli) motivos.push(`${soli} solicitud${soli === 1 ? "" : "es"} estancada${soli === 1 ? "" : "s"}`);
              const tituloMotivo = motivos.join(" · ");
              const descripcionPrincipal = sla
                ? `Hay ${sla} trabajo${sla === 1 ? "" : "s"} con SLA vencido.`
                : stock
                  ? `Hay ${stock} item${stock === 1 ? "" : "s"} de inventario bajo su mínimo.`
                  : `Hay ${soli} solicitud${soli === 1 ? "" : "es"} pendiente${soli === 1 ? "" : "s"} por más de 2 días.`;
              return (
                <button
                  type="button"
                  onClick={() => {
                    toast.warning(descripcionPrincipal, {
                      description: motivos.length > 1 ? `Otras alertas: ${motivos.filter((_, i) => (sla ? i > 0 : stock ? i > 0 : true)).join(" · ")}` : undefined,
                      duration: 6000,
                    });
                    navigate({ to: destino, search: { alerta: alertaKey } as any });
                  }}
                  className="relative size-11 grid place-items-center rounded-md hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={`Alertas operacionales: ${tituloMotivo}`}
                  title={tituloMotivo}
                >
                  <AlertTriangle className="size-[18px] text-destructive" aria-hidden="true" />
                  <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold grid place-items-center">{totalAlertas}</span>
                </button>
              );
            })()}
            <NotificationsBell />
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-accent/15 rounded-full">
              <span className="size-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[10px] font-bold text-accent uppercase tracking-wide">
                Sistemas OK
              </span>
            </div>
          </div>
        </header>

        <div id="main-content" tabIndex={-1} className="flex-1 flex flex-col focus:outline-none">
          {children}
        </div>
      </main>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}