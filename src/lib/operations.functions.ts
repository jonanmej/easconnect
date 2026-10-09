/**
 * Punto de entrada de las funciones operativas. La implementación vive en
 * src/lib/operations/* (clientes y plantas, equipos, trabajos, reprogramación, panel).
 */
export { listClientes, upsertCliente, deleteCliente, listPlantas, upsertPlanta, deletePlanta, importPlantasCSV } from "./operations/clientes-plantas.functions";
export { listEquipos, upsertEquipo, deleteEquipo } from "./operations/equipos.functions";
export { listTrabajos, upsertTrabajo, deleteTrabajo, crearTrabajoHistorico, listTecnicos, verificarConflictoTecnico, listAsignacionesLog } from "./operations/trabajos.functions";
export { reprogramarTrabajo, reubicarTrabajoDisponible, moverDiaTrabajo, listTrabajoTecnicosExtra } from "./operations/reprogramacion.functions";
export { dashboardStats } from "./operations/dashboard.functions";
