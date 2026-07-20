## 1. Feriados por año administrables

- Nueva tabla `public.feriados` (year, fecha, nombre, tipo `nacional|personalizado`, activo). Grants + RLS: lectura autenticada (todos los roles), escritura solo admin (`has_role(auth.uid(),'admin')`). Seed: feriados nacionales SV (los que ya usa `feriadosSV`) para el año en curso y el siguiente; el 6 de agosto queda cargado.
- Server fns `feriados.functions.ts`: `listFeriados({ year })`, `upsertFeriado`, `toggleFeriadoActivo`, `deleteFeriado`, `seedFeriadosAnio({ year })` (solo admin).
- Extender `src/lib/dias-habiles.ts` con un caché en memoria de feriados personalizados por año (`setFeriadosCache(year, Set)`, `getFeriadosCombinados(year)`) que se mezcla con `feriadosSV(year)` sin romper compatibilidad síncrona.
- Hook cliente `useFeriados(year)` que carga desde la BD y llena el caché — usado por calendario, drag & drop y formularios.
- Validación en `upsertTrabajo` / `reprogramarTrabajo`: además de `feriadosSV`, consultar la tabla `feriados` del año correspondiente antes de aceptar la fecha.
- Nueva sección en `/configuracion` (solo admin) "Feriados y días no laborables": selector de año, tabla editable, botón "Cargar feriados nacionales de El Salvador" (que llama a `seedFeriadosAnio`), agregar/editar/quitar personalizados. Muestra el 6 de agosto ya cargado.

## 2. Calendario coloreado y drag & drop restringido

- En `src/routes/_authenticated/programacion.tsx`:
  - Los días sábado, domingo y feriados se pintan con clase distintiva (fondo `bg-muted/60`, texto `text-muted-foreground`, chip "Feriado · <nombre>" cuando aplica) tanto en vista Mes como Semana/Día/Año.
  - Los slots no laborables llevan `draggable=false` y rechazan `onDragOver` / `onDrop`; se muestra toast "No se pueden programar trabajos en días no laborables (<motivo>)".
  - Los feriados se leen mediante `useFeriados` para el año visible; al cambiar de año se recarga.

## 3. PDF Interno sin edición de IA

- `getReporteParaPDF` ya devuelve los campos crudos. `ReporteDoc` acepta un flag `variante: "interno" | "cliente"`.
  - `interno`: renderiza los textos exactamente como los ingresó el técnico/reportador (sin pasar por `redactarConIA`), sin la nota "Elaborado con asistencia IA".
  - `cliente`: mantiene el flujo actual (usa la versión con IA cuando existe).
- En `/reportes` los botones existentes "Descargar PDF Interno" y "Descargar PDF Cliente" pasan la variante correspondiente. El resumen imprimible interno hace lo mismo.

## 4. Fotos del reporte diario independientes

- `ReportesDiariosSection`: cada tarjeta de reporte diario mantiene su propio `EvidenciaUploader` pero fuerza `reporte_diario_id = <id del reporte>` y `categoria = "diario"` al subir; muestra solo esas fotos.
- En `evidencias.functions.ts` y en la sección "Hallazgos fotográficos" del detalle del trabajo, filtrar `WHERE reporte_diario_id IS NULL` para que las fotos de reportes ya no aparezcan mezcladas.
- Migración de datos: `UPDATE trabajo_evidencias SET categoria = 'diario' WHERE reporte_diario_id IS NOT NULL AND categoria <> 'diario'`. No se mueven fotos entre sí; las que tienen `reporte_diario_id` quedan visibles solo dentro de su reporte, como pidió el usuario ("migrar automáticamente las que tengan reporte_diario_id").

## 5. Llenado del reporte diario desde A.T. (Terreno)

- Mover el bloque de "Reportes diarios" del detalle en `/trabajos` a `/terreno`:
  - En `terreno.tsx` cada `TrabajoCard` con estado `en_progreso` (o el técnico asignado hoy) muestra un botón "Reporte diario del día" que abre un `Sheet` con `ReportesDiariosSection` filtrado a ese trabajo y precargado con la fecha de hoy en zona SV.
  - Se conservan hora inicio/fin (auto desde jornada), campos operativos (paneles, watts, TDS, presión, ángulo), fotos independientes y el guardado offline.
  - En el detalle de trabajos (vista admin/supervisor/cliente) el bloque pasa a modo solo lectura con un aviso: "El llenado del reporte diario se realiza desde A.T. (módulo Terreno)". Los admins/supervisores pueden abrirlo desde A.T. directamente.
- Roles: A.T. sigue accesible para admin, supervisor y técnico. Cliente conserva la vista de solo lectura en Trabajos.

## Detalles técnicos

- Migración SQL única: crea `feriados` (con GRANT/RLS/POLICY/trigger `updated_at`), inserta feriados nacionales SV para el año actual y el próximo, y ejecuta el `UPDATE` de categoría en `trabajo_evidencias`.
- `dias-habiles.ts` sigue exponiendo funciones síncronas; el caché se llena antes de las validaciones vía `useFeriados` en cliente y vía un fetch inline dentro de las server fns cuando se valida una fecha.
- El flag `variante` de `ReporteDoc` se propaga desde `pdf/descargar.ts` y desde `PrintDocFrame` para no duplicar componentes.
- Realtime: agregar `feriados` y `trabajo_reportes_diarios` a `useRealtimeSync` para que los admins vean cambios sin recargar.
- Idioma español de Chile en toda la UI nueva; mensajes de toast coherentes con los existentes.

## Fuera de alcance

- No se migran fotos entre categorías más allá del `UPDATE` descrito ni se borra evidencia existente.
- No se altera la vista de PDF Cliente ni el flujo actual de aprobaciones.