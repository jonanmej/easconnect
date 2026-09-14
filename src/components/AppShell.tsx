import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { motion, LayoutGroup } from "framer-motion";
import {
  LayoutDashboard,
  CalendarRange,
  CalendarCheck,
  ClipboardList,
  Building2,
  Sun,
  Bot,
  Boxes,
  ShoppingCart,
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
  LineChart,
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
  PanelLeftClose,
  PanelLeftOpen,
  MoreVertical,
} from "lucide-react";
import { RotateCcw, Clock, CheckCircle2 } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { canAccessWithEmail, highestRole, ROLE_LABEL } from "@/lib/roles";
import { useTheme } from "@/lib/theme-context";
import { usePersistedState } from "@/hooks/usePersistedState";
import { reiniciarApp } from "@/lib/app-update";
import { BrandLogo, BRAND_LOGO_URLS } from "@/components/BrandLogo";
import { ChemitekLogo } from "@/components/logos/ChemitekLogo";
import pvstopLightAsset from "@/assets/brand-pvstop-light.png.asset.json";
import pvstopDarkAsset from "@/assets/brand-pvstop-dark.png.asset.json";
import chemitekLightAsset from "@/assets/brand-chemitek-light.png.asset.json";
import chemitekDarkAsset from "@/assets/brand-chemitek-dark.png.asset.json";
import { GlobalSearch } from "@/components/GlobalSearch";
import { dashboardAlertas } from "@/lib/dashboard.functions";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { NotificationsBell } from "@/components/NotificationsBell";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
      { to: "/jornada", label: "Jornada laboral", icon: Clock },
      { to: "/agenda-interna", label: "Agenda interna", icon: CalendarCheck },
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
      { to: "/ordenes-compra", label: "Órdenes de compra", icon: ShoppingCart },
    ],
  },
  {
    title: "Inteligencia",
    items: [
      { to: "/mantenimientos", label: "Mantenimientos", icon: Wrench },
      { to: "/reportes", label: "Reportes", icon: Sparkles },
      { to: "/finalizados", label: "Trabajos finalizados", icon: CheckCircle2 },
      { to: "/notificaciones", label: "Notificaciones", icon: Mail },
      { to: "/contratos", label: "Contratos", icon: FileSignature },
    ],
  },
  {
    title: "Administración",
    items: [
      { to: "/usuarios", label: "Usuarios y Roles", icon: Users },
      { to: "/search-console", label: "Buscadores (SEO)", icon: LineChart },
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
  const [sidebarHidden, setSidebarHidden] = usePersistedState("sidebar.hidden", false, {
    url: false,
  });

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
      items: g.items.filter((i) => canAccessWithEmail(roles, i.to, user?.email)),
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

  const buildSidebar = (mode: "full" | "rail") => (
    <>
      <Link
        to="/"
        className={
          "pt-5 pb-4 flex items-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar " +
          (mode === "rail"
            ? "px-2 justify-center lg:pl-6 lg:pr-4 lg:justify-start"
            : "pl-6 pr-4 justify-start")
        }
        aria-label="EA Service & Consulting — Ir al inicio"
      >
        <BrandLogo
          variant="ea-main"
          className={
            mode === "rail"
              ? "h-9 lg:h-20 w-auto object-contain"
              : "h-16 sm:h-20 w-auto object-contain"
          }
        />
      </Link>

      <nav
        aria-label="Navegación principal"
        className={
          "flex-1 space-y-1 overflow-y-auto pb-4 " +
          (mode === "rail" ? "px-2 lg:px-4" : "px-4")
        }
      >
        <LayoutGroup id="sidebar-nav">
        {groups.map((group) => {
          const items = group.items;
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <div
                className={
                  "text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.14em] px-2 mb-2 mt-4 " +
                  (mode === "rail" ? "hidden lg:block" : "")
                }
              >
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
                    title={mode === "rail" ? item.label : undefined}
                    className={
                      "relative flex items-center gap-3 py-2.5 min-h-11 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar group " +
                      (mode === "rail" ? "px-0 justify-center lg:px-3 lg:justify-start " : "px-3 ") +
                      (active
                        ? "text-primary font-semibold"
                        : "text-sidebar-foreground/80 hover:bg-secondary hover:text-foreground hover:translate-x-0.5 transition-transform")
                    }
                  >
                    {active && (
                      <motion.span
                        layoutId={`sidebar-active-pill-${mode}`}
                        className="absolute inset-0 rounded-md bg-primary/12 shadow-[inset_3px_0_0_0_var(--color-primary)]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        aria-hidden="true"
                      />
                    )}
                    <Icon className={"relative size-[18px] shrink-0 transition-transform " + (active ? "scale-110" : "group-hover:scale-110")} aria-hidden="true" />
                    <span
                      className={
                        "relative flex-1 truncate " + (mode === "rail" ? "hidden lg:block" : "")
                      }
                    >
                      {item.label}
                    </span>
                    {item.to === "/trabajos" && alertas.data?.sla_vencidos ? (
                      <span aria-label={`${alertas.data.sla_vencidos} SLA vencidos`} className={"relative text-[10px] font-bold px-1.5 rounded bg-destructive/15 text-destructive " + (mode === "rail" ? "hidden lg:inline" : "")}>{alertas.data.sla_vencidos}</span>
                    ) : null}
                    {item.to === "/inventario" && alertas.data?.stock_critico ? (
                      <span aria-label={`${alertas.data.stock_critico} en stock crítico`} className={"relative text-[10px] font-bold px-1.5 rounded bg-destructive/15 text-destructive " + (mode === "rail" ? "hidden lg:inline" : "")}>{alertas.data.stock_critico}</span>
                    ) : null}
                    {item.to === "/solicitudes" && alertas.data?.solicitudes_estancadas ? (
                      <span aria-label={`${alertas.data.solicitudes_estancadas} solicitudes estancadas`} className={"relative text-[10px] font-bold px-1.5 rounded bg-primary/15 text-primary " + (mode === "rail" ? "hidden lg:inline" : "")}>{alertas.data.solicitudes_estancadas}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
        </LayoutGroup>
      </nav>

      <div className={"border-t border-border " + (mode === "rail" ? "p-2 lg:p-3" : "p-3")}>
        <div className={"mb-2 " + (mode === "rail" ? "hidden lg:block" : "")}>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 mb-1.5">
            Marcas asociadas
          </p>
          <div className="flex flex-col items-start gap-1.5 px-2">
            <img
              src={theme === "dark" ? pvstopDarkAsset.url : pvstopLightAsset.url}
              alt="PVSTOP El Salvador"
              className="h-7 w-auto object-contain"
            />
            <img
              src={theme === "dark" ? chemitekDarkAsset.url : chemitekLightAsset.url}
              alt="Chemitek Solar"
              className="h-4 w-auto object-contain"
            />
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center gap-2 p-1.5 rounded-md hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
            >
              <div className="size-8 shrink-0 rounded-full bg-secondary grid place-items-center text-xs font-bold">
                {initials}
              </div>
              <div className={"flex-1 min-w-0 text-left " + (mode === "rail" ? "hidden lg:block" : "")}>
                <p className="text-xs font-semibold truncate">{user?.email}</p>
                <p className="text-[10px] text-muted-foreground truncate uppercase flex items-center gap-1">
                  <ShieldCheck className="size-3 shrink-0" />
                  {role ? ROLE_LABEL[role] : "Sin rol asignado"}
                </p>
              </div>
              <MoreVertical className={"size-4 shrink-0 text-muted-foreground " + (mode === "rail" ? "hidden lg:block" : "")} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-xs font-medium truncate">{user?.email}</span>
                <span className="text-[10px] text-muted-foreground uppercase">
                  {role ? ROLE_LABEL[role] : "Sin rol asignado"}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/completar-perfil" })}>
              <UserCheck className="size-4" />
              <span>Completar perfil</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleRefresh()} disabled={refreshing}>
              <RefreshCw className={"size-4 " + (refreshing ? "animate-spin" : "")} />
              <span>Sincronizar permisos</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void reiniciarApp()}>
              <RotateCcw className="size-4" />
              <span>Reiniciar app</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void handleSignOut()}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="size-4" />
              <span>Cerrar sesión</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  // Barra inferior tipo app nativa: hasta 4 destinos accesibles + "Más".
  const flatItems = groups.flatMap((g) => g.items);
  const tabPriority = ["/", "/programacion", "/terreno", "/mis-trabajos", "/trabajos", "/reportes", "/plantas", "/solicitudes"];
  const tabItems = tabPriority
    .map((to) => flatItems.find((i) => i.to === to))
    .filter((i): i is NavItem => Boolean(i))
    .slice(0, 4);

  return (
    <div className="flex h-[100dvh] w-full bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Saltar al contenido
      </a>
      <aside
        className={
          "hidden md:flex shrink-0 border-r border-border flex-col bg-sidebar safe-bottom transition-[width,opacity] duration-200 overflow-hidden " +
          (sidebarHidden ? "w-0 opacity-0 border-r-0" : "w-16 lg:w-64 opacity-100")
        }
      >
        {buildSidebar("rail")}
      </aside>

      <main id="main-content" className="flex-1 overflow-y-auto flex flex-col min-w-0">
        <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 safe-top safe-x">
          <div className="min-h-16 flex items-center justify-between gap-2 px-3 sm:px-4 md:px-8">
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
              <SheetContent side="left" className="p-0 w-[17rem] max-w-[85vw] bg-sidebar flex flex-col safe-top safe-bottom">
                <VisuallyHidden>
                  <SheetTitle>Navegación</SheetTitle>
                </VisuallyHidden>
                {buildSidebar("full")}
              </SheetContent>
            </Sheet>
            <button
              type="button"
              onClick={() => setSidebarHidden(!sidebarHidden)}
              aria-label={sidebarHidden ? "Mostrar sidebar" : "Ocultar sidebar"}
              title={sidebarHidden ? "Mostrar sidebar" : "Ocultar sidebar"}
              className="hidden md:flex size-10 shrink-0 items-center justify-center rounded-md hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {sidebarHidden ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            </button>
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
            <OfflineIndicator />
          </div>
          </div>
        </header>

        <div
          id="main-content"
          tabIndex={-1}
          className="flex-1 flex flex-col focus:outline-none safe-x pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0 md:safe-bottom"
        >
          {children}
        </div>

        {/* Barra de navegación inferior (móvil), estilo app nativa */}
        <nav
          aria-label="Navegación rápida"
          className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur-md safe-bottom safe-x no-print"
        >
          <div className="grid grid-cols-5">
            {tabItems.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 text-[10px] font-medium transition-colors " +
                    (active ? "text-primary" : "text-muted-foreground active:bg-secondary/60")
                  }
                >
                  <Icon className={"size-5 " + (active ? "scale-110" : "")} aria-hidden="true" />
                  <span className="w-full truncate text-center leading-tight">{item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir más secciones"
              className="flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 text-[10px] font-medium text-muted-foreground active:bg-secondary/60"
            >
              <Menu className="size-5" aria-hidden="true" />
              <span className="leading-tight">Más</span>
            </button>
          </div>
        </nav>
      </main>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}