import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFeriadosActivos } from "@/lib/feriados.functions";
import { setFeriadosCache } from "@/lib/dias-habiles";

/**
 * Carga los feriados activos del año indicado, los inyecta al caché sincrono
 * de `dias-habiles` y devuelve un mapa fecha→nombre para la UI.
 */
export function useFeriados(anio: number) {
  const fList = useServerFn(listFeriadosActivos);
  const q = useQuery({
    queryKey: ["feriados-activos", anio],
    queryFn: () => fList({ data: { anio } }),
    staleTime: 10 * 60_000,
  });
  const map = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of (q.data as Array<{ fecha: string; nombre: string }> | undefined) ?? []) {
      m.set(f.fecha, f.nombre);
    }
    // Inyectamos el caché sincrónico durante el render (no en `useEffect`)
    // para que la primera pasada de render que ya tiene datos vea los
    // feriados personalizados en `motivoNoLaborableSV` / `esNoLaborableSV`.
    setFeriadosCache(anio, new Set(m.keys()));
    return m;
  }, [q.data]);
  return { map, isLoading: q.isLoading, refetch: q.refetch };
}