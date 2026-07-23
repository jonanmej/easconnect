## Objetivo

Que la app funcione con fluidez en móvil pequeño (≥360px), móvil estándar (≥390px), tablet (≥768px) y desktop (≥1280px), en cualquier marca/SO. Tablas densas se convierten en **cards apiladas** en móvil y vuelven a tabla en ≥md.

## Principios

- Mobile-first: base sin prefijo, `sm:` `md:` `lg:` para expandir.
- Contenedores flexibles: `min-w-0` en cualquier hijo de `flex`/`grid` con texto; `shrink-0` en íconos/avatares; `truncate` en títulos.
- Sin `overflow` accidental: reemplazar `flex flex-wrap` para headers por `grid-cols-[minmax(0,1fr)_auto]` → `sm:flex`.
- Tap targets ≥ 44×44 en móvil (`min-h-11 min-w-11` en botones-ícono).
- Diálogos: fullscreen en móvil (`max-w-none h-dvh sm:h-auto sm:max-w-lg`), scroll interno.
- Navegación: sidebar desktop, drawer/bottom-tabs móvil (ya existe AppShell — se ajusta, no se reescribe).
- Tipografía fluida: usar escalas `text-sm sm:text-base`, headings `text-xl sm:text-2xl`.

## Fases (multi-turno)

### Fase 1 — Fundaciones (este turno)
- `src/styles.css`: utilidades responsive base (`.responsive-table`, `.stack-on-mobile`, safe-area insets para notch/gesture bar, `overflow-wrap`, viewport `dvh`).
- `src/components/PageHeader.tsx`: ya es responsive; verificar acciones que crecen bien.
- `src/components/AppShell.tsx`: revisar breakpoints de sidebar/drawer, safe-area top/bottom, sticky headers.
- Nuevo `src/components/ResponsiveTable.tsx`: helper que renderiza `<table>` en `md:` y una lista de cards en móvil, alimentado por la misma definición de columnas.

### Fase 2 — Módulos densos (tabla → cards)
Aplicar `ResponsiveTable` a:
- Trabajos (`/trabajos`, `/mis-trabajos`, `/terreno`)
- Órdenes de compra (`/ordenes-compra`) — lista, ítems, recepciones, variaciones
- Inventario (`/inventario`)
- Usuarios (`/usuarios`), Clientes (`/clientes`), Plantas (`/plantas`), Equipos (`/equipos`)
- Contratos, Mantenimientos, Solicitudes, Auditoría, Notificaciones

### Fase 3 — Vistas complejas
- Dashboard: KPIs `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, charts con `ResponsiveContainer` verificado, leyendas debajo en móvil.
- Programación (calendario semana/mes/año): scroll horizontal contenido, controles apilados en móvil, filtros en `Sheet` en móvil.
- Mapa: alto `h-[60dvh] md:h-[calc(100dvh-8rem)]`, controles flotantes con safe-area.
- Reportes / PDF viewer: toolbar apilable, zoom con pinch nativo.

### Fase 4 — Formularios y diálogos
- Todos los `Dialog` con `>` 1 columna: `grid-cols-1 md:grid-cols-2`.
- Diálogos grandes (nueva OC, nuevo trabajo, editar planta, evidencia): fullscreen móvil.
- Inputs: `text-base` (evita zoom en iOS al enfocar), `inputMode` correcto, `autoComplete` correcto.
- EvidenciaUploader / SignaturePad / JornadaControl: verificar en móvil real.

### Fase 5 — Pulido cross-device
- Safe-area (iOS notch, Android gesture): `env(safe-area-inset-*)` en top-nav y bottom-nav.
- Prevenir zoom accidental / doble-tap: `touch-action: manipulation` en botones.
- Scroll: `overscroll-behavior` contenido en modales y drawers.
- QA con Playwright en 4 viewports (360, 390, 768, 1280) por ruta clave, capturar y ajustar.

## Detalles técnicos

### ResponsiveTable (esqueleto)

```tsx
type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  primary?: boolean;   // se muestra como título en la card
  secondary?: boolean; // subtítulo
  hideOnMobile?: boolean;
  className?: string;
};

<ResponsiveTable
  data={items}
  columns={cols}
  rowKey={(r) => r.id}
  onRowClick={...}
/>
```
Renderiza `<table>` en `md:` y `<div>` con cards `rounded-lg border p-3` en móvil, con `primary` como `font-semibold`, `secondary` como `text-xs text-muted-foreground`, el resto como pares `label: value`.

### Fix patterns aplicados en cascada

- Headers de página con acciones: `grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:flex sm:flex-wrap`.
- Tabs con muchas pestañas: `TabsList` con `overflow-x-auto` + `snap-x` en móvil.
- Botones con texto+ícono: mostrar solo ícono en móvil (`<span className="hidden sm:inline">…</span>`).
- Filas de KPI: usar `dvh` en alturas de layout completo para que barra de dirección iOS no rompa.

### Viewport meta
Ya está `width=device-width, initial-scale=1` en `__root.tsx`. Añadir `viewport-fit=cover` para safe-area en iOS.

## Alcance de este turno

Fase 1 completa: fundaciones + `ResponsiveTable` + ajustes en `AppShell`, `PageHeader`, `styles.css` y `__root.tsx` (viewport-fit). Al terminar, verifico con Playwright en 360/390/768/1280px las rutas principales, y en los siguientes turnos voy migrando los módulos por lotes.

¿Confirmas y arranco con Fase 1?