# ADR-033: historial y evidencia local de carga

Fecha: 2026-11-03. Estado: implementado.

## Contexto y autorización

El usuario solicita implementar la propuesta de historial paginado y exportación
CSV/JSON de pruebas de carga. SQLite ya conserva todas las corridas, pero el
contrato de ejecución solo recuperaba la última. No hacen falta nuevas reglas
ISO, PIN/EMV, ni acceso a Switch/Core para consultar evidencia local.

## Decisión

- Separar `LoadHistoryStore`/`LoadHistoryService` del control de `LoadRunService`.
  Reutilizar su recuperación de la última corrida interrumpida; consultar un
  resultado antiguo no modifica la corrida activa ni repite operaciones.
- Extender el adaptador SQLite con lectura por UUID y páginas de 20 resúmenes.
  Cursor por secuencia de registro, filtros SQL parametrizados por inicio UTC,
  ATM principal/secundario, operación y estado. No cambiar el esquema ni borrar
  registros; validar los payloads recuperados antes de devolverlos.
- Exponer únicamente consulta/detalle/exportación por IPC tipado y remitente
  confiable. QA se comprueba en Main. El filtro de fecha final es exclusivo.
- `LoadExportService` consume el puerto de lectura y `LoadExportSink`. La
  proyección de evidencia pertenece al dominio. El diálogo Electron y la
  escritura temporal/reemplazo son adaptadores fuera del Renderer.
- Exportar solo corridas cerradas mediante lista permitida de campos, sin
  mensajes libres, tramas ni datos de seguridad. CSV neutraliza fórmulas; JSON
  conserva decimales de monto como texto. Schema de evidencia versión 1.
- Selección de ruta exclusivamente nativa. Evitar extensión incorrecta,
  sustitución de datos de la aplicación y destinos que no sean archivos normales.
  El plazo cancela trabajo pendiente; un diálogo tardío mantiene exclusión hasta
  cerrarse. Una selección posterior al timeout no escribe.

## Límites

La consulta es una vista de registros guardados y se actualiza explícitamente.
El cursor no constituye una instantánea transaccional de todas las páginas:
una corrida activa puede cambiar de estado y dejar de coincidir con un filtro.
Un error invalida la página; no se omiten silenciosamente registros corruptos.
El historial no resuelve resultados financieros inciertos ni confirma Core.
No incluye comparación, HTML, reversos automáticos ni carga distribuida.

## Validación

Unitarias: payloads, proyección permitida, fechas, nulos, importes y CSV.
Integración: SQLite real, cursor bajo inserciones, filtros, recuperación,
bloqueo/corrupción y guardado de archivos, cancelación y timeout.
Electron: filtros, páginas, correlación, reinicio, fallos IPC y exportación por
Main; se sustituye únicamente el diálogo nativo para elegir destinos temporales.
