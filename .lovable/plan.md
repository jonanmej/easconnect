## Objetivo
Sincronizar en tiempo real los datos compartidos entre roles (admin, supervisor, técnico, cliente) sin alterar RLS ni jerarquías, y auditar la visibilidad para que cada rol vea exactamente lo que le corresponde de los mismos datos.

## 1. Realtime en la base de datos
Habilitar la publicación `supabase_realtime` para las tablas que alimentan las vistas compartidas:

- `trabajos`, `trabajo_reportes`, `trabajo_reportes_diarios`, `trabajo_reportes_pdf`
- `trabajo_evidencias`, `trabajo_recursos`, `trabajo_aprobaciones`
- `notificaciones_usuario`, `jornadas_laborales`
- `inventario_items`, `inventario_movimientos`, `equipos`
- `solicitudes_visita`, `mantenimientos`

RLS ya filtra las filas emitidas por rol, así que la jerarquía no cambia.

## 2. Hook de sincronización cliente
Crear `src/hooks/useRealtimeSync.ts` que:

- Se suscribe a una tabla (o lista) por `postgres_changes`.
- Al recibir un evento invalida las queries de TanStack Query indicadas (`queryClient.invalidateQueries`).
- Se limpia con `supabase.removeChannel` en el unmount.
- Un solo canal por tabla, compartido entre vistas mediante un pequeño registro interno para no reabrir suscripciones.

## 3. Wire-up por módulo
Montar el hook en las páginas ya existentes, invalidando las claves reales que usan:

- **Trabajos y programación** (`/trabajos`, `/programacion`, `/mis-trabajos`, `/terreno`, dashboard KPIs): invalidar `["trabajos"]`, `["dashboard-kpis"]`, `["dashboard-series"]`, `["trabajos-sla"]`.
- **Reportes diarios y PDFs** (`/reportes`, detalle de trabajo): invalidar `["reportes-diarios"]`, `["trabajo-detalle"]`, `["reportes"]`, `["trabajo-reportes-pdf"]`.
- **Notificaciones y jornadas** (campanita global + `JornadaControl`): invalidar `["notificaciones"]`, `["jornada-actual"]`, `["jornadas"]`.
- **Inventario y equipos** (`/inventario`, `/equipos`, dashboard): invalidar `["inventario"]`, `["equipos"]`, `["dashboard-kpis"]`.

Las suscripciones se registran solo dentro del layout `_authenticated`, así solo usuarios autenticados abren canales.

## 4. Consolidación de KPIs
Verificar que `dashboardKpis`, `dashboardSeries` y `dashboardAlertas` (server fns) son la única fuente de números en dashboards de admin/supervisor/técnico/cliente y que los widgets del cliente y técnico consumen los mismos endpoints con sus filtros de RLS (no cálculos locales divergentes). Ajustar los que aún calculen en el cliente para leer del server fn.

## 5. Auditoría de visibilidad (sin ampliar permisos)
Revisar cada tabla priorizada y confirmar que existe al menos una policy SELECT por rol activo (admin/supervisor/técnico asignado, cliente por `current_cliente_id()`), sin agregar accesos que no existan hoy. Si detecto una fila que un rol debería ver por jerarquía pero una policy omite (ej. supervisor sin lectura en `trabajo_reportes_pdf`), lo reporto y propongo el fix puntual antes de aplicarlo; no se relajan restricciones existentes.

## Detalles técnicos
- Un solo `onAuthStateChange` sigue en `__root.tsx`; el hook no duplica listeners.
- Los canales realtime se filtran por `event: "*"` sobre la tabla; el filtrado fino lo hace RLS + TanStack Query al refetch.
- No se toca `src/integrations/supabase/*` (auto-generados).
- Migración solo agrega tablas al `publication supabase_realtime` (idempotente con `IF NOT EXISTS` via `DO $$`).

## Entregables
- Migración SQL (publicación realtime).
- `src/hooks/useRealtimeSync.ts`.
- Ediciones puntuales en las páginas listadas para montar el hook.
- Ajustes menores de KPI si detecto cálculo divergente.
- Informe corto de la auditoría de visibilidad al final.
