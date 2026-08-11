import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/lib/theme-context";
import { AppUpdateGate } from "@/components/AppUpdateGate";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "EA Service Connect" },
      { name: "description", content: "Plataforma de gestión operativa de EA Service & Consulting" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "EA Service Connect" },
      { property: "og:description", content: "Plataforma de gestión operativa de EA Service & Consulting" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "EA Service Connect" },
      { name: "twitter:description", content: "Plataforma de gestión operativa de EA Service & Consulting" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9584c68b-5118-4489-9c4c-b6bb07c8c80f/id-preview-d7f96237--4a1d8dfa-3473-4ec4-a07c-e2cd9feba391.lovable.app-1782202293031.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9584c68b-5118-4489-9c4c-b6bb07c8c80f/id-preview-d7f96237--4a1d8dfa-3473-4ec4-a07c-e2cd9feba391.lovable.app-1782202293031.png" },
      { name: "theme-color", content: "#0f172a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "EA Service" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
      { rel: "manifest", href: "/manifest.webmanifest?v=4" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png?v=4" },
      // Íconos con fondo sólido de marca: evita esquinas blancas al redondearse.
      // El sufijo ?v=4 fuerza a los navegadores a refrescar el favicon en caché.
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png?v=4" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png?v=4" },
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon.png?v=4" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png?v=4" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png?v=4" },
      // Variante para esquemas claros (barras claras): mismo emblema navy con borde de separación
      {
        rel: "icon",
        type: "image/png",
        sizes: "64x64",
        href: "/favicon-light.png?v=4",
        media: "(prefers-color-scheme: light)",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "64x64",
        href: "/favicon.png?v=4",
        media: "(prefers-color-scheme: dark)",
      },
      // Fallback para clientes que sólo piden /favicon.ico
      { rel: "shortcut icon", href: "/favicon.ico?v=4" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('easc-theme');var sys=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=(t==='dark')||((t==='system'||!t)&&sys);if(d)document.documentElement.classList.add('dark');document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // Registro del service worker (solo app publicada; ver src/lib/pwa.ts).
    void import("@/lib/pwa").then((m) => m.registerServiceWorker());
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
        <AppUpdateGate />
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
