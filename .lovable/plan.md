
## Fase 5 — Reportes PDF, Notificaciones reales y Calendario del cliente

### 1. Generación y descarga de PDF ejecutivo

**Stack:** `@react-pdf/renderer` (puro JS, compatible con Worker SSR). Se genera del lado del cliente para evitar problemas con fuentes/imágenes en el runtime serverless.

**Estructura del PDF ejecutivo:**
- **Portada**: logo SOLAROS, nombre de planta, cliente, periodo, fecha de emisión, número de reporte.
- **Índice** auto-generado.
- **Resumen ejecutivo** (texto IA ya guardado en `reportes.contenido_md`).
- **KPIs** (tabla + barras simples dibujadas en SVG con react-pdf): trabajos completados/pendientes, % cumplimiento, horas operación, alertas.
- **Detalle de trabajos** del periodo (tabla con fecha, tipo, técnico, estado, observaciones).
- **Evidencias**: una página por trabajo con hasta 4 fotos en grilla. Se descargan vía URLs firmadas y se embeben como base64.
- **Pie de firma** (supervisor responsable + fecha).

**Reporte interno**: misma plantilla, sin portada elaborada y sin sección ejecutiva — solo tablas crudas y todas las evidencias.

**Botones en `/reportes`**: "Descargar PDF Ejecutivo" y "Descargar PDF Interno" junto a cada reporte. Loading state mientras se ensambla.

### 2. Envío real de correos con Gmail (proyectos@easervice.app)

**Decisión técnica:** No usaré Lovable Emails (requiere dominio propio delegado). Conectaré el connector **Gmail** que autentica esa cuenta Gmail del builder y envía vía Gmail API a través del gateway.

**Pasos:**
1. Conectar el connector `google_mail` con esa cuenta Gmail.
2. Crear server fn `sendNotificacionCompletado({ trabajoId })` que:
   - Verifica rol staff.
   - Carga trabajo + planta + cliente.
   - Si `plantas.notificaciones_completado=true` y hay `email_notificaciones`, construye email HTML (plantilla con branding SOLAROS) y lo envía vía `https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send`.
   - Registra el envío en tabla de auditoría (siguiente sección).
3. Botón manual "Enviar al cliente" en detalle de trabajo y en `/reportes` (envío del PDF como link de descarga firmado de 7 días, no como attachment).
4. Trigger automático: cuando un trabajo pasa a `completado` y la planta tiene notificaciones activas, encolar el envío vía server fn invocada desde el handler de update (no SQL trigger — Gmail necesita LOVABLE_API_KEY que solo existe en runtime de la app).

### 3. Auditoría de envíos de notificaciones

**Nueva tabla `notificaciones_log`:**
- `id`, `trabajo_id`, `planta_id`, `cliente_id`, `reporte_id` (nullable)
- `destinatario` (email), `asunto`, `tipo` (`completado` | `reporte_ejecutivo` | `reporte_interno` | `manual`)
- `estado` (`enviado` | `error`), `error_mensaje` (nullable), `gmail_message_id` (nullable)
- `enviado_por` (uuid del usuario que disparó), `enviado_at`
- RLS: staff lee todo; cliente ve solo los suyos por `cliente_id = current_cliente_id()`.

**Vista `/notificaciones` (nueva ruta `_authenticated/notificaciones.tsx`):**
- Filtros: cliente (select), planta (cascada del cliente), rango de fechas (date picker), tipo y estado.
- Tabla con paginación: fecha, planta, cliente, tipo, destinatario, estado, ver detalle.
- Botón "Reintentar" para envíos en error.
- Item en sidebar visible solo para staff.

### 4. Calendario para clientes — "Solicitar visita" con bloqueo por duración

**Cambios de modelo:**
- Añadir a `trabajos`: `duracion_dias INT NOT NULL DEFAULT 1` (cuántos días consecutivos ocupa) y `origen TEXT DEFAULT 'staff'` (`staff` | `cliente`).
- Nueva tabla `solicitudes_visita`:
  - `id`, `cliente_id`, `planta_id`, `tipo` (mantenimiento/inspección/falla), `descripcion`, `fecha_preferida`, `duracion_dias_estimada`, `estado` (`pendiente` | `aprobada` | `rechazada` | `convertida`), `trabajo_id` (nullable cuando se convierte), `respuesta_supervisor` (text).
- RLS: cliente CRUD solo sobre las suyas en estado `pendiente`; supervisor/admin gestionan todas.

**Cálculo de disponibilidad:**
- Server fn `getDisponibilidad({ desde, hasta })` que devuelve por día: `{ fecha, ocupada: boolean }`.
- Ocupada = existe al menos un trabajo cuyo rango `[fecha_programada, fecha_programada + duracion_dias)` cubre ese día (regla: 1 trabajo simultáneo en la operación — capacidad global simple; si después se requiere por planta o técnico se amplía).
- Si la respuesta es "no existe espacio", el cliente verá la fecha tachada en rojo con tooltip "No disponible" pero podrá pedir otra fecha; la confirmación final la hace el supervisor.

**UI:**
- En `/programacion` para clientes (vista distinta): calendario mensual con días ocupados en rojo, libres en verde. Click en día libre abre diálogo "Solicitar visita" (planta, tipo, descripción, duración estimada). Cliente solo ve sus propias plantas.
- En `/solicitudes` (nueva ruta) para staff: lista de solicitudes pendientes con acciones "Aprobar y crear trabajo" (abre modal de trabajo con datos prellenados) o "Rechazar" (con motivo).
- En `/solicitudes` para cliente: ve el estado de las suyas.

### 5. Migraciones y entregables

**SQL (una migración):**
- `ALTER TABLE trabajos ADD duracion_dias`, `origen`.
- `CREATE TABLE solicitudes_visita` + GRANTs + RLS + policies + trigger updated_at.
- `CREATE TABLE notificaciones_log` + GRANTs + RLS + policies.
- Función `public.dia_ocupado(fecha date)` security definer estable usada en el cálculo.

**Código nuevo:**
- `src/lib/pdf/ReporteEjecutivoDoc.tsx`, `ReporteInternoDoc.tsx` (componentes react-pdf).
- `src/lib/pdf/exportar.ts` (helper para empaquetar evidencias en base64).
- `src/lib/notificaciones.functions.ts` (sendNotificacionCompletado, listLogs, reintentar).
- `src/lib/solicitudes.functions.ts` (CRUD solicitudes, aprobar, rechazar, getDisponibilidad).
- `src/routes/_authenticated/notificaciones.tsx`.
- `src/routes/_authenticated/solicitudes.tsx`.
- Reescribir `src/routes/_authenticated/programacion.tsx` para diferenciar vista staff (la actual) vs vista cliente (calendario de solicitud).

**Conector requerido del usuario:** te pediré conectar Gmail con la cuenta `proyectos@easervice.app` cuando llegue ese paso — la cuenta debe iniciar sesión y autorizar los scopes `gmail.send` (y opcionalmente `gmail.compose`).

### Lo que NO entra en esta fase

- Adjuntar PDFs binarios al email (Gmail API lo soporta pero complica el flujo; se envía un enlace firmado en su lugar).
- Capacidad por técnico o por planta — se deja capacidad global; ampliable luego.
- Push notifications móviles.
- Firma digital del cliente en evidencias.

¿Procedo con esto, o ajustas algo (por ejemplo, capacidad por planta en lugar de global, o adjuntar el PDF al correo)?
