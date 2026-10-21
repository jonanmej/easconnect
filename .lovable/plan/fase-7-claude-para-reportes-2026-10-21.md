# Fase 7 — Claude para reportes

## Decisión necesaria antes de implementar
El catálogo autenticado de modelos disponibles incluye `anthropic/claude-sonnet-5`, pero no `claude-sonnet-5-5`. No se ha sustituido el modelo ni cambiado la generación actual.

La integración Claude admitida aquí utiliza Messages mediante Lovable AI, no llamadas directas a `api.anthropic.com` con una clave propia. Por tanto, no puedo prometer activación automática al agregar `ANTHROPIC_API_KEY` con el contrato solicitado.

**Propuesta para aprobar:** preparar `anthropic/claude-sonnet-5` mediante Lovable AI, con activación explícita posterior por el dueño. Si prefieres conservar exactamente `claude-sonnet-5-5` y tu clave propia, esta fase queda pendiente, sin cambiar la IA actual.

## Cambios previstos si apruebas la alternativa
- Unificar la ejecución de IA de los dos generadores, conservando sus datos, instrucciones, modelos actuales y cálculos.
- Mantener la IA actual hasta activar Claude; validar el mismo JSON, incluido el título que actualmente necesita la app.
- Aplicar una corrección de JSON como máximo. El respaldo no eludirá denegaciones del proveedor, rechazos de contenido ni problemas confirmados de disponibilidad o configuración; esos casos terminarán con un mensaje claro.
- Registrar proveedor, modelo y fecha para el control documental interno, sin incluirlos en el PDF del cliente.
- Agregar «Comparar redacción» para administradores en borradores: dos resultados con los mismos datos, sin guardar hasta elegir; volver a comprobar las cifras al adoptar la elección.
- Conservar los indicadores calculados, el aviso de cifras sin respaldo y el bloqueo de envío hasta revisión. No alterar reportes emitidos, permisos existentes, nómina, calendario ni diseño.

## Detalles técnicos y verificación
- Messages nativo del gateway, clave de Lovable solo en servidor, transmisión consumida en servidor y modelo en una constante.
- Separar preparación de datos, llamada, validación y persistencia para evitar que la comparación cree reportes involuntariamente.
- Aprovechar la auditoría existente sin modificar permisos; verificar borrador y rol administrador también en el servidor.
- Pruebas simuladas de selección, errores permitidos para respaldo, errores terminales, JSON y cifras inventadas; ejecutar `bun run test` y revisar la verificación de tipos automática.
- Verificar el flujo con sesión real. No afirmar que Claude funciona sin una llamada exitosa al modelo autorizado.

## Estado actual
Solo se revisaron el código, las reglas y el catálogo de modelos, y se registró la solicitud. No se modificó código funcional ni se generaron reportes. Falta completar la comprobación de documentación oficial y resolver el modelo y la conexión antes de implementar.