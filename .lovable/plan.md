
# Fase 2 — Datos reales (CRUD operativo)

Hoy todas las vistas usan `mock-data.ts`. La siguiente fase es reemplazar ese mock por tablas reales con CRUD, respetando los roles ya definidos. Propongo abordar **Clientes → Plantas → Equipos → Trabajos** como vertical mínima viable (sin tocar Inventario / Mantenimientos / Reportes IA todavía).

## Modelo de datos

```text
clientes (1) ──< plantas (1) ──< equipos
                       │
                       └─< trabajos (>─ equipos opcional, >─ asignado_a auth.users)
```

Tablas en `public`:

- **clientes** — razón social, RUT, contacto, estado (activo/revision/pausado).
- **plantas** — nombre, cliente_id, ubicación, paneles, capacidad_mw, eficiencia.
- **equipos** — código, nombre, tipo (robot/manual/motor), estado, salud %, planta_id (opcional).
- **trabajos** — folio (auto), planta_id, servicio, fecha_programada, tecnico_id, estado (programado/en_progreso/completado/cancelado), notas.

Todas con `created_at`, `updated_at`, trigger de timestamp, RLS habilitado, GRANTs estándar.

## Permisos por rol (RLS + UI)

| Acción | admin | supervisor | técnico | cliente |
|---|---|---|---|---|
| Ver clientes/plantas/equipos | sí | sí | sí | solo los propios |
| Crear/editar/eliminar | sí | sí | no | no |
| Ver trabajos | todos | todos | asignados a él | de sus plantas |
| Cambiar estado de trabajo | sí | sí | solo los suyos | no |

"Cliente propio" requiere vincular `auth.users → cliente_id`. Añado columna `cliente_id` a un nuevo perfil ligero `profiles` (id = auth.users.id, cliente_id nullable).

## Entregables de esta fase

1. Migración con las 5 tablas + `profiles` + policies + triggers de `updated_at`.
2. Seed opcional (datos del mock actual) ejecutable desde un botón "Cargar datos de ejemplo" en `/usuarios` (solo admin).
3. Server functions tipadas en `src/lib/{clientes,plantas,equipos,trabajos}.functions.ts` con list / get / create / update / delete.
4. Refactor de las 4 rutas `/clientes`, `/plantas`, `/equipos`, `/trabajos`:
   - lectura con `useSuspenseQuery` + loader `ensureQueryData`.
   - formularios de crear/editar en `<Dialog>` shadcn.
   - botón eliminar con `<AlertDialog>` de confirmación.
   - estados de carga (skeletons) y error (`errorComponent` por ruta).
5. Dashboard `/` recalcula KPIs desde la base (trabajos hoy, equipos operativos, alertas).
6. Mantener `mock-data.ts` solo para `agendaHoy` y secciones aún no migradas (Inventario, Mantenimientos, Reportes) — se abordan en la Fase 3.

## Detalles técnicos

- Server functions con `requireSupabaseAuth`; las protegidas en loaders solo bajo `_authenticated/`.
- Validación de input con `zod` (ya en el proyecto).
- Folio de trabajos: secuencia Postgres `trabajos_folio_seq` formateada `T-YYYY-NNNN`.
- `useQueryClient().invalidateQueries({queryKey:['clientes']})` tras cada mutación.
- Reuso de `<PageHeader>` y estilos actuales — sin cambios visuales.

## Fuera de alcance (Fase 3+)

Inventario con movimientos de stock, órdenes de mantenimiento ligadas a equipos, generador de reportes IA con Lovable AI, programación tipo calendario, notificaciones, exportes PDF.

¿Procedo con esta Fase 2 tal cual, o ajustamos alcance/orden?
