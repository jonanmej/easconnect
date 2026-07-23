
## Alcance

Cinco frentes pedidos, ordenados por riesgo. Es trabajo grande — lo hago en 3 turnos para no romper build en un solo golpe. Este plan cubre todo, y arranco por el turno 1 al confirmar.

## 1. Tokens globales y breakpoints (turno 1)

En `src/styles.css`:
- Escalar tipografía fluida: `--fs-xs/sm/base/lg/xl/2xl` con `clamp()` para que no rompa en 360px.
- Grid utilities: `.form-grid` = `grid gap-3 grid-cols-1 sm:grid-cols-2`, `.form-grid-3` = `... md:grid-cols-3`.
- Paddings de página: `.page-pad` = `p-3 sm:p-6 lg:p-8`.
- Confirmar breakpoints Tailwind por defecto (sm 640, md 768, lg 1024, xl 1280) — no se cambian, se documentan en `MOBILE.md`.

## 2. Formularios consistentes (turno 1)

`RecordDialog` + `Field` + `inputCls` ya son la base. Ajustes:
- `Field`: label `text-xs font-medium`, gap 1.5, soporte a `hint` (helper text `text-[11px] text-muted-foreground`) y `error` inline.
- `inputCls`: `text-base sm:text-sm` (evita zoom iOS), `min-h-10`, `w-full`, `truncate` en selects.
- `RecordDialog` `DialogContent`: `max-w-[calc(100vw-1rem)] sm:max-w-lg max-h-[92dvh] overflow-y-auto`.
- Reemplazar los `grid grid-cols-2/3` sueltos dentro de los diálogos por `.form-grid` / `.form-grid-3` (Equipos, Plantas, Clientes, Contratos, Mantenimientos, Solicitudes, Usuarios, Inventario, OC — solo capa presentación).

## 3. ResponsiveTable en todo _authenticated (turno 2)

Migrar las tablas existentes al componente ya creado. Rutas afectadas:

```text
equipos, plantas, clientes, usuarios, contratos, mantenimientos,
solicitudes, auditoria, notificaciones, inventario, ordenes-compra,
trabajos, mis-trabajos, terreno, rutas, reportes (listados)
```

Regla por tabla:
- Definir `columns: ResponsiveColumn<Row>[]` con `primary` (nombre/código), `secondary` (contexto), resto como pares.
- Acciones (Editar/Eliminar) → `rowActions`.
- Estado (badges) mantiene su color actual dentro de `cell`.
- No toco lógica de datos ni server functions.

## 4. Auditoría de campos distorsionados en móvil (turno 2)

Con Playwright a 360×740 recorro cada ruta de `_authenticated` autenticado con la sesión inyectada, capturo screenshots y aplico estos fixes cuando aparezcan:
- Headers `flex flex-wrap` con acciones → `grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex`.
- KPI rows: `text-3xl` → `text-2xl sm:text-3xl`, valor y unidad apilados con `flex-col sm:flex-row`.
- Tabs con muchas pestañas: `TabsList` con `overflow-x-auto snap-x` y `shrink-0` en cada `TabsTrigger`.
- Íconos + texto en botones: texto oculto en móvil (`hidden sm:inline`).
- Cualquier `min-w-[Npx]` que fuerce scroll horizontal → revisar.

## 5. Regresión visual automática (turno 3)

- Script `scripts/visual-regression.mjs` que corre Playwright headless sobre las rutas clave en 4 viewports (360, 390, 768, 1280).
- Guarda snapshots en `tests/visual/__baseline__/<ruta>-<viewport>.png`.
- En modo `check`, compara pixel-por-pixel con `pixelmatch` (tolerancia 0.1%) y falla si excede.
- Comando: `bun run visual:update` (regenera baseline) y `bun run visual:check` (CI).
- No engancho a CI del usuario — queda listo para correr manual y en cada turno de agente.

Rutas incluidas: `/`, `/trabajos`, `/plantas`, `/clientes`, `/equipos`, `/inventario`, `/ordenes-compra`, `/programacion`, `/usuarios`, `/contratos`, `/mantenimientos`, `/reportes`, `/mapa`.

## Fuera de alcance

- No toco lógica de negocio, RLS, server functions, ni datos.
- No cambio la estructura de `AppShell` (ya se ajustó en Fase 1).
- No cambio íconos ni copy.

## Entregable por turno

- Turno 1 (este, si confirmas): tokens globales + refactor de `RecordDialog`/`Field`/`inputCls` + migración de diálogos densos a `.form-grid`. Verificación Playwright a 360px en 3 diálogos.
- Turno 2: migración de todas las tablas a `ResponsiveTable` + auditoría móvil ruta por ruta.
- Turno 3: script de regresión visual + baseline inicial + doc en `MOBILE.md`.

¿Arranco con el turno 1?
