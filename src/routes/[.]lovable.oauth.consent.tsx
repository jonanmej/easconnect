import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage,
  // absent on the SSR pass.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id:
      typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get(
      "authorization_id",
    )!;
    const { data, error } = await (supabase.auth as any).oauth.getAuthorizationDetails(
      authorizationId,
    );
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-destructive">
        No se pudo cargar la solicitud de autorización:{" "}
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await (supabase.auth as any).oauth.approveAuthorization(authorization_id)
      : await (supabase.auth as any).oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No se recibió URL de redirección del servidor de autorización.");
      return;
    }
    window.location.href = target;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm border border-border rounded-lg p-6 bg-card">
        <h1 className="text-lg font-semibold text-foreground">
          Conectar {(details as any)?.client?.name ?? "una aplicación"} a tu cuenta
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esto permitirá que{" "}
          <strong>{(details as any)?.client?.name ?? "el cliente"}</strong> consulte datos
          de EA Service Connect en tu nombre.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            Aprobar
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 border border-border bg-secondary text-foreground rounded-md py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-60"
          >
            Denegar
          </button>
        </div>
      </div>
    </div>
  );
}