
# Refactor de reportes de trabajo y hallazgos

## 1. Unificación en un solo botón "Reporte diario"
En `src/routes/_authenticated/trabajos.tsx`, dentro del diálogo de información del trabajo asignado, justo debajo de los datos básicos (folio, cliente/planta, servicio, fecha, estado), reubicar una fila de botones con:

- **Reporte diario** (nuevo, unificado): abre un panel que combina el formulario de reporte técnico diario + hallazgos fotográficos del día. Reemplaza los accesos separados "Reporte técnico" y "Evidencias / Hallazgos".
- **Recursos** (existente, reubicado): genera además un PDF imprimible.
- **Información de OT** (existente, reubicado).
- **Historial de asignaciones** (existente, reubicado, solo admin/supervisor).

Las pestañas o secciones que actualmente alojan estos accesos en otra parte del diálogo se eliminan para evitar duplicados.

## 2. Reporte diario unificado
Refactor de `src/components/ReportesDiariosSection.tsx`:

- Un solo formulario por día con: trabajo realizado, paneles limpiados, agua, horas, clima, hallazgos, observaciones, **avance %** (sigue calculándose automático), **+ hallazgos fotográficos del día** integrados (subida a `trabajo_evidencias` ya existente, etiquetados con la `fecha` del reporte diario).
- Listado cronológico de reportes guardados muestra textos + miniaturas de fotos por día.
- Caso especial `st.solar@easervice.app` (PDF) se mantiene como hoy.

Datos diarios alimentan el módulo de Reportes y el Dashboard (ver §5).

## 3. Módulo de Reportes — generación
En `src/lib/reportes.functions.ts`:

- Nueva acción "Generar reporte ejecutivo del día": consume reportes diarios del rango = fecha indicada (default = hoy).
- Acción existente "Generar reporte ejecutivo final": consolida **todos** los reportes diarios del trabajo (es la `generarEjecutivoDesdeDiarios` ya creada, se renombra etiqueta UI a "Reporte ejecutivo final").
- Ambos guardan en `public.reportes` y entran al workflow de aprobación existente.

UI en `src/routes/_authenticated/reportes.tsx`: dos botones por trabajo seleccionable — "Diario" / "Final".

## 4. Recursos → PDF imprimible
Nuevo `src/lib/pdf/RecursosDoc.tsx` reutilizando estilos de `ReporteDoc.tsx` (encabezado EA Service Connect, pie con ISO, paginación, tipografía y márgenes idénticos). Botón "Exportar PDF" dentro del panel de Recursos (que llama `descargarPDF` con el nuevo doc). Contenido: tabla de recursos con categoría, descripción, cantidad/unidad, entregado, devuelto, notas + datos del trabajo y firma.

## 5. Nuevos servicios

En `src/lib/servicios.ts`:

```ts
SERVICIOS_OT += "Capacitación", "Visita técnica"
SERVICIOS_CONTRATO += "Capacitación", "Visita técnica"
```

Quedan visibles en Trabajos, Programación y Contratos automáticamente (todos consumen estas constantes). Validación servidor en `upsertContrato` no requiere cambios (sólo bloquea Falla/Emergencia/Inspección).

## 6. Dashboard
`src/lib/dashboard.functions.ts` y vistas:

- Sumar lecturas desde `trabajo_reportes_diarios` (paneles_limpiados, agua_galones, horas_trabajadas, conteo de reportes) además de `trabajo_reportes`.
- Series semanales: incluir conteos por día desde reportes diarios para "actividad diaria".
- KPI dashboard (`dashboard_kpis_v1`): ampliar para sumar también desde `trabajo_reportes_diarios` (migración).
- Vista cliente y vista staff usan los mismos números.

## 7. Notificaciones / permisos
Sin cambios en RLS. El nuevo botón unificado respeta roles existentes (técnicos no ven Historial de asignaciones, etc.). Notificaciones a staff por reporte diario ya existen, se mantienen.

## Detalles técnicos

- **Archivos editados:** `src/lib/servicios.ts`, `src/components/ReportesDiariosSection.tsx`, `src/routes/_authenticated/trabajos.tsx`, `src/routes/_authenticated/reportes.tsx`, `src/lib/reportes.functions.ts`, `src/lib/dashboard.functions.ts`, `src/components/dashboard/StaffCharts.tsx`.
- **Archivos nuevos:** `src/lib/pdf/RecursosDoc.tsx`.
- **Migración:** redefinir `public.dashboard_kpis_v1()` para sumar también desde `trabajo_reportes_diarios`.
- **Reusar:** `trabajo_evidencias` (ya existe) recibe fotos diarias con `fecha` del reporte diario; no se crea tabla nueva.

## Confirmaciones que necesito antes de implementar

1. ¿El **PDF de Recursos** debe incluir firma del cliente (igual que el reporte ejecutivo) o sólo es un imprimible interno?
2. Para el **Reporte ejecutivo diario**: ¿se permite un único reporte ejecutivo por día (sobrescribe si ya existe) o varios versionados?
3. Cuando se elimina el botón antiguo de "Hallazgos fotográficos" — ¿los hallazgos existentes (sin `fecha` diaria) los muestro en una sección "Sin fecha" dentro del reporte diario, o sólo migrarán los nuevos a partir de hoy?
