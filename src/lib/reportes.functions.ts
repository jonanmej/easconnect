/**
 * Punto de entrada de las funciones de reportes. La implementación vive en
 * src/lib/reportes/* (consultas, generación, PDF y ejecutivo desde diarios).
 */
export { listReportes, getReporte, marcarReporteEnviado, eliminarReporte, resetDatosOperacionales, getResponsableReporte } from "./reportes/consultas.functions";
export { generarReporte } from "./reportes/generar.functions";
export { getReporteParaPDF } from "./reportes/pdf.functions";
export { generarEjecutivoDesdeDiarios } from "./reportes/ejecutivo.functions";
