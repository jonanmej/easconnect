
## Fase 8 — Portal del cliente y modo técnico en terreno

Cierra el ciclo operativo: el cliente firma y aprueba el trabajo desde su navegador, y el técnico opera en terreno desde su celular incluso con señal intermitente. Se apoya en lo construido en fases previas (solicitudes, reportes PDF, notificaciones Gmail, evidencias).

### 1. Portal del cliente reforzado

Nueva pestaña **"Mis trabajos"** (ruta `/cliente/trabajos`) visible solo para rol `cliente`:

- Lista de trabajos ejecutados en sus plantas con filtros (planta, rango de fechas, estado, tipo).
- Detalle de trabajo con: resumen del reporte IA, evidencias en galería, técnico responsable y SLA cumplido.
- Botón **"Descargar PDF Ejecutivo"** (reutiliza generador de Fase 5).
- Bloque **"Próximas visitas"** con las visitas programadas y las solicitudes pendientes/aprobadas.

Mejora de `/solicitudes` para cliente: línea de tiempo visual (pendiente → aprobada → programada → completada).

### 2. Firma digital del cliente sobre evidencias

Al completar un trabajo el supervisor genera un **link de aprobación firmado (TTL 7 días)** que llega al cliente por Gmail. El link abre una vista pública sin login (`/aprobar/:token`):

- Resumen del trabajo, fotos, técnico, fecha.
- Canvas de firma (mouse/touch) + nombre y RUT del firmante.
- Checkbox de conformidad ("Apruebo la ejecución del trabajo").
- Al firmar: se guarda PNG de la firma en bucket privado, se sella `trabajos.firmado_at` y `firmado_por`, se notifica al supervisor por correo, y el link queda inutilizable.

Nueva tabla `trabajo_aprobaciones` (token, trabajo_id, expira_at, firmado_at, firmante_nombre, firmante_rut, firma_storage_path, ip, user_agent). RLS: solo `service_role` (la vista pública usa server fn sin requerir auth para validar el token con SECURITY DEFINER).

La firma se renderiza en el PDF ejecutivo del reporte si existe.

### 3. PWA + modo técnico en terreno

Convertir la app en PWA instalable:

- `manifest.webmanifest` con íconos EA, color de marca y `display: standalone`.
- Service worker (Workbox via Vite plugin `vite-plugin-pwa`) con estrategias:
  - `NetworkFirst` para rutas API y server fns.
  - `CacheFirst` para assets estáticos, logos y fuentes.
  - `StaleWhileRevalidate` para `dashboardAlertas` y listas pequeñas.
- Banner de "Instalar app" en login para técnicos.

Nueva vista móvil **`/terreno`** (rol `tecnico`):

- Lista compacta de trabajos asignados hoy/mañana con icono de sincronización por trabajo.
- Pantalla de trabajo con tres acciones grandes: **Iniciar**, **Subir evidencia**, **Completar**.
- Captura de evidencias funciona offline: las fotos se guardan en IndexedDB (cola) y se suben en cuanto vuelve la conexión, con indicador visible "N evidencias pendientes de sincronizar".
- Botón **"Sincronizar ahora"** manual.

### 4. Notificaciones más inteligentes

Extender `notificaciones.functions.ts`:

- Nuevo tipo `aprobacion_solicitada` (correo con link de firma al completar).
- Nuevo tipo `aprobacion_recibida` (notifica al supervisor que el cliente firmó).
- Recordatorio automático a las 72h si el cliente no ha firmado (cron pg con server fn `revisarFirmasPendientes`).

### 5. Migraciones y entregables

**SQL (una migración):**

- `ALTER TABLE trabajos ADD COLUMN firmado_at timestamptz, firmado_por text, firma_storage_path text`.
- `CREATE TABLE trabajo_aprobaciones` + GRANTs + RLS (`service_role` only).
- Función `public.validar_token_aprobacion(token text)` SECURITY DEFINER que devuelve el trabajo si el token es válido y no expiró.
- Crear bucket privado `firmas-clientes` (TTL de URLs firmadas 1h).
- Cron pg diario para `revisarFirmasPendientes`.

**Código nuevo / modificado:**

- `src/routes/aprobar.$token.tsx` (ruta pública, sin layout autenticado).
- `src/routes/_authenticated/cliente.trabajos.tsx`.
- `src/routes/_authenticated/terreno.tsx` (vista técnico).
- `src/lib/aprobaciones.functions.ts` (generar token, validar, firmar).
- `src/lib/offline-queue.ts` (cola de evidencias en IndexedDB con `idb-keyval`).
- `src/lib/pdf/ReporteDoc.tsx` (insertar firma si existe).
- `vite.config.ts` + `public/manifest.webmanifest` + iconos.
- `src/components/SignaturePad.tsx` (canvas de firma, ~80 líneas, sin librería externa).

**Roles afectados (`src/lib/roles.ts`):** rutas `/cliente/trabajos` solo `cliente`; `/terreno` solo `tecnico` y `supervisor`.

### Lo que NO entra en esta fase

- Firma con certificado digital legal (eIDAS/FEA chilena) — la firma actual es gráfica con sello de tiempo y trazabilidad, suficiente para conformidad operativa, no para validez tributaria.
- Modo offline completo para el resto de la app (solo evidencias y lectura de trabajos asignados).
- Notificaciones push del navegador (requiere VAPID + suscripción; opcional para fase posterior).
- App nativa iOS/Android — la PWA cubre 95% del caso de uso.

### Orden de implementación sugerido

1. Migración SQL + bucket de firmas.
2. Firma digital y vista pública `/aprobar/:token` + correo de aprobación.
3. Portal cliente "Mis trabajos".
4. PWA (manifest + SW) y vista `/terreno`.
5. Cola offline de evidencias.
6. Cron de recordatorio de firma.

¿Procedo con esta Fase 8 o ajustamos algo (por ejemplo, dejar fuera la PWA y enfocar solo en firma + portal cliente, o adelantar push notifications)?
