import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AuthProvider>
      <PerfilGate>
        <AppShell>
          <RoleGate>
            <Outlet />
          </RoleGate>
        </AppShell>
      </PerfilGate>
    </AuthProvider>
  );
}

/** Redirige a /completar-perfil cuando el usuario aún no ha completado sus datos. */
function PerfilGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("perfil_completado, nombres, apellidos, cargo")
        .eq("id", u.user.id)
        .maybeSingle();
      if (cancelled) return;
      const tieneDatos =
        !!(p?.nombres && p.nombres.trim()) &&
        !!(p?.apellidos && p.apellidos.trim()) &&
        !!(p?.cargo && p.cargo.trim());
      const completado = (p?.perfil_completado ?? false) && tieneDatos;
      if (!completado && location.pathname !== "/completar-perfil") {
        navigate({ to: "/completar-perfil", replace: true });
      } else {
        setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [location.pathname, navigate]);

  // Mientras se valida, permite render para no parpadear (la propia ruta /completar-perfil ya es accesible)
  if (!checked && location.pathname !== "/completar-perfil") {
    return <div className="min-h-screen grid place-items-center text-xs text-muted-foreground">Cargando…</div>;
  }
  return <>{children}</>;
}