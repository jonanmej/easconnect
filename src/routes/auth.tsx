import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { BrandLogo } from "@/components/BrandLogo";
import { ChemitekLogo } from "@/components/logos/ChemitekLogo";
import { useServerFn } from "@tanstack/react-start";
import { solicitarResetPassword } from "@/lib/password-reset.functions";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" && s.next.startsWith("/") ? s.next : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const goNext = () => {
    if (next && next.startsWith("/")) window.location.href = next;
    else navigate({ to: "/" });
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotResult, setForgotResult] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const fSolicitar = useServerFn(solicitarResetPassword);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });
  }, [navigate, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("Credenciales inválidas o cuenta inexistente. Contacta al administrador.");
      return;
    }
    goNext();
  }

  async function onForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotError(null);
    setForgotResult(null);
    setForgotBusy(true);
    try {
      await fSolicitar({ data: { email: forgotEmail, mensaje: forgotMsg } });
      setForgotResult(
        "Tu solicitud fue enviada. Un administrador te enviará una nueva contraseña a tu correo.",
      );
      setForgotEmail("");
      setForgotMsg("");
    } catch (err) {
      setForgotError((err as Error).message ?? "No se pudo enviar la solicitud.");
    } finally {
      setForgotBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri:
          next && next.startsWith("/")
            ? `${window.location.origin}${next}`
            : window.location.origin,
      });
      if (result.error) {
        const msg = (result.error as Error).message ?? "";
        if (/cancel|closed|popup/i.test(msg)) {
          setError("Inicio de sesión cancelado. Inténtalo de nuevo.");
        } else if (/network|fetch/i.test(msg)) {
          setError("Error de red al contactar a Google. Verifica tu conexión.");
        } else {
          setError(`No se pudo iniciar sesión con Google: ${msg || "error desconocido"}.`);
        }
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      goNext();
    } catch (e) {
      setError(`Fallo inesperado con Google: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <BrandLogo variant="ea-connect" className="h-32 w-auto object-contain" />
        </div>

        <div className="border border-border rounded-lg p-6 bg-card">
          <h1 className="text-lg font-semibold">Iniciar sesión</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Acceso restringido. Las cuentas se crean por invitación del administrador.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium block mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Ingresando…" : "Ingresar"}
            </button>
          </form>

          <div className="text-right mt-3">
            <button
              type="button"
              onClick={() => {
                setForgotOpen((v) => !v);
                setForgotEmail(email);
                setForgotResult(null);
                setForgotError(null);
              }}
              className="text-xs text-primary hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          {forgotOpen && (
            <form
              onSubmit={onForgotSubmit}
              className="mt-4 p-4 rounded-md border border-border bg-secondary/40 space-y-3"
            >
              <p className="text-xs text-muted-foreground">
                Ingresa tu correo y, opcionalmente, un mensaje. Un administrador recibirá tu
                solicitud y te enviará una nueva contraseña temporal.
              </p>
              <div>
                <label className="text-xs font-medium block mb-1">Correo</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Mensaje (opcional)</label>
                <textarea
                  rows={2}
                  value={forgotMsg}
                  onChange={(e) => setForgotMsg(e.target.value)}
                  placeholder="Detalla brevemente tu situación si lo deseas"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                />
              </div>
              {forgotError && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                  {forgotError}
                </p>
              )}
              {forgotResult && (
                <p className="text-xs text-accent bg-accent/10 border border-accent/30 rounded-md px-3 py-2">
                  {forgotResult}
                </p>
              )}
              <button
                type="submit"
                disabled={forgotBusy}
                className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                {forgotBusy ? "Enviando…" : "Enviar solicitud al administrador"}
              </button>
            </form>
          )}

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">O</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/80 disabled:opacity-60 transition-colors"
          >
            {busy ? (
              <span className="size-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
            ) : (
            <svg className="size-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            )}
            {busy ? "Conectando con Google…" : "Continuar con Google"}
          </button>
        </div>

        <div className="mt-6 pt-5 border-t border-border/60">
          <p className="text-[10px] text-muted-foreground text-center uppercase tracking-[0.18em] mb-3">
            Aliados estratégicos
          </p>
          <div className="flex items-center justify-center gap-6 opacity-80">
            <ChemitekLogo className="h-8 w-auto" />
            <span className="h-6 w-px bg-border" aria-hidden />
            <BrandLogo variant="pvstop" className="h-8 w-auto object-contain" />
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-6 uppercase tracking-widest">
          Sistema de Operaciones Solares
        </p>
      </div>
    </div>
  );
}