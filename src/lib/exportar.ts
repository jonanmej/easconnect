/**
 * Utilidades cliente-side para exportar filas a CSV y Excel (xlsx).
 * No requiere backend: descarga directa desde el navegador respetando
 * los filtros que el usuario ya aplicó en pantalla.
 */

export type Row = Record<string, unknown>;

function coerce(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function csvEscape(v: unknown): string {
  const s = coerce(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Descarga un CSV UTF-8 con BOM (Excel lo abre correctamente en Windows). */
export function exportarCSV(rows: Row[], filename: string, headers?: string[]) {
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const lines = [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

/** Descarga un XLSX usando SheetJS (bundle client-side). */
export async function exportarXLSX(
  rows: Row[],
  filename: string,
  sheetName = "Datos",
) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

/** Aplana un listado de trabajos a filas planas listas para exportar. */
export function trabajosARows(
  trabajos: any[],
  tecnicoNombrePorId?: Map<string, string> | Record<string, string>,
): Row[] {
  const getTec = (id: string | null | undefined) => {
    if (!id) return "";
    if (!tecnicoNombrePorId) return "";
    if (tecnicoNombrePorId instanceof Map) return tecnicoNombrePorId.get(id) ?? "";
    return (tecnicoNombrePorId as Record<string, string>)[id] ?? "";
  };
  return trabajos.map((t) => ({
    Folio: t.folio ?? "",
    Cliente: t.cliente_nombre ?? "",
    Planta: t.planta_nombre ?? "",
    Servicio: t.servicio ?? "",
    Estado: t.estado ?? "",
    "Fecha programada": t.fecha_programada
      ? new Date(t.fecha_programada).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" })
      : "",
    "Duración (días)": t.duracion_dias ?? 1,
    Técnico: t.tecnico_nombre ?? getTec(t.tecnico_id) ?? "",
    Notas: t.notas ?? "",
  }));
}

/** Aplana el listado de reportes a filas para exportar. */
export function reportesARows(reportes: any[]): Row[] {
  return reportes.map((r) => ({
    Título: r.titulo ?? "",
    Cliente: r.cliente_nombre ?? "",
    Planta: r.planta_nombre ?? "",
    Periodo: r.periodo ?? "",
    Estado: r.estado ?? "",
    Modelo: r.model_used ?? "",
    "Resumen (IA)": r.insight_resumen ?? "",
    Creado: r.created_at
      ? new Date(r.created_at).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador" })
      : "",
  }));
}
