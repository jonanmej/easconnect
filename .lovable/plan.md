# Fase 4 — Calendario operativo, evidencia visual y notificaciones

Estado: **completado** (calendario + evidencia + base de notificaciones). El envío real de email queda condicionado a la configuración del dominio de Lovable Emails.

Cierro los temas pendientes de la Fase 3 (`out of scope`): una **programación tipo calendario real**, **fotos adjuntas en trabajos** vía Storage, y **notificaciones por email** a clientes cuando se publica un reporte o se completa un trabajo. Con esto el ciclo operativo queda completo de punta a punta.

## 1. Programación tipo calendario

**UI `/programacion`**
- Vista semanal y mensual con `react-day-picker` (ya instalado) + grilla custom de horarios.
- Cada `trabajo` aparece como bloque, color por tipo (inspección / mantenimiento / reparación) y borde por estado.
- Drag-and-drop entre días/franjas para reprogramar (actualiza `fecha_programada` del trabajo).
- Drag entre filas de técnico para reasignar (`tecnico_id`).
- Filtros por planta, técnico y tipo.
- Click en bloque → diálogo de detalle / edición rápida.

**Backend**
- Nueva server fn `reprogramarTrabajo({ id, fecha_programada, tecnico_id? })` — admin / supervisor.
- Reutiliza el RLS existente de `trabajos`.

## 2. Evidencia fotográfica de campo

**Storage**
- Bucket `trabajos-evidencia` (privado).
- Política: técnico/admin/supervisor suben a `trabajos/{trabajo_id}/...`; cliente solo lee las de sus trabajos.

**Tabla `trabajo_evidencias`**
- `trabajo_id`, `storage_path`, `descripcion`, `subido_por`, `created_at`.

**UI**
- En el diálogo de detalle de un trabajo: zona de carga (drag-drop), galería con thumbnails y lightbox.
- Visible en `/trabajos` para cliente (solo lectura) y en el detalle del reporte si la foto pertenece al periodo cubierto.

## 3. Notificaciones por email

**Connector**
- Usar el connector **Resend** vía Lovable Gateway (sin API key manual).
- Si el usuario no lo tiene linkeado, lo pido al inicio de la fase.

**Server fns / triggers**
- `enviarReporteCliente(reporte_id)` — admin/supervisor. Renderiza el markdown a HTML inline, envía al email del contacto del cliente y marca el reporte como `enviado`.
- Trigger en `trabajos`: cuando pasa a `completado` y la planta tiene `notificaciones_completado = true`, encola un email resumen al cliente (vía server route `/api/public/hooks/notify-trabajo` llamada desde un pg_net después del UPDATE).

**UI**
- Switch "Notificar al cliente al completar trabajos" en la ficha de `plantas`.
- En `/reportes`, el botón "Marcar como enviado" pasa a "Enviar al cliente" cuando hay email configurado, con preview del HTML antes de enviar.

## 4. Dashboard

- Nuevo KPI "Trabajos reprogramados esta semana".
- Card "Próximos 7 días" con mini-calendario que enlaza a `/programacion`.

## Detalles técnicos

- **Migraciones (3):** `trabajo_evidencias` + bucket + policies, columnas nuevas en `plantas` (`notificaciones_completado`, `email_notificaciones`) y en `reportes` (`enviado_a`, `enviado_at`), trigger de notificación.
- **Server functions nuevas:** `reprogramarTrabajo`, `subirEvidencia` (firma URL), `listarEvidencias`, `eliminarEvidencia`, `enviarReporteCliente`.
- **Server route pública:** `/api/public/hooks/notify-trabajo` con verificación HMAC, llamada por `pg_net` desde el trigger.
- **Componentes nuevos:** `CalendarioTrabajos`, `EvidenciaUploader`, `EvidenciaGallery`, `EmailPreviewDialog`.
- **Sin cambios en `mock-data.ts`:** `agendaHoy` se reemplaza por una consulta real a `trabajos` del día.

## Fuera de alcance

- Exportes PDF (queda para Fase 5 junto con branding del cliente).
- App móvil nativa.
- Push notifications.

## Notas de implementación

- Envío de email todavía no está conectado: se prepararon las columnas (`plantas.notificaciones_completado`, `plantas.email_notificaciones`, `reportes.enviado_a`, `reportes.enviado_at`) y la UI ya recoge el email del cliente. Falta configurar dominio de Lovable Emails para escribir las plantillas y conectar el trigger.

¿Procedo con Fase 4 así, o quieres ajustar prioridades (por ejemplo, hacer solo calendario + emails y dejar evidencia para después)?
