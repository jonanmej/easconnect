## Objetivo
Permitir definir cuántos servicios al año tiene contratada cada planta por tipo, autoprogramarlos en el calendario y mostrar el cumplimiento en el Dashboard para todos los roles. El cliente podrá mover sus fechas auto-asignadas a cualquier día libre dentro del ciclo correspondiente, sin chocar con otros clientes.

## 1. Modelo de datos (migración)

Nueva tabla `public.contratos_servicio`:
- `planta_id` (FK plantas) + `servicio` (texto) → PK compuesta única
- `cantidad_anual` (int ≥ 1)
- `anio` (int, default año actual) — para soportar cambios año a año
- `fecha_inicio` (date) — ancla del primer ciclo (default 1 ene)
- `duracion_dias_default` (int, default 1)
- `activo` (bool, default true)

RLS:
- Staff (admin/supervisor): full
- Cliente: SELECT solo de plantas de su `current_cliente_id()`
- Técnico: SELECT

Nuevas columnas en `trabajos`:
- `contrato_id uuid null` (FK contratos_servicio) — marca trabajos generados/contados por contrato
- `ciclo_numero int null` — 1..cantidad_anual, identifica el ciclo del año
- `auto_generado bool default false`

Función `public.proximas_fechas_contrato(_contrato_id uuid)` que devuelve las fechas tentativas distribuidas uniformemente (`fecha_inicio + i * round(365/cantidad_anual)`).

Función `public.contrato_cumplimiento(_anio int)` SECURITY DEFINER que retorna por planta/servicio: `programados`, `completados`, `pendientes`, `cumplimiento_pct`, respetando RLS de plantas (clientes ven solo las suyas).

## 2. Backend (server functions)

Archivo nuevo `src/lib/contratos.functions.ts`:
- `listContratos()` — staff y cliente (filtrado por RLS)
- `upsertContrato({ planta_id, servicio, cantidad_anual, fecha_inicio, duracion_dias_default })` — staff
- `eliminarContrato({ id })` — staff
- `generarProgramacionAnual({ contrato_id, anio })` — staff. Crea trabajos `auto_generado=true` con `ciclo_numero`, evitando duplicar ciclos existentes. Si la fecha calculada está ocupada (otro trabajo no cancelado en la planta o, opcional, cualquier planta del mismo técnico), desplaza al primer día libre posterior.
- `reprogramarTrabajoCliente({ trabajo_id, nueva_fecha })` — cliente. Validaciones:
  - El trabajo debe ser `auto_generado`, estado `programado`, pertenecer a una planta de su cliente.
  - `nueva_fecha` dentro del rango del ciclo: `[inicio_ciclo, inicio_ciclo + paso - 1]` donde `paso = round(365/cantidad_anual)`.
  - El día (y duración) no debe estar ocupado por otro trabajo no cancelado en cualquier planta (regla global "respetar fechas de otros clientes").
- `cumplimientoAnual({ anio })` — llama a `contrato_cumplimiento`, devuelve filas con cliente, planta, servicio, contratados, completados, programados, % cumplimiento.

## 3. UI

**Nueva ruta `src/routes/_authenticated/contratos.tsx`** (staff):
- Tabla por planta+servicio con cantidad anual y botón "Generar programación".
- Modal de edición.
- Botón "Generar programación anual" por contrato muestra preview de fechas y confirma.

**`src/routes/_authenticated/mis-trabajos.tsx`** (cliente):
- Sobre cada trabajo `auto_generado` programado, botón "Reprogramar" que abre un date picker. El picker llama a `getDisponibilidad` extendido para marcar días ocupados globales (no solo en su planta). Al confirmar, llama a `reprogramarTrabajoCliente`.

**Dashboard `src/routes/_authenticated/index.tsx`** (todos los roles):
- Nueva sección "Cumplimiento de servicios contratados (año actual)" con:
  - Barra de progreso global (servicios completados / contratados)
  - Tabla por planta+servicio: contratados, completados, % cumplimiento, próxima fecha programada.
- Para cliente: solo sus plantas. Para staff: todas.

**AppShell**: agregar entrada "Contratos" para admin/supervisor.

## 4. Reglas de ocupación

"Día ocupado" = existe un trabajo con `estado != cancelado` cuyo rango `[fecha_programada, fecha_programada + duracion_dias)` cubre el día solicitado. Esto aplica a la generación automática (desplaza al siguiente libre) y a la reprogramación del cliente (rechaza con mensaje).

## 5. Validación final

- Build TypeScript.
- Smoke: crear contrato 12/año en una planta, generar programación, ver 12 trabajos, mover uno desde rol cliente.

## Notas técnicas
- `paso_dias = round(365 / cantidad_anual)`, ciclos numerados 1..N.
- Generación es idempotente: si ya hay trabajo con mismo `contrato_id` y `ciclo_numero`, se omite.
- `reprogramarTrabajoCliente` corre con `requireSupabaseAuth` y verifica pertenencia vía RLS + chequeo explícito.
- Cumplimiento usa año calendario; configurable luego.
