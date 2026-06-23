# Fase 3 — Inventario, Mantenimientos y Reportes IA

Cierro las tres secciones que aún viven en `mock-data.ts` y conecto la primera capacidad de IA del producto.

## 1. Inventario con movimientos de stock

**Tablas nuevas:**
- `inventario_items` — sku (único), nombre, categoría (insumo / repuesto / herramienta / EPP), ubicación, unidad, stock_actual (numérico, calculado por trigger), stock_minimo.
- `inventario_movimientos` — item_id, tipo (ingreso / salida / ajuste), cantidad, motivo, trabajo_id (opcional, para ligar consumos a un trabajo), realizado_por, created_at.

Trigger: cada movimiento recalcula `stock_actual` del item.

**UI `/inventario`:**
- Tabla actual conectada a datos reales (admin / supervisor / técnico ven todo; cliente no ve esta sección).
- Botón "Nuevo SKU" → `RecordDialog` (admin/supervisor).
- Botón "Registrar movimiento" en cada fila → diálogo con tipo + cantidad + motivo + trabajo opcional.
- KPI "Bajo stock" calculado en vivo.

## 2. Mantenimientos ligados a equipos

**Tabla nueva:**
- `mantenimientos` — equipo_id, tipo (preventivo / correctivo / predictivo), fecha, horas, técnico_id, estado (programado / completado / pendiente), notas.

RLS: admin/supervisor escriben; técnico ve y completa los suyos; cliente ve los de sus plantas (a través de equipo → planta → cliente).

**UI `/mantenimientos`:**
- Listado real con filtro por equipo y por estado.
- Crear / editar con `RecordDialog`.
- Al marcar como completado, registra automáticamente las horas de uso acumuladas del equipo.

## 3. Reportes ejecutivos con Lovable AI

**Tabla nueva:**
- `reportes` — cliente_id, planta_id (opcional), periodo (texto, ej "Q2 2026"), titulo, contenido_markdown, insight_resumen, estado (borrador / enviado), generado_por, model_used, created_at.

**Server function** `generarReporte` (admin/supervisor):
- Toma cliente_id + planta_id + rango de fechas.
- Recopila desde la base: trabajos completados, mantenimientos del periodo, salud promedio de equipos, alertas.
- Llama a Lovable AI (`google/gemini-3-flash-preview`) con un prompt que produce salida estructurada (zod `Output.object`):
  - `titulo`, `resumen_ejecutivo`, `kpis[]`, `hallazgos[]`, `recomendaciones[]`.
- Persiste el reporte en markdown listo para mostrar/exportar.

**UI `/reportes`:**
- Botón "Generar nuevo" → diálogo con cliente + planta + periodo.
- Lista de reportes reales con estado, modelo usado y fecha.
- Vista de detalle (diálogo grande) con el markdown renderizado.
- Acción "Marcar como enviado".
- Manejo explícito de errores `429` (límite) y `402` (créditos agotados) con toast claro.

## Entregables técnicos

- 3 migraciones (una por sección) con tablas, GRANTs, RLS, triggers y policies por rol.
- `src/lib/inventario.functions.ts`, `mantenimientos.functions.ts`, `reportes.functions.ts` (server functions con `requireSupabaseAuth`).
- `src/lib/ai-gateway.server.ts` con el provider helper de Lovable AI.
- Refactor de `/inventario`, `/mantenimientos`, `/reportes` para usar `useQuery` + `RecordDialog`.
- Dashboard `/` añade KPI "SKUs bajo stock" y "Reportes pendientes de envío".
- `mock-data.ts` queda solo con `agendaHoy` (vista táctica del día); se evaluará migrar en Fase 4.

## Fuera de alcance (Fase 4+)

Programación tipo calendario drag-and-drop, exportes PDF reales del reporte, notificaciones por email a clientes, fotos adjuntas de campo subidas a Storage, app móvil del técnico.

¿Procedo con esta Fase 3 tal cual, o ajustamos?
