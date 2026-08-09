import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Offline-first: si hay datos en caché se muestran de inmediato y solo
        // se refresca cuando hay red. Evita pantallas vacías con mala señal.
        networkMode: "offlineFirst",
        staleTime: 60_000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 2,
        refetchOnWindowFocus: false,
      },
      mutations: { networkMode: "offlineFirst", retry: 0 },
    },
  });

  if (typeof window !== "undefined") {
    void import("./lib/query-persist").then((m) => m.startQueryPersistence(queryClient));
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
