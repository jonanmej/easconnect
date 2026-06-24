## Plan de implementación

### 1. Rendimiento del dashboard empresarial
- **Agregaciones en base de datos**: crear vistas SQL (`v_dashboard_kpis`, `v_dashboard_agua_planta`, `v_dashboard_paneles_planta`) que precomputen contadores, sumas de galones, paneles limpiados y conteos por estado, evitando traer filas crudas al servidor.
- **Server fns en paralelo**: dividir `dashboardOverview` en funciones independientes (`kpisCore`, `kpisOperativos`, `seriesSemanales`, `agua`, `paneles`) para que el cliente las consulte con `useQuery` por separado.
- **Carga diferida en UI** (`src/routes/_authenticated/index.tsx`): cada bloque (KPIs, series, agua, paneles, alertas) usará su propio `<Suspense>` con `Skeleton`. Bloques pesados (gráficos) se importan con `React.lazy`.
- **Cache**: `staleTime` 60s en cada query para evitar recomputar al cambiar de pestaña.

### 2. Login con logos
- Editar `src/routes/auth.tsx` para mostrar de manera sobria los logos existentes: `EALogo` (header principal), `ChemitekLogo` y `PVStopLogo` como "powered by / partners" en una fila inferior dentro del card, separados con divisor sutil. Tipografía y espaciado controlados con tokens del design system.

### 3. Completar perfil para usuarios invitados/nuevos
- **Migración**: agregar a `profiles` columnas `nombres`, `apellidos`, `cargo`, `perfil_completado` (bool, default false).
- **Trigger**: en `handle_new_user`, dejar `perfil_completado=false` salvo cuando ya vengan los datos.
- **Ruta nueva** `src/routes/_authenticated/completar-perfil.tsx`: formulario con nombres, apellidos, cargo y cambio de contraseña (vía `supabase.auth.updateUser`).
- **Gate**: en `_authenticated/route.tsx`, si `perfil_completado=false` redirigir a `/completar-perfil` (excepto la ruta misma y `/auth`).
- **Invitaciones**: al crear usuarios en `users.functions.ts`, marcar `perfil_completado=false` para que el flujo se active al primer login.

### 4. Firma ejecutiva en reportes
- En `src/lib/reportes.functions.ts` (o donde se genere el resumen ejecutivo): inyectar `generado_por = { nombre_completo, cargo }` leyendo del perfil del usuario que ejecuta el server fn.
- En `ReporteDoc.tsx`: agregar al pie del resumen ejecutivo el bloque "Generado por: {nombres apellidos} — {cargo}".

### 5. ISO 15489 en PDFs
Aplicar a todos los PDFs emitidos (`src/lib/pdf/ReporteDoc.tsx` y la utilidad `descargar.ts`):
- **Metadatos del documento**: título, autor, asunto, palabras clave, fecha de creación y de modificación (usar `<Document` props de `@react-pdf/renderer`).
- **Identificador único** del documento (UUID + folio) visible en encabezado y pie.
- **Encabezado** estandarizado: organización, código del documento, versión, fecha de emisión, clasificación ("Uso interno").
- **Pie de página** en todas las páginas: identificador, "Página X de Y", responsable (nombre + cargo) y leyenda de retención documental.
- **Trazabilidad**: registrar en `auditoria_log` la emisión del PDF (entidad="reporte_pdf", actor, hash del archivo) para auditoría conforme ISO 15489.
- **Integridad**: incluir hash SHA-256 del contenido en el pie y en `auditoria_log`.

### Detalles técnicos
- **SQL nuevas vistas**: SECURITY INVOKER, GRANT SELECT a `authenticated`, filtradas por `current_cliente_id()` cuando aplique para clientes.
- **Migración profiles**: GRANT ya existe; agregar columnas con default `NULL`/`false`, backfill `perfil_completado=true` para usuarios actuales para no romper sesiones.
- **Tipos**: `src/integrations/supabase/types.ts` se regenera tras migración.
- **PDF metadata**: `@react-pdf/renderer` soporta `<Document title author subject keywords creator producer>`; el hash se calcula con `crypto.subtle.digest` antes de descargar y se anexa visualmente.

### Orden de ejecución
1. Migración (vistas + columnas profiles).
2. Backend: server fns dashboard divididas, reportes con firma, hash/metadatos PDF.
3. Frontend: dashboard con Suspense + queries paralelas, login con logos, ruta completar perfil + gate.
4. Verificación: navegar al dashboard, login y flujo de invitación con Playwright.
