import React from "react";
import { renderToFile } from "@react-pdf/renderer";
import { ReporteDoc } from "./src/lib/pdf/ReporteDoc.tsx";

const data = {
  titulo: "Reporte Ejecutivo de Mantenimiento Solar – COESAR, S.A. de C.V. | Q2 2026",
  cliente: "COESAR, S.A. de C.V.",
  planta: "PLAZA MUNDO APOPA (PMA)",
  periodo: "Q2 2026",
  emitido_at: "24 de junio de 2026",
  modelo: null,
  resumen: "Durante el segundo trimestre de 2026 se ejecutó el plan de limpieza trimestral programado para la planta PLAZA MUNDO APOPA, conforme a los protocolos del Sistema de Gestión de la Calidad. Se inspeccionaron 1.248 paneles, se aplicó limpieza con agua desmineralizada y se documentó la totalidad de hallazgos con evidencia fotográfica georreferenciada.",
  hallazgos: [
    "Identificación de 2 paneles con micro-fisuras en la sección B-12, sin afectación operativa inmediata reportada.",
    "Presencia de acumulación de excremento de aves concentrado en los bordes este de la instalación.",
    "Conexiones MC4 inspeccionadas sin signos de corrosión, indicando buen estado general.",
    "El acceso a la azotea fue despejado y se verificó el uso completo de EPP antes del ingreso para el trabajo de limpieza.",
  ],
  recomendaciones: [
    "Programar el reemplazo preventivo de los 2 paneles con micro-fisuras en la sección B-12 dentro de los próximos 60 días.",
    "Evaluar la instalación de disuasores de aves específicos en el perímetro este para mitigar la acumulación de excremento.",
    "Mantener la cadencia actual de limpieza trimestral para asegurar un rendimiento óptimo de los paneles.",
    "Continuar con la inspección visual por string y el registro fotográfico en futuras intervenciones.",
  ],
  kpis: [
    { label: "Trabajos completados", value: "1 / 1" },
    { label: "Paneles intervenidos", value: "1.248" },
    { label: "Cumplimiento plan", value: "100%" },
    { label: "Incidentes HSE", value: "0" },
  ],
  trabajos: [
    { folio: "TR-2026-0421", servicio: "Limpieza de paneles solares", fecha: "2026-06-12", estado: "completado", tecnico: "Equipo Solar A", notas: "Limpieza ejecutada en jornada matutina sin novedades. Se respetó cronograma." },
  ],
  evidencias: [],
  graficas: [
    {
      titulo: "Trabajos por tipo de servicio",
      descripcion: "Distribución del periodo según servicio ejecutado.",
      fuente: "Tabla trabajos · campo servicio",
      unidad: "trabajos",
      series: [{ label: "Limpieza de paneles solares", value: 1 }],
    },
    {
      titulo: "Cumplimiento por planta",
      descripcion: "Porcentaje de cumplimiento del plan trimestral.",
      fuente: "Tabla trabajos vs planificación",
      unidad: "%",
      series: [{ label: "PLAZA MUNDO APOPA", value: 100 }],
    },
  ],
  responsable: "Jonathan Antonio Mejía Membreño",
  responsable_cargo: "Supervisor de Operaciones",
  documento_id: "1e774379-dd9b-4c58-86f8-414d030695cd",
  documento_codigo: "EA-REP-EJE-Q22026",
  documento_version: "1.0",
  documento_clasificacion: "Confidencial · Cliente",
  documento_hash: "3e1c70bad6e8c4eca59bcc4e8fc79333a64d9b38e64763d8eb2fb37fcaa4115a",
  retencion: "Retención documental: 5 años (ISO 15489-1)",
  modo: "ejecutivo",
};

await renderToFile(React.createElement(ReporteDoc, { data }), "/tmp/pdfqa/test.pdf");
console.log("ok");
