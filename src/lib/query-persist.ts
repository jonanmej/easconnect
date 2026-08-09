/**
 * Persiste la caché de TanStack Query en IndexedDB para que la app se pueda
 * consultar sin conexión (modo lectura desde caché) y se hidrate al instante
 * al volver a abrirla. Solo se ejecuta en el navegador.
 */
import type { QueryClient } from "@tanstack/react-query";

const CACHE_KEY = "easc-query-cache-v1";
/** 7 días: pasado ese tiempo la caché se descarta por completo. */
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let started = false;

export function startQueryPersistence(queryClient: QueryClient) {
  if (typeof window === "undefined" || started) return;
  started = true;
  void (async () => {
    try {
      const [{ persistQueryClient }, { createAsyncStoragePersister }, idb] = await Promise.all([
        import("@tanstack/react-query-persist-client"),
        import("@tanstack/query-async-storage-persister"),
        import("idb-keyval"),
      ]);
      const store = idb.createStore("easc-cache", "query-cache");
      const persister = createAsyncStoragePersister({
        key: CACHE_KEY,
        throttleTime: 1500,
        storage: {
          getItem: (k) => idb.get(k, store).then((v) => (v ?? null) as string | null),
          setItem: (k, v) => idb.set(k, v, store),
          removeItem: (k) => idb.del(k, store),
        },
      });
      await persistQueryClient({
        queryClient,
        persister,
        maxAge: MAX_AGE,
        buster: "v1",
        dehydrateOptions: {
          // No guardamos consultas con error ni datos efímeros de firma/token.
          shouldDehydrateQuery: (q) =>
            q.state.status === "success" &&
            !String(q.queryHash).includes("aprobacion") &&
            !String(q.queryHash).includes("firma"),
        },
      });
    } catch (e) {
      console.warn("[query-persist] no disponible", e);
    }
  })();
}
