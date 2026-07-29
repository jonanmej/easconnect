## Objetivo

Que el técnico marque, en el reporte diario, qué zonas de la planta trabajó ese día, sobre la vista satelital de Google Maps. Las zonas las define una sola vez el supervisor. El avance del mapa es complementario: no cambia el % ni los paneles que el técnico escribe a mano. En el PDF del reporte ejecutivo aparece una imagen del mapa por cada día trabajado.

## Cómo funciona (vista del usuario)

**Supervisor / admin — definir zonas (una vez por planta)**

- Desde el módulo de Plantas, botón "Zonas del mapa" en cada planta con coordenadas.
- Se abre la planta en vista satelital y se dibujan polígonos con la herramienta de dibujo.
- Cada zona lleva: nombre (ej. "Mesa A", "Techo norte", "String 3"), cantidad aproximada de paneles y color.
- Se pueden editar, renombrar, mover vértices y eliminar zonas después.

**Técnico — marcar avance del día**

- Dentro del reporte diario (A.T. → Reporte diario del día) se agrega la sección "Avance en mapa".
- Muestra la planta en satélite con sus zonas dibujadas.
- Cada zona se toca para ciclar su estado del día: sin trabajar → en proceso → completada.
- Las zonas ya completadas en días anteriores aparecen atenuadas con su fecha, para no repetir.
- Contador informativo: zonas marcadas hoy y paneles estimados de esas zonas — solo referencia, no sobrescribe los campos de avance ni de paneles limpiados.
- Si la planta no tiene zonas definidas, la sección muestra un aviso y no bloquea el guardado del reporte.

**Reporte ejecutivo PDF**

- Nueva sección "Avance en mapa por día": una imagen satelital por cada día con reporte, con las zonas coloreadas según su estado ese día, más la lista de zonas trabajadas y la fecha.
- Los días sin marcas se omiten.

## Alcance técnico

**Base de datos (2 tablas nuevas)**

- `planta_zonas`: `planta_id`, `nombre`, `paneles_estimados`, `color`, `poligono` (jsonb con los vértices lat/lng), `orden`, `activo`. Lectura para roles internos y para el cliente dueño de la planta; escritura solo admin/supervisor.
- `reporte_diario_zonas`: `reporte_diario_id`, `trabajo_id`, `zona_id`, `estado` (`en_proceso` | `completada`). Único por reporte+zona. Escritura por el técnico dueño del reporte y por admin/supervisor.
- Ambas con GRANT explícitos, RLS con `has_role()` / `current_cliente_id()` siguiendo el patrón actual del proyecto.

**Editor de zonas**

- Reutiliza el cargador de Google Maps ya existente en `/mapa` (`loadGoogleMaps`), añadiendo la librería `drawing` para trazar polígonos.
- Nuevo componente `PlantaZonasEditor` abierto como diálogo desde `plantas.tsx`.
- Server functions en `src/lib/planta-zonas.functions.ts`: listar, crear, actualizar, eliminar zonas.

**Marcado en el reporte diario**

- Nuevo componente `MapaAvanceDiario` insertado en `ReportesDiariosSection.tsx`, con el mapa en modo `hybrid`, polígonos clicables y estado por zona.
- Se guarda junto con el reporte diario mediante nuevas server functions (`listZonasDiario`, `guardarZonasDiario`) en `src/lib/reportes-diarios.functions.ts`.
- En móvil el mapa ocupa un alto fijo con controles táctiles grandes; el gesto de arrastre mueve el mapa y el toque simple marca la zona.

**Imagen para el PDF**

- El mapa interactivo no se puede capturar de forma fiable desde el navegador, así que la imagen del PDF se genera en el servidor con la Static Maps API de Google, a través del gateway de conectores ya configurado en el proyecto.
- Cada polígono se envía como trazo codificado con relleno de color según su estado del día; el resultado es un PNG satelital que se incrusta en `ReporteDoc.tsx`.
- Se añade a `getReporteParaPDF` la carga de zonas por día y la generación de esas imágenes, con degradación silenciosa: si la imagen falla, el PDF muestra solo la lista de zonas trabajadas, sin romper la descarga.

**Acceso**

- Editar zonas: admin y supervisor.
- Marcar avance: técnico asignado (y admin/supervisor).
- Cliente: solo lectura del mapa y del PDF.

## Fuera de alcance

- No se sube ningún plano/layout propio; se usa exclusivamente la vista satelital de Google.
- El % de avance y los paneles limpiados del reporte diario siguen ingresándose manualmente.
- No se recalculan KPIs del dashboard a partir de las zonas.
