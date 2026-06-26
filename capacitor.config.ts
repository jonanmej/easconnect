import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for EA Service Connect.
 *
 * La app web es SSR (TanStack Start sobre Cloudflare Workers), por lo que el
 * contenedor nativo carga directamente la URL publicada en lugar de un bundle
 * estático. Cada vez que publicas en Lovable, los binarios iOS/Android ven los
 * cambios sin necesidad de recompilar.
 *
 * Para apuntar a la preview durante desarrollo, exporta CAP_SERVER_URL antes
 * de `npx cap sync`.
 */
const SERVER_URL =
  process.env.CAP_SERVER_URL ?? 'https://easconnect.lovable.app';

const config: CapacitorConfig = {
  appId: 'app.easervice.connect',
  appName: 'EA Service Connect',
  // webDir es obligatorio aunque usemos server.url; mantenemos dist como destino
  // por si más adelante migramos a build estático.
  webDir: 'dist',
  backgroundColor: '#0F172A',
  server: {
    url: SERVER_URL,
    cleartext: false,
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0F172A',
  },
  android: {
    backgroundColor: '#0F172A',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0F172A',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0F172A',
    },
  },
};

export default config;