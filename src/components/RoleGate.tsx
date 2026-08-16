import { useRouterState, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { canAccessWithEmail, highestRole, ROLE_LABEL } from "@/lib/roles";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

export function RoleGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center text-xs text-muted-foreground uppercase tracking-widest">
        Cargando permisos…
      </div>
    );
  }

  if (!canAccessWithEmail(roles, pathname, user?.email)) {
    const role = highestRole(roles);
    return (
      <div className="flex-1 grid place-items-center px-6">
        <div className="max-w-md text-center border border-border rounded-lg p-8 bg-card">
          <div className="size-10 rounded-full bg-secondary grid place-items-center mx-auto">
            <Lock className="size-5 text-muted-foreground" />
          </div>
          <h2 className="mt-4 font-semibold">Acceso restringido</h2>
          <p className="text-xs text-muted-foreground mt-2">
            {role
              ? `Tu rol (${ROLE_LABEL[role]}) no tiene permisos para ver esta sección.`
              : "Tu cuenta aún no tiene un rol asignado. Contacta al administrador."}
          </p>
          <Link
            to="/"
            className="inline-flex mt-4 text-xs font-medium text-primary hover:underline"
          >
            Volver al dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}