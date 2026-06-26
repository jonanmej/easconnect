## Resumen
Implemento todo el pedido en 4 bloques. El bloque 4 requiere migración de BD (reportes diarios + PDFs de st.solar).

## Bloque 1 — Catálogo y Contratos
- `src/lib/servicios.ts`: exporto `SERVICIOS_CONTRATO` con el orden exacto solicitado:
  1. Instalación Fotovoltaica
  2. Limpieza Robotizada
  3. Mantenimiento Menor
  4. Mantenimiento Medio
  5. Mantenimiento Mayor
  6. Mantenimiento de transformador eléctrico
  7. Servicio Técnico de Drone
- `contratos.tsx`: usa `SERVICIOS_CONTRATO`; agrego validación en el submit del diálogo que rechaza Falla/Emergencia/Inspección y cualquier servicio fuera del catálogo con `toast.error`. (El server fn `upsertContrato` ya valida.)
- Trabajos/Programación siguen leyendo `SERVICIOS_OT` → al modificar el catálogo se actualizan automáticamente.

## Bloque 2 — Filtros en Clientes
- `clientes.tsx`: añado input de búsqueda (nombre/RUT) + segmento "Todos / Con O&M / Sin O&M".
- Filtrado en memoria sobre la lista actual; cuenta visible por segmento.

## Bloque 3 — Navegación del detalle de trabajo
- Refactorizo el panel/dialog de detalle del trabajo en `trabajos.tsx` (y `mis-trabajos.tsx` / `terreno.tsx` si comparten) para usar tabs Shadcn:
  - **Reportes diarios** (nuevo)
  - **Reporte ejecutivo** (admin/supervisor) o **Carga PDF** (st.solar)
  - **Evidencias**
  - **Recursos**
  - **Historial de asignaciones** (oculto para técnicos, como ya está)
- Tabs scroll horizontal en móvil; sticky header; los acordeones largos se reemplazan por tabs accesibles.

## Bloque 4 — Reportes diarios + PDF st.solar (migración BD)
**Nueva tabla** `trabajo_reportes_diarios`:
- `trabajo_id`, `fecha` (date), `tecnico_id`, `avance_pct`, `paneles_limpiados`, `agua_galones`, `horas_trabajadas`, `clima`, `observaciones`, `bloqueos`.
- Unique `(trabajo_id, fecha, tecnico_id)`.
- RLS:
  - admin/supervisor: ALL.
  - técnico: SELECT si está asignado al trabajo (cualquier técnico del equipo); INSERT/UPDATE/DELETE solo sus propias filas.
  - cliente: sin acceso.

**Nueva tabla** `trabajo_reportes_pdf` (para st.solar y futuros):
- `trabajo_id`, `fecha`, `subido_por`, `storage_path`, `nombre_original`, `tamanio_bytes`.
- RLS análoga: solo el autor, admin y supervisor.
- Bucket reutilizado: `trabajos-evidencia` con prefijo `reportes-pdf/`.

**Evidencias por día**: agrego columna `fecha` (date) opcional a `trabajo_evidencias`. El uploader la setea con la fecha activa.

**Reporte ejecutivo**:
- `reportes.functions.ts`: nueva fn `generarEjecutivoDesdeDiarios(trabajo_id)` solo admin/supervisor. Consolida diarios + PDFs (extrayendo texto con la skill PDF cuando aplique) y genera vía Lovable AI (`google/gemini-2.5-flash`).
- El usuario `st.solar@easervice.app` se detecta por email; en su detalle el módulo de "Reporte diario" se reemplaza por "Subir PDF del día".

**UI Reportes diarios**:
- Listado por fecha con autor; el técnico activo edita el día de hoy; admin/supervisor editan cualquier día.
- Botón "Generar reporte ejecutivo" arriba (admin/supervisor) → guarda en tabla `reportes` existente.

## Notas técnicas
- Server fns nuevas: `listReportesDiarios`, `upsertReporteDiario`, `eliminarReporteDiario`, `listReportesPDF`, `registrarReportePDF`, `eliminarReportePDF`, `generarEjecutivoDesdeDiarios`.
- Todas con `requireSupabaseAuth`; las que escriben validan rol o autoría del registro.
- Migración crea las dos tablas con GRANT a authenticated + service_role y RLS antes de policies.
- No toco: branding emails, módulos cliente, lógica de programación/contratos existente.

## Fuera de alcance (no se toca)
- Notificaciones (no cambia).
- Roles existentes.
- Reportes anteriores (la fn antigua `generarReporte` queda funcional para retrocompatibilidad).
