import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/lib/auth-context";
import { UiPrefsProvider } from "@/lib/ui-prefs-context";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { useNavigate } from "@tanstack/react-router";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { PageTransition } from "@/components/PageTransition";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Sesión local (sin ida y vuelta al servidor en cada navegación).
    // La seguridad real la aplican las políticas de la base de datos.
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AuthProvider>
      <UiPrefsProvider>
        <PerfilGate>
          <AppShell>
            <RoleGate>
              <RealtimeSyncMount />
              <PageTransition>
                <Outlet />
              </PageTransition>
            </RoleGate>
          </AppShell>
        </PerfilGate>
      </UiPrefsProvider>
    </AuthProvider>
  );
}

function RealtimeSyncMount() {
  useRealtimeSync();
  return null;
}

/** Redirige a /completar-perfil cuando el usuario aún no ha completado sus datos. */
function PerfilGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  // El perfil se valida una vez por sesión; se repite solo al salir de /completar-perfil.
  const enCompletar = location.pathname === "/completar-perfil";
  useEffect(() => {
    if (checked && !enCompletar) return;
    let cancelled = false;
    (async () => {
      const { data: sd } = await supabase.auth.getSession();
      const u = { user: sd.session?.user };
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("perfil_completado, nombres, apellidos, cargo, debe_cambiar_password")
        .eq("id", u.user.id)
        .maybeSingle();
      if (cancelled) return;
      const tieneDatos =
        !!(p?.nombres && p.nombres.trim()) &&
        !!(p?.apellidos && p.apellidos.trim()) &&
        !!(p?.cargo && p.cargo.trim());
      const debeCambiarPass = !!p?.debe_cambiar_password;
      const completado = (p?.perfil_completado ?? false) && tieneDatos && !debeCambiarPass;
      if (!completado && location.pathname !== "/completar-perfil") {
        navigate({ to: "/completar-perfil", replace: true });
      } else {
        setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enCompletar, navigate]);

  // Mientras se valida, permite render para no parpadear (la propia ruta /completar-perfil ya es accesible)
  if (!checked && location.pathname !== "/completar-perfil") {
    return <div className="min-h-screen grid place-items-center text-xs text-muted-foreground">Cargando…</div>;
  }
  return <>{children}</>;
}