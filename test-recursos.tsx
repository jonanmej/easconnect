import { pdf } from "@react-pdf/renderer";
import { createElement } from "react";
import { RecursosDoc } from "./src/lib/pdf/RecursosDoc";

const data = {
  folio: "T-2026-0033",
  cliente: "HILADOS ROTORTEX S.A DE C.V",
  planta: "C.T.I Rotortex",
  servicio: "Visita técnica",
  fecha: "8/7/2026",
  estado: "programado",
  tecnico: "Juan Pérez",
  trabajo_a_realizar: "Visita técnica",
  fecha_entrada: "8/7/2026",
  fecha_salida: "3/7/2026",
  elaborado_por: "Juan Pérez",
  recursos: [
    { categoria: "equipo", descripcion: "Multímetro digital", cantidad: 1, unidad: "unidad", entregado: false, devuelto: false },
    { categoria: "herramienta", descripcion: "Juego de llaves allen", cantidad: 2, unidad: "juegos", entregado: false, devuelto: false },
    { categoria: "epp", descripcion: "Guantes dieléctricos", cantidad: 3, unidad: "pares", entregado: false, devuelto: false },
  ],
  emitido_at: new Date().toISOString(),
};

async function main() {
  const blob = await pdf(createElement(RecursosDoc, { data }) as any).toBlob();
  const buf = await blob.arrayBuffer();
  await Bun.write("/tmp/test-recursos.pdf", new Uint8Array(buf));
  console.log("PDF guardado en /tmp/test-recursos.pdf");
}

main();
