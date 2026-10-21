import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitCompareArrows, Check, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compararRedaccion, adoptarRedaccion, getReportAiSettings, setReportAiProvider } from "@/lib/reportes/comparacion.functions";
import type { ReportProvider } from "@/lib/reportes/ia-contract";

export function ReportAiControls({ owner }: { owner: boolean }) {
  const get = useServerFn(getReportAiSettings);
  const set = useServerFn(setReportAiProvider);
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["report-ai-settings"], queryFn: () => get() });
  const save = useMutation({ mutationFn: (data: { provider: ReportProvider; resume?: boolean }) => set({ data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["report-ai-settings"] }); toast.success("Proveedor de reportes actualizado"); },
    onError: (error: Error) => toast.error(error.message) });
  if (!owner || !settings.data) return null;
  return <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    <label htmlFor="report-ai-provider">IA de reportes</label>
    <select id="report-ai-provider" value={settings.data.provider} disabled={save.isPending}
      className="min-h-11 rounded-md border border-input bg-background px-3 text-foreground"
      onChange={(e) => save.mutate({ provider: e.target.value === "anthropic" ? "anthropic" : "lovable" })}>
      <option value="lovable">Lovable · actual</option><option value="anthropic">Claude Sonnet 5</option>
    </select>
    {settings.data.paused && <Button variant="outline" disabled={save.isPending}
      onClick={() => save.mutate({ provider: settings.data.provider, resume: true })}><Play /> Reanudar IA</Button>}
  </div>;
}

export function CompararRedaccion({ id }: { id: string }) {
  const compare = useServerFn(compararRedaccion);
  const adopt = useServerFn(adoptarRedaccion);
  const qc = useQueryClient();
  const [results, setResults] = useState<Awaited<ReturnType<typeof compararRedaccion>> | null>(null);
  const comparison = useMutation({ mutationFn: () => compare({ data: { id } }), onSuccess: setResults,
    onError: (error: Error) => toast.error(error.message) });
  const adoption = useMutation({ mutationFn: (token: string) => adopt({ data: { id, token } }),
    onSuccess: () => {
      setResults(null); toast.success("Redacción elegida guardada");
      qc.invalidateQueries({ queryKey: ["reportes"] }); qc.invalidateQueries({ queryKey: ["reporte", id] });
      qc.invalidateQueries({ queryKey: ["reporte-auditoria"] });
    }, onError: (error: Error) => toast.error(error.message) });
  return <section className="space-y-3 border-t border-border pt-4">
    <Button variant="outline" disabled={comparison.isPending || adoption.isPending}
      onClick={() => { setResults(null); comparison.mutate(); }}><GitCompareArrows />
      {comparison.isPending ? "Comparando…" : "Comparar redacción"}</Button>
    {comparison.error && <p role="alert" className="text-sm text-destructive">{comparison.error.message}</p>}
    {results && <div className="grid min-w-0 gap-4 md:grid-cols-2">{results.map((r) =>
      <article key={r.procedencia.proveedor} className="min-w-0 space-y-3 border border-border rounded-md p-3">
        <h3 className="font-semibold">{r.procedencia.proveedor === "anthropic" ? "Claude" : "Lovable"}</h3>
        <p className="break-all text-xs text-muted-foreground">{r.procedencia.modelo}</p>
        <h4 className="font-medium break-words">{r.texto.titulo}</h4>
        <p className="whitespace-pre-line break-words text-sm">{r.texto.resumen}</p>
        <h4 className="text-sm font-semibold">Hallazgos</h4><ul className="list-disc pl-4 text-sm space-y-2">{r.texto.hallazgos.map((h, i) => <li key={i} className="break-words">{h}</li>)}</ul>
        <h4 className="text-sm font-semibold">Recomendaciones</h4><ul className="list-disc pl-4 text-sm space-y-2">{r.texto.recomendaciones.map((h, i) => <li key={i} className="break-words">{h}</li>)}</ul>
        {r.cifras.length > 0 && <p className="text-sm text-destructive">Cifras sin respaldo: {r.cifras.join(", ")}</p>}
        <Button disabled={adoption.isPending} onClick={() => adoption.mutate(r.token)}><Check /> Elegir esta redacción</Button>
      </article>)}</div>}
  </section>;
}