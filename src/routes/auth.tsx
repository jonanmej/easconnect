import { Button } from "@/components/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { ChemitekLogo } from "@/components/logos/ChemitekLogo";
import { useServerFn } from "@tanstack/react-start";
import { solicitarResetPassword } from "@/lib/password-reset.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" && s.next.startsWith("/") ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Iniciar sesión · EA Service Connect" },
      {
        name: "description",
        content:
          "Accede a EA Service Connect para gestionar plantas solares y térmicas, órdenes de trabajo, reportes técnicos y programación de servicios.",
      },
      { property: "og:title", content: "Iniciar sesión · EA Service Connect" },
      {
        property: "og:description",
        content:
          "Ingreso al sistema de gestión operativa de EA Service & Consulting: plantas, órdenes de trabajo y reportes.",
      },
      { property: "og:url", content: "https://easconnect.lovable.app/auth" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://easconnect.lovable.app/auth" }],
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

  const aliados = (dark: boolean) => (
    <div className="flex items-center gap-6">
      {dark ? (
        <BrandLogo variant="chemitek" themeOverride="dark" className="h-8 w-auto object-contain" />
      ) : (
        <ChemitekLogo className="h-8 w-auto" />
      )}
      <span className={dark ? "h-6 w-px bg-sidebar-border" : "h-6 w-px bg-border"} aria-hidden />
      <BrandLogo
        variant="pvstop"
        themeOverride={dark ? "dark" : undefined}
        className="h-8 w-auto object-contain"
      />
    </div>
  );

  return (
    <div className="auth-screen min-h-dvh flex flex-col lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] bg-background">
      {/* Panel de marca */}
      <aside className="auth-brand safe-top safe-x bg-sidebar text-sidebar-foreground flex items-center justify-center lg:flex-col lg:items-stretch lg:justify-between">
        <BrandLogo
          variant="ea-connect"
          themeOverride="dark"
          className="h-12 lg:h-16 w-auto object-contain lg:self-start"
        />
        <div className="hidden lg:block max-w-lg">
          <p className="text-sm font-medium text-sidebar-foreground/80">Sistema de operaciones solares</p>
          <h2 className="mt-3 font-display text-4xl xl:text-5xl font-bold leading-tight text-sidebar-accent-foreground">
            Servicio contratado, realizado y documentado.
          </h2>
          <p className="mt-4 text-base text-sidebar-foreground/85 leading-relaxed">
            Plantas, órdenes de trabajo, programación y reportes técnicos de EA Service &amp;
            Consulting en un solo lugar.
          </p>
        </div>
        <div className="hidden lg:block">
          <p className="text-sm font-medium text-sidebar-foreground/80 mb-3">Aliados estratégicos</p>
          {aliados(true)}
        </div>
      </aside>

      {/* Formulario */}
      <main className="auth-main safe-bottom flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-bold text-foreground">Iniciar sesión</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Acceso restringido. Las cuentas se crean por invitación del administrador.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="auth-email" className="text-sm font-semibold block mb-1.5">
                Correo electrónico
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-[46px] bg-background border border-input rounded-md px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3 mb-1.5 leading-5">
                <label htmlFor="auth-password" className="text-sm font-semibold">
                  Contraseña
                </label>
                <Button
                  type="button"
                  onClick={() => {
                    setForgotOpen((v) => !v);
                    setForgotEmail(email);
                    setForgotResult(null);
                    setForgotError(null);
                  }}
                  variant="link"
                  className="h-auto min-h-11 -my-3 p-0 text-sm leading-5"
                  aria-expanded={forgotOpen}
                >
                  ¿Olvidaste tu contraseña?
                </Button>
              </div>
              <input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[46px] bg-background border border-input rounded-md px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-md text-sm font-semibold disabled:opacity-60"
            >
              {busy ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>

          {forgotOpen && (
            <form
              onSubmit={onForgotSubmit}
              className="mt-4 p-4 rounded-md border border-border bg-secondary/40 space-y-3"
            >
              <p className="text-sm text-muted-foreground">
                Ingresa tu correo y, opcionalmente, un mensaje. Un administrador recibirá tu
                solicitud y te enviará una nueva contraseña temporal.
              </p>
              <div>
                <label htmlFor="auth-forgot-email" className="text-sm font-semibold block mb-1.5">Correo</label>
                <input
                  id="auth-forgot-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full h-[46px] bg-background border border-input rounded-md px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                />
              </div>
              <div>
                <label htmlFor="auth-forgot-msg" className="text-sm font-semibold block mb-1.5">Mensaje (opcional)</label>
                <textarea
                  id="auth-forgot-msg"
                  rows={2}
                  value={forgotMsg}
                  onChange={(e) => setForgotMsg(e.target.value)}
                  placeholder="Detalla brevemente tu situación si lo deseas"
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              {forgotError && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                  {forgotError}
                </p>
              )}
              {forgotResult && (
                <p className="text-sm text-accent bg-accent/10 border border-accent/30 rounded-md px-3 py-2">
                  {forgotResult}
                </p>
              )}
              <Button
                type="submit"
                disabled={forgotBusy}
                className="w-full h-12 rounded-md text-sm font-semibold disabled:opacity-60"
              >
                {forgotBusy ? "Enviando…" : "Enviar solicitud al administrador"}
              </Button>
            </form>
          )}

        </div>

        <div className="lg:hidden w-full max-w-sm mt-10 pt-6 border-t border-border flex flex-col items-center">
          <p className="text-sm text-muted-foreground mb-3">Aliados estratégicos</p>
          {aliados(false)}
        </div>
      </main>
    </div>
  );
}
