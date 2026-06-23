import { Link, Outlet, useRouterState } from "@tanstack/react-router";
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
} from "lucide-react";
import type { ComponentType } from "react";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type NavGroup = { title: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    title: "Operaciones",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/programacion", label: "Programación", icon: CalendarRange },
      { to: "/trabajos", label: "Trabajos", icon: ClipboardList },
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
    ],
  },
];

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border flex-col bg-sidebar">
        <div className="p-6 flex items-center gap-3">
          <div className="size-8 bg-foreground rounded flex items-center justify-center">
            <div className="size-4 bg-primary rounded-sm" />
          </div>
          <span className="font-semibold tracking-tight text-lg">SOLAROS</span>
        </div>

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
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 p-2">
            <div className="size-8 rounded-full bg-secondary grid place-items-center text-xs font-bold">
              JD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">Javier Domínguez</p>
              <p className="text-[10px] text-muted-foreground truncate uppercase">
                Admin Principal
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar planta, cliente o equipo..."
                className="w-full bg-secondary border border-border rounded-md pl-9 pr-10 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 h-5 px-1.5 rounded border border-border bg-background text-[10px] text-muted-foreground flex items-center font-mono">
                /
              </kbd>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="relative size-9 grid place-items-center rounded-md hover:bg-secondary transition-colors"
              aria-label="Notificaciones"
            >
              <Bell className="size-4 text-muted-foreground" />
              <span className="absolute top-2 right-2 size-1.5 rounded-full bg-primary" />
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-accent/10 rounded-full">
              <span className="size-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[10px] font-bold text-accent uppercase tracking-tight">
                Sistemas OK
              </span>
            </div>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}