// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      mcpPlugin(),
      VitePWA({
        // "prompt": la versión nueva queda en espera hasta que el usuario acepta
        // instalarla (ver src/components/AppUpdateGate.tsx).
        registerType: "prompt",
        injectRegister: null,
        devOptions: { enabled: false },
        filename: "sw.js",
        manifest: false,
        workbox: {
          skipWaiting: false,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          // Nunca se precachea HTML: una página guardada de un build anterior
          // apunta a CSS/JS que ya no existen y la app se ve "desconfigurada".
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/\.mcp/, /^\/lovable\//],
          // El código y los estilos nunca se precachean. Mantenerlos aquí podía
          // conservar una página nueva junto a CSS/JS de una publicación vieja.
          // Los recursos visuales sí son seguros porque no controlan el layout.
          globPatterns: ["**/*.{svg,png,woff2}"],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "easc-html-v3", networkTimeoutSeconds: 5 },
            },
            {
              // CSS y JS siempre se revalidan contra el servidor: así una versión
              // nueva nunca queda mezclada con estilos de un build anterior
              // (causa de vistas "desconfiguradas" en la app instalada).
              urlPattern: ({ url, request }) =>
                url.origin === self.location.origin &&
                ["style", "script", "worker"].includes(request.destination),
              handler: "NetworkFirst",
              options: { cacheName: "easc-code-v3", networkTimeoutSeconds: 5 },
            },
            {
              urlPattern: ({ url, request }) =>
                url.origin === self.location.origin &&
                ["font", "image"].includes(request.destination),
              handler: "CacheFirst",
              options: {
                cacheName: "easc-media-v3",
                expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
          ],
        },
      }),
    ],
  },
});
