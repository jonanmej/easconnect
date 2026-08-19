/**
 * Opciones de un <select> de plantas agrupadas por cliente (<optgroup>).
 * Se usa en toda la app para que la lista de plantas se lea ordenada y
 * formal: primero el cliente, luego sus plantas en orden alfabético.
 */
type PlantaLike = {
  id: string;
  nombre: string;
  cliente_nombre?: string | null;
  clientes?: { nombre?: string | null } | null;
};

export function nombreCliente(p: PlantaLike): string {
  return (p.cliente_nombre ?? p.clientes?.nombre ?? "Sin cliente").trim() || "Sin cliente";
}

export function agruparPorCliente<T extends PlantaLike>(plantas: T[]): Array<{ cliente: string; plantas: T[] }> {
  const grupos = new Map<string, T[]>();
  for (const p of plantas ?? []) {
    const k = nombreCliente(p);
    const arr = grupos.get(k) ?? [];
    arr.push(p);
    grupos.set(k, arr);
  }
  return Array.from(grupos.entries())
    .map(([cliente, ps]) => ({
      cliente,
      plantas: [...ps].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    }))
    .sort((a, b) => a.cliente.localeCompare(b.cliente, "es"));
}

export function PlantaOptions({ plantas }: { plantas: PlantaLike[] | undefined | null }) {
  const grupos = agruparPorCliente(plantas ?? []);
  return (
    <>
      {grupos.map((g) => (
        <optgroup key={g.cliente} label={g.cliente}>
          {g.plantas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}