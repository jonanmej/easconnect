/**
 * Versión de la app y registro de cambios (changelog) que se muestra al usuario
 * después de instalar una actualización.
 *
 * IMPORTANTE: al publicar cambios relevantes, incrementa APP_VERSION y agrega
 * una entrada nueva al inicio de CHANGELOG.
 */
export const APP_VERSION = "1.5.1";

export type CambioVersion = {
  version: string;
  fecha: string;
  titulo: string;
  /** Resumen ejecutivo: una sola frase con el impacto para el usuario. */
  resumen: string;
  cambios: string[];
};

export const CHANGELOG: CambioVersion[] = [
  {
    version: "1.5.0",
    fecha: "2026-08-09",
    titulo: "Actualizaciones más claras",
    resumen: "Las actualizaciones se descargan en segundo plano y solo piden reiniciar al estar listas.",
    cambios: [
      "Aviso inmediato del resultado de la actualización (éxito o error).",
      "El botón para reiniciar aparece únicamente cuando la nueva versión ya se descargó.",
      "Vista de \"Cambios instalados\" en modo ejecutivo, con el detalle opcional.",
      "Soporte de actualización manual en iPhone y iPad cuando el navegador lo requiere.",
    ],
  },
  {
    version: "1.4.0",
    fecha: "2026-08-09",
    titulo: "Actualizaciones automáticas",
    resumen: "La app se actualiza sola en segundo plano y te avisa cuando está lista.",
    cambios: [
      "La app instalada detecta nuevas publicaciones y te invita a instalarlas.",
      "Nuevo aviso con el detalle de los cambios instalados.",
      "Mejoras de rendimiento y accesibilidad en listados y tablas.",
    ],
  },
  {
    version: "1.3.0",
    fecha: "2026-08-02",
    titulo: "Modo offline y sincronización",
    resumen: "Puedes trabajar sin señal: los reportes se sincronizan al volver la conexión.",
    cambios: [
      "Panel de sincronización con reintentos por reporte y fotografía.",
      "Consulta de datos y guardado de reportes sin conexión.",
      "Íconos de la app con fondo sólido de marca.",
    ],
  },
];

export function cambiosDesde(versionAnterior: string | null): CambioVersion[] {
  if (!versionAnterior) return CHANGELOG.slice(0, 1);
  const idx = CHANGELOG.findIndex((c) => c.version === versionAnterior);
  if (idx < 0) return CHANGELOG.slice(0, 1);
  return CHANGELOG.slice(0, idx);
}
