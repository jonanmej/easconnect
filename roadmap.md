# Lote A — Disponibilidad, asignaciones y permisos de IA
- [x] Unificar disponibilidad del cliente con días hábiles, feriados y días movidos; ampliar el rango de la función sin exponer OT ajenas.
- [x] Añadir pruebas de expansión y comparar julio–diciembre de 2026: 98 días ocupados en ambos, sin diferencias.
- [x] Distinguir carga, error, caché sin conexión y lista vacía en Asignaciones técnicas, sin tocar la cola de evidencias.
- [x] Exigir admin/supervisor en generarReporte y verificar el control de generarEjecutivoDesdeDiarios.
- [x] Verificar tipos y 58 pruebas; revisar la definición de privacidad y las filas enmascaradas equivalentes con datos reales.
- [ ] Llamar getDisponibilidad con una sesión administrativa y revisar Asignaciones técnicas sin conexión a 390 px: no hay sesión; la cuenta temporal requiere una aprobación no disponible en este entorno.

# Inicio según rol
- [x] Priorizar firmas del cliente y mostrar asignaciones de hoy al técnico con consultas existentes.
- [x] Verificar tipos y pruebas (38 aprobadas).
- [x] Revisar panel del administrador a 1280/390 px con sesión real, sin desbordamiento ni errores.
- [ ] Revisar paneles de cliente y técnico a 1280/390 px: falta sesión de esos roles; la disponible es de administrador.

# Fase 7 — Claude en reportes (Claude Sonnet 5 aceptado)
- [x] Restaurar exactamente permisos previos de ambos generadores.
- [x] Copias sin PDF base64, límite de 512 KiB y limpieza al emitir/eliminar.
- [x] Activación por cualquier administrador, con historial.
- [x] Pruebas simuladas (30 aprobadas) y tipos sin errores.
- [x] Generación con Lovable usando una sesión real de administrador.
- [ ] Prueba con una sesión de cliente: no hay una cuenta cliente de prueba (revisión hecha solo en el código).
- [ ] Activar Claude y probarlo: lo hará el dueño.

# Fase 6 — Adaptabilidad
- [ ] Calendario del cliente con sesión de cliente; dispositivo real iOS/Android.
