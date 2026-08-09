/** Catálogo de categorías de correos automáticos configurables (cliente + servidor). */
export const EMAIL_CATEGORIAS = [
  {
    key: "trabajos_eventos",
    label: "Eventos de órdenes de trabajo",
    descripcion: "Inicio, avance, cierre y cancelación de OT (staff y contacto del cliente).",
  },
  {
    key: "asignacion_tecnico",
    label: "Asignación y reasignación de técnicos",
    descripcion: "Aviso al técnico cuando se le asigna o reasigna una OT.",
  },
  {
    key: "jornadas",
    label: "Jornadas laborales",
    descripcion: "Inicio/fin de jornada, almuerzo excedido y resumen diario de jornadas.",
  },
  {
    key: "staff_interno",
    label: "Avisos internos a administradores y supervisores",
    descripcion: "Reportes diarios, nuevas evidencias, flujo de reportes y emergencias en días no laborables.",
  },
  {
    key: "solicitudes_visita",
    label: "Solicitudes de visita",
    descripcion: "Nuevas solicitudes del cliente y su aprobación o rechazo.",
  },
  {
    key: "contratos",
    label: "Contratos y programación anual",
    descripcion: "Programación automática generada y reprogramaciones confirmadas.",
  },
  {
    key: "rutas",
    label: "Envío de rutas",
    descripcion: "Correos con la ruta diaria a los destinatarios seleccionados.",
  },
  {
    key: "avisos_programacion",
    label: "Recordatorios de visitas próximas",
    descripcion: "Avisos automáticos 30, 20, 10, 5 y 1 día antes de cada visita.",
  },
] as const;

export type EmailCategoriaKey = (typeof EMAIL_CATEGORIAS)[number]["key"];
export const EMAIL_CATEGORIAS_CONFIG_KEY = "email_notif_categorias";
