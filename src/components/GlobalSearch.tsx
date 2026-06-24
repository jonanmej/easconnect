import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Building2, Sun, Bot, ClipboardList, CalendarPlus } from "lucide-react";
import { globalSearch } from "@/lib/search.functions";

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const fSearch = useServerFn(globalSearch);
  const res = useQuery({
    queryKey: ["global-search", q],
    queryFn: () => fSearch({ data: { q } }),
    enabled: open && q.length >= 2,
    staleTime: 5_000,
  });

  useEffect(() => { if (!open) setQ(""); }, [open]);

  function go(to: string) { onOpenChange(false); setTimeout(() => navigate({ to }), 50); }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command shouldFilter={false}>
        <CommandInput placeholder="Buscar plantas, clientes, equipos, trabajos…" value={q} onValueChange={setQ} />
        <CommandList>
          {q.length < 2 && <CommandEmpty>Escriba al menos 2 caracteres.</CommandEmpty>}
          {q.length >= 2 && res.isLoading && <CommandEmpty>Buscando…</CommandEmpty>}
          {q.length >= 2 && !res.isLoading && !hasResults(res.data) && <CommandEmpty>Sin resultados.</CommandEmpty>}

          {res.data?.plantas?.length ? (
            <CommandGroup heading="Plantas">
              {res.data.plantas.map((p: any) => (
                <CommandItem key={p.id} onSelect={() => go("/plantas")}>
                  <Sun className="size-4 mr-2" /> {p.nombre}
                  <span className="ml-auto text-[10px] text-muted-foreground">{p.ubicacion ?? ""}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {res.data?.clientes?.length ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Clientes">
                {res.data.clientes.map((c: any) => (
                  <CommandItem key={c.id} onSelect={() => go("/clientes")}>
                    <Building2 className="size-4 mr-2" /> {c.nombre}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {res.data?.equipos?.length ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Equipos">
                {res.data.equipos.map((e: any) => (
                  <CommandItem key={e.id} onSelect={() => go("/equipos")}>
                    <Bot className="size-4 mr-2" /> {e.codigo} · {e.nombre}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {res.data?.trabajos?.length ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Trabajos">
                {res.data.trabajos.map((t: any) => (
                  <CommandItem key={t.id} onSelect={() => go("/trabajos")}>
                    <ClipboardList className="size-4 mr-2" /> {t.folio}
                    <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[180px]">{t.servicio}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {res.data?.solicitudes?.length ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Solicitudes">
                {res.data.solicitudes.map((s: any) => (
                  <CommandItem key={s.id} onSelect={() => go("/solicitudes")}>
                    <CalendarPlus className="size-4 mr-2" /> {s.tipo}
                    <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[180px]">{s.descripcion ?? ""}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function hasResults(d: any) {
  if (!d) return false;
  return ["plantas","clientes","equipos","trabajos","solicitudes"].some((k) => d[k]?.length);
}