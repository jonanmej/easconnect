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
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/\.mcp/, /^\/lovable\//],
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "easc-html", networkTimeoutSeconds: 5 },
            },
            {
              urlPattern: ({ url, request }) =>
                url.origin === self.location.origin &&
                ["style", "script", "worker", "font", "image"].includes(request.destination),
              handler: "CacheFirst",
              options: {
                cacheName: "easc-assets",
                expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
          ],
        },
      }),
    ],
  },
});
