import ExcelJS from "exceljs";

export type ColDef<T> = {
  header: string;
  key: keyof T & string;
  width?: number;
  format?: string;
  fn?: (row: T) => string | number | Date | null | undefined;
};

/** Genera y descarga un xlsx con una o varias hojas. Formato es-SV (USD). */
export async function exportarExcel<T extends Record<string, any>>(opts: {
  filename: string;
  hojas: { nombre: string; columnas: ColDef<T>[]; filas: T[]; total?: string[] }[];
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EA Service Connect";
  wb.created = new Date();

  for (const hoja of opts.hojas) {
    const ws = wb.addWorksheet(hoja.nombre.slice(0, 30), {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = hoja.columnas.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 18,
      style: c.format ? { numFmt: c.format } : undefined,
    }));
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
    });
    hoja.filas.forEach((r) => {
      const obj: Record<string, any> = {};
      hoja.columnas.forEach((c) => { obj[c.key] = c.fn ? c.fn(r) : (r as any)[c.key]; });
      ws.addRow(obj);
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnas.length } };
    if (hoja.total && hoja.filas.length > 0) {
      const totalRow = ws.addRow({});
      totalRow.font = { bold: true };
      hoja.total.forEach((key) => {
        const colIdx = hoja.columnas.findIndex((c) => c.key === key);
        if (colIdx >= 0) {
          const letter = ws.getColumn(colIdx + 1).letter;
          totalRow.getCell(colIdx + 1).value = { formula: `SUM(${letter}2:${letter}${hoja.filas.length + 1})` } as any;
        }
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Formato de fecha es-SV (DD/MM/YYYY HH:mm). */
export function fmtFechaSV(d?: string | Date | null) {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  if (isNaN(x.getTime())) return "";
  return x.toLocaleString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtMonedaSV(n?: number | null) {
  if (n == null) return "";
  return n.toLocaleString("es-SV", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}