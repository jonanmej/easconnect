# Fase 1 – Informe de auditoría (EA Service Connect)

Solo es un informe: no se modificó nada. Lo que sigue se revisó directamente en la base de datos (políticas de seguridad, funciones, revisor automático) y en el código. Lo que está marcado como **"por confirmar"** necesita una prueba en la fase de pruebas antes de corregirlo.

## Resumen rápido

- La seguridad de los datos se aplica en la base de datos, con tablas de roles separadas y la función `has_role`. La base es buena.
- Hay **1 riesgo crítico**: un cliente podría cambiarse de empresa él mismo y ver los datos de otro cliente.
- Las cifras de los reportes las calcula el sistema en su mayoría, pero algunos indicadores (KPIs) todavía los redacta la IA.
- La fecha de emisión del reporte no es la fecha real en que se emite.

---

## CRÍTICO

**C1. Un cliente puede cambiarse de empresa en su propio perfil** (riesgos 1 y 4)
- Tabla `profiles`: la regla de edición permite que cada usuario modifique **cualquier campo** de su propio perfil, incluido `cliente_id`. La función `current_cliente_id()` toma la empresa justamente de ese campo, y todas las reglas de cliente (plantas, OT, reportes, evidencias, contratos, solicitudes) dependen de ella.
- Riesgo concreto: un usuario cliente que use la API directamente podría poner el `cliente_id` de otra empresa y ver sus plantas, OT y reportes. No se encontró ningún bloqueo en la base de datos (por confirmar con una prueba).
- Corrección: agregar un bloqueo en la base de datos que impida cambiar `cliente_id` (y `debe_cambiar_password`) a quien no sea administrador, o quitar el permiso de edición sobre esas columnas.
- Fase: **Seguridad y roles** (lo primero).

## ALTO

**A1. Calendario del cliente consultado con permisos totales** (punto 4)
- `getDisponibilidad` (en `solicitudes.functions.ts`) usa el acceso de administrador, que se salta las reglas de seguridad, para leer **todas** las OT. Después el servidor oculta los datos ajenos como "Reservado". El filtro funciona, pero se aplica en el código y no en la base de datos, como pide el Knowledge. Además, el servidor recibe nombres, folios y servicios de otros clientes.
- Corrección: crear una función de base de datos que entregue al cliente solo los días ocupados (fecha, duración y si la OT es suya o no), sin datos ajenos. Eliminar el acceso de administrador en esa consulta.
- Fase: **Calendario de OT**.

**A2. La IA todavía escribe los KPIs del reporte** (punto 3)
- `reportes.functions.ts` (instrucciones a la IA, líneas ~696 y ~1570): se le pide a la IA que "incorpore en KPIs" el avance, los watts totales, el TDS, la presión, etc., y que cite el porcentaje. El número viene del sistema, pero la IA lo copia al texto y puede alterarlo o redondearlo.
- Corrección: el sistema arma la tabla de indicadores (`kpisAvanceReal` y las mediciones) y la IA solo devuelve resumen, hallazgos y recomendaciones. Antes de guardar el texto, se compara para detectar cualquier cifra que no esté en el conjunto de datos.
- Fase: **Reportes**.

**A3. La fecha de emisión no es la fecha real de emisión** (punto 3)
- `reportes.functions.ts:1307`: el campo `emitido_at` del PDF se toma de `created_at` (fecha en que se creó el borrador), no de la fecha en que se aprobó o envió. No existe ninguna columna de fecha de emisión ni un código de documento fijo por reporte.
- Corrección: agregar las columnas `fecha_emision` y `codigo_documento` a `reportes`. La base de datos las llena una sola vez al pasar a "aprobado/enviado", sin edición manual. Un reporte emitido queda bloqueado (los cambios crean una nueva versión con `reporte_padre_id`, que ya existe).
- Fase: **Reportes**.

**A4. Los reportes emitidos se pueden modificar**
- La regla de edición de `reportes` para admin/supervisor no revisa el estado. Por lo tanto, un reporte ya enviado o aprobado puede editarse directamente, lo que va contra ISO 9001.
- Corrección: bloquear en la base de datos los cambios de contenido cuando el estado es enviado o aprobado.
- Fase: **Reportes**.

## MEDIO

**M1. Funciones internas que cualquier usuario con sesión puede ejecutar** (punto 1)
- El revisor automático marca 14 funciones internas que cualquier usuario con sesión puede ejecutar (por ejemplo `dashboard_kpis_v1`, `contrato_cumplimiento`, `verificar_conflicto_tecnico`, `cambiar_estado_oc`). `reset_operational_data` sí verifica que el usuario sea admin. Por confirmar en cada una: si alguna devuelve datos de todos los clientes sin revisar el rol (por ejemplo `contrato_cumplimiento`, que devuelve nombres de clientes), un cliente podría leer información ajena.
- Corrección: revisar cada función, agregar la verificación de rol al inicio y quitar el permiso de ejecución a quien no lo necesita.
- Fase: **Seguridad y roles**.

**M2. El cliente puede editar campos de un reporte al aprobarlo o rechazarlo**
- La regla que permite al cliente aprobar o rechazar solo revisa el estado final. Con la API podría cambiar también el título, el contenido u otros campos.
- Corrección: hacer la aprobación y el rechazo mediante una función de base de datos que cambie solo el estado y el motivo, y quitar la edición directa.
- Fase: **Seguridad y roles**.

**M3. Las fotos de evidencia no tienen reglas para el cliente**
- Las reglas del almacén de fotos `trabajos-evidencia` solo permiten acceso al personal interno. Los clientes ven las fotos mediante enlaces temporales que genera el servidor, lo cual es correcto, pero esto depende de que cada función del servidor revise la pertenencia del cliente.
- Corrección: revisar las funciones que generan esos enlaces y confirmar que cada una revisa que la planta sea del cliente.
- Fase: **Pruebas**.

**M4. Los roles se revisan dos veces y de forma distinta** (punto 2)
- En la base de datos: tabla `user_roles` más `has_role` y `current_cliente_id`. Esto es correcto.
- En la interfaz: `roles.ts`, `RoleGate` y la revisión `isAdmin` solo esconden pantallas, lo cual es correcto como apoyo.
- En el servidor: más de 17 archivos usan el acceso de administrador. En la mayoría está justificado (correos, usuarios, firmas), pero la verificación de rol se repite a mano en cada archivo con helpers distintos (`requireAdmin`, `requireStaff`, etc.).
- La ruta `/search-console` se restringe por correo solo en la interfaz.
- Corrección: un único helper de servidor para revisar roles, y revisar que cada uso del acceso de administrador verifique antes quién llama.
- Fase: **Seguridad y roles**.

**M5. Planilla y nómina** (punto 4)
- Las tablas `nomina_*` son solo para admin en la base de datos, y las funciones de jornada y nómina también lo revisan en el servidor. Esto es correcto.
- Riesgo pendiente: `jornadas_laborales` (horas y marcaciones) la ven también los supervisores, y desde ahí pueden deducir horas extras. Revisar si esto está permitido.
- La unión de las dos cuentas de Jonathan está escrita directamente en el código (`nomina-unificaciones.ts`). Debería guardarse como dato en la base de datos.
- Fase: **Seguridad y roles**.

**M6. Unidades de potencia** (punto 3)
- Los reportes solo usan "watts" (`watts_panel` y `watts_totales`) y nunca convierten a kW, kWp o MWp. La capacidad de las plantas (`plantas.capacidad` y `clientes.capacidad`) es **texto libre**, así que cada planta puede tener una unidad distinta y no se puede calcular con ella.
- Corrección: guardar la capacidad como número en kWp y usar una sola función de formato (W, kW, kWp o MWp según el valor y el contexto) en la pantalla, los PDF y los datos que recibe la IA.
- Fase: **Reportes**.

## BAJO

**B1. Archivos sobrantes o sin uso** (punto 5)
- `scripts-tmp-gen.mts` (script temporal en la raíz del proyecto) y `src/lib/mock-data.ts` (datos de ejemplo): no se encontró ningún lugar que los use. Se pueden borrar.
- Tablas que hay que confirmar si se usan: `equipos.salud`, `mantenimientos.fecha` frente a `fecha_inicio`/`fecha_fin` (están duplicadas), y `trabajo_reportes` frente a `trabajo_reportes_diarios` (son dos maneras de registrar el reporte del técnico).

**B2. Código duplicado y archivos muy grandes** (punto 5)
- `reportes.functions.ts` (85 mil caracteres), `operations.functions.ts`, `nomina.tsx`, `jornada.tsx`, `ReporteDoc.tsx` y `reportes.tsx` superan los 40–55 mil caracteres. Cada uno mezcla varias tareas, por lo que es fácil romper algo al editarlo.
- Las instrucciones a la IA y la limpieza de datos para el cliente están repetidas en dos generadores de reportes.
- El cálculo de la semana ISO (`isoWeek`) está escrito solo dentro de `programacion.tsx`. Si la agenda interna y los PDF la necesitan, hay que compartirla.
- Hay muchos `as any` en las consultas, que ocultan errores de tipo.

**B3. Sin pruebas automáticas**
- No hay ninguna prueba en el proyecto. Los cálculos más delicados (nómina, descuentos ISSS/AFP/renta, avance del reporte, conflictos de técnicos) no tienen pruebas.

**B4. Avisos menores del revisor**
- Hay una extensión instalada en el esquema público (aviso menor).
- En el último análisis de seguridad no aparece ningún hallazgo, pero el análisis de conectores está incompleto. Conviene ejecutar un análisis nuevo desde la pestaña Seguridad.

---

## Orden propuesto por fases

```text
Fase 1  Seguridad y roles : C1, M1, M2, M4, M5
Fase 2  Reportes          : A2, A3, A4, M6
Fase 3  Calendario de OT  : A1 (+ semana ISO compartida, B2)
Fase 4  Pruebas           : pruebas de acceso entre clientes (C1, A1, M3),
                            nómina, avance y formato de unidades; limpieza B1/B2
```

Cada fase se hará con cambios pequeños. Antes de cada una explicaré qué voy a tocar y al terminar diré cómo probarlo. Si apruebas, empiezo por la **Fase 1 (Seguridad y roles)**, comenzando por C1.
