import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, X, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { importPlantasCSV } from "@/lib/operations.functions";

// CSV parser que soporta comillas, comas y saltos de línea dentro de campos
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',' || c === ';') { cur.push(field); field = ""; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        cur.push(field); field = "";
        if (cur.some((v) => v.length)) rows.push(cur);
        cur = [];
      } else { field += c; }
    }
  }
  if (field.length || cur.length) { cur.push(field); if (cur.some((v) => v.length)) rows.push(cur); }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
}

const COLUMNAS_VALIDAS = ["cliente", "planta", "ubicacion", "paneles", "capacidad", "email_notificaciones"];
const COLUMNAS_REQUERIDAS = ["cliente", "planta"];

const PLANTILLA = `cliente,planta,ubicacion,paneles,capacidad,email_notificaciones
ACME Solar,Planta Norte,San Salvador,1200,500 kW,avisos@acme.com
ACME Solar,Planta Sur,La Libertad,800,320 kW,
`;

export function ImportPlantasCSV({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const importFn = useServerFn(importPlantasCSV);
  const [filename, setFilename] = useState<string>("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    total: number; creadas: number; actualizadas: number; errores: { fila: number; error: string }[];
  } | null>(null);

  const run = useMutation({
    mutationFn: () => importFn({ data: { rows } }),
    onSuccess: (r: any) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["plantas"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      if (r.errores.length === 0) {
        toast.success(`Importadas ${r.creadas} nuevas, ${r.actualizadas} actualizadas`);
      } else {
        toast.warning(`Procesadas con ${r.errores.length} errores`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onFile(file: File) {
    setResult(null);
    setParseError(null);
    setRows([]);
    setFilename(file.name);
    if (file.size > 2 * 1024 * 1024) {
      setParseError("Archivo demasiado grande (máx 2 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = parseCSV(text);
        if (parsed.length === 0) { setParseError("CSV vacío o sin datos."); return; }
        if (parsed.length > 2000) { setParseError("Máximo 2000 filas por importación."); return; }
        const headers = Object.keys(parsed[0]);
        const faltan = COLUMNAS_REQUERIDAS.filter((c) => !headers.includes(c));
        if (faltan.length) { setParseError(`Faltan columnas requeridas: ${faltan.join(", ")}`); return; }
        const extras = headers.filter((h) => !COLUMNAS_VALIDAS.includes(h));
        if (extras.length) {
          toast.warning(`Columnas ignoradas: ${extras.join(", ")}`);
        }
        setRows(parsed);
      } catch (e: any) {
        setParseError(`Error al leer CSV: ${e.message}`);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function descargarPlantilla() {
    const blob = new Blob([PLANTILLA], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-plantas.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Importar plantas desde CSV</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Asigna plantas a clientes existentes en lote.
            </p>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-md hover:bg-secondary" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4 flex-1">
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Columnas:</strong> <code>cliente</code>, <code>planta</code> (requeridas); <code>ubicacion</code>, <code>paneles</code>, <code>capacidad</code>, <code>email_notificaciones</code> (opcionales).</p>
            <p>El cliente debe existir ya registrado (se busca por nombre, sin distinguir mayúsculas). Si la planta ya existe en ese cliente, se actualizan sus datos.</p>
            <button onClick={descargarPlantilla} className="text-primary hover:underline inline-flex items-center gap-1 mt-1">
              <FileText className="size-3" /> Descargar plantilla
            </button>
          </div>

          <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:border-primary/50 transition-colors">
            <Upload className="size-6 text-muted-foreground mb-2" />
            <span className="text-sm font-medium">{filename || "Seleccionar archivo CSV"}</span>
            <span className="text-[10px] text-muted-foreground mt-1">UTF-8, separador coma o punto y coma</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
          </label>

          {parseError && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <p>{parseError}</p>
            </div>
          )}

          {rows.length > 0 && !result && (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-secondary/50 text-xs font-medium flex items-center justify-between">
                <span>{rows.length} fila{rows.length === 1 ? "" : "s"} detectada{rows.length === 1 ? "" : "s"}</span>
                <span className="text-muted-foreground">Vista previa (primeras 5)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/30">
                    <tr>
                      {Object.keys(rows[0]).map((h) => (
                        <th key={h} className={`text-left px-2 py-1 font-medium ${COLUMNAS_VALIDAS.includes(h) ? "" : "text-muted-foreground/60 line-through"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {Object.values(r).map((v, j) => (
                          <td key={j} className="px-2 py-1 truncate max-w-[180px]">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm bg-primary/10 p-3 rounded-md">
                <CheckCircle2 className="size-4 text-primary" />
                <span>
                  {result.creadas} creada{result.creadas === 1 ? "" : "s"} ·{" "}
                  {result.actualizadas} actualizada{result.actualizadas === 1 ? "" : "s"} ·{" "}
                  {result.errores.length} con error
                </span>
              </div>
              {result.errores.length > 0 && (
                <div className="max-h-56 overflow-y-auto border border-destructive/30 rounded-md bg-destructive/5">
                  <table className="w-full text-xs">
                    <thead className="bg-destructive/10 sticky top-0">
                      <tr><th className="text-left px-2 py-1">Fila</th><th className="text-left px-2 py-1">Error</th></tr>
                    </thead>
                    <tbody>
                      {result.errores.map((e, i) => (
                        <tr key={i} className="border-t border-destructive/20">
                          <td className="px-2 py-1 font-mono">{e.fila || "—"}</td>
                          <td className="px-2 py-1 text-destructive">{e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-xs font-medium border border-border rounded-md hover:bg-secondary">
            {result ? "Cerrar" : "Cancelar"}
          </button>
          {!result && (
            <button
              onClick={() => run.mutate()}
              disabled={rows.length === 0 || run.isPending}
              className="h-9 px-4 text-xs font-medium bg-primary text-primary-foreground rounded-md disabled:opacity-50"
            >
              {run.isPending ? "Importando…" : `Importar ${rows.length || ""} fila${rows.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}