# Terminar Fase 7 — Claude Sonnet 5 aceptado

1. Restaurar los controles de rol originales de los dos generadores y mostrar sus verificaciones anteriores y finales.
2. Guardar copias de comparación sin PDF completos: texto extraído en el prompt o referencias privadas verificadas; límite de 512 KiB. Deshabilitar comparación con motivo claro si no puede conservarse la copia. Limpiar automáticamente al emitir o eliminar.
3. Permitir activar y reanudar a cualquier administrador, con historial de actor y fecha; sin correo fijo.
4. Completar pruebas simuladas de proveedor, respaldo, errores terminales, JSON y cifras; ejecutar pruebas del proyecto. La plataforma comprueba los tipos automáticamente.
5. Comprobar Reportes y generación actual con una sesión real de administrador, sin activar ni llamar a Claude. Revisar que clientes y PDF no expongan controles ni trazabilidad de IA.

## Detalles técnicos
Conservar modelos y comportamiento operativo existentes, controles de emisión, permisos no relacionados y diseño. Usar limpieza y registro atómico en la base de datos. No publicar. Si una sesión o el servicio de IA impide la comprobación real, informar el impedimento sin simular éxito.