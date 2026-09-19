import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Sun, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { completarMiPerfil, getMyProfile } from "@/lib/profile.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/completar-perfil")({
  head: () => ({
    meta: [{ title: "Completar perfil · EA Service Connect" }],
  }),
  component: CompletarPerfilPage,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">Error: {(error as Error)?.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">No encontrado.</div>,
});

function CompletarPerfilPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(completarMiPerfil);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => fetchProfile() });

  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [cargo, setCargo] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile.data) {
      setNombres(profile.data.nombres ?? "");
      setApellidos(profile.data.apellidos ?? "");
      setCargo(profile.data.cargo ?? "");
    }
  }, [profile.data]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const debeCambiar = !!(profile.data as any)?.debe_cambiar_password;
    if (debeCambiar && !password) {
      setError("Debes definir una nueva contraseña personal para continuar.");
      return;
    }
    if (password && password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password && password.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setBusy(true);
    try {
      if (password) {
        const { error: pwErr } = await supabase.auth.updateUser({ password });
        if (pwErr) throw new Error(pwErr.message);
      }
      await saveProfile({
        data: { nombres, apellidos, cargo, password_actualizada: !!password },
      });
      navigate({ to: "/" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const debeCambiar = !!(profile.data as any)?.debe_cambiar_password;

  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="size-9 bg-foreground rounded grid place-items-center">
            <Sun className="size-5 text-primary" />
          </div>
          <span className="font-semibold tracking-tight text-xl">EA Service Connect</span>
        </div>

        <div className="border border-border rounded-lg p-6 bg-card">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="size-5 text-primary" />
            <h1 className="text-lg font-semibold">Completa tu perfil</h1>
          </div>
          {debeCambiar && (
            <div className="mb-4 text-xs bg-primary/10 border border-primary/30 text-primary rounded-md px-3 py-2">
              Por seguridad, define una nueva contraseña personal. Esta acción es obligatoria antes de continuar.
            </div>
          )}
          <p className="text-xs text-muted-foreground mb-6">
            Para continuar, ingresa tus datos personales y, si lo deseas, asigna una nueva contraseña.
            Sesión activa: <span className="font-mono">{user?.email}</span>
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium block mb-1">Nombres</label>
                <input required value={nombres} onChange={(e) => setNombres(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Apellidos</label>
                <input required value={apellidos} onChange={(e) => setApellidos(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Cargo dentro de la empresa</label>
              <input required value={cargo} onChange={(e) => setCargo(e.target.value)}
                placeholder="Supervisor de Operaciones"
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>

            <div className="pt-2 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Asignación de nueva contraseña{" "}
                <span className="text-muted-foreground/70">
                  {debeCambiar ? "(obligatoria)" : "(opcional, recomendado en el primer ingreso)"}
                </span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium block mb-1">Nueva contraseña</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    required={debeCambiar}
                    minLength={8} autoComplete="new-password"
                    className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Confirmar contraseña</label>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    required={debeCambiar}
                    minLength={8} autoComplete="new-password"
                    className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy}
              className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
              {busy ? "Guardando…" : "Guardar y continuar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}