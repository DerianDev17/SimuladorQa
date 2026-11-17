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
No incluye comparación, reversos automáticos ni carga distribuida.

## Ampliación 2026-11-16: informe HTML

Al continuar la reportería se incorpora HTML local imprimible sobre la misma
proyección de evidencia v1, sin dependencias nuevas ni cambios al esquema SQLite.
El informe presenta configuración, contadores, latencias y correlación completa
por operación; conserva UTC, incertidumbre y ausencias de datos. Los estilos
son locales, los valores dinámicos se escapan y CSP bloquea scripts y recursos
externos. No se abre el archivo automáticamente ni se consulta Mensajes cifrados.

El formato usa el mismo IPC, validación, bloqueo de corridas activas, diálogo,
cancelación, timeout y guardado atómico. La proyección de ATM secundarios queda
limitada explícitamente a UUID/revisión en todos los formatos. HTML redondea TPS
y latencias del resumen a dos decimales para presentación; CSV/JSON mantienen
los valores originales. No se agrega un veredicto de capacidad o resultado Core.

La mejora visual del mismo día incorpora barras estáticas de TPS y percentiles,
escalas comunes desde cero y un aviso de envíos sin respuesta. El pico de estrés
se identifica explícitamente. Valores positivos menores a 0,01 se muestran como
`<0.01`; los datos ausentes siguen siendo «Sin dato». No cambia cálculos, fuentes,
contratos IPC ni esquema. Ejemplos y pruebas visuales usan solo fixtures sintéticos.

## Validación

Ampliación de interpretación de negocio, 2026-11-16: se distinguen consulta de
saldo (respuesta frente a exactitud del saldo) y retiro (autorización frente a
efectivo y contabilidad), conforme a WITHDRAWAL.md, ADR-031 y la evidencia pública
persistida. Una respuesta registrada no cierra por sí sola la revisión funcional.
La proyección de presentación incorpora grupos excluyentes: no enviado, enviado
aprobado, enviado no aprobado y enviado por revisar; conserva los resultados
históricos sin remapear códigos y no modifica métricas CSV/JSON ni el esquema.
En retiro muestra importes solicitados por grupo con centavos enteros y validación
de monto existente; nunca los denomina débito, efectivo ni pérdida. Las acciones
incluyen área sugerida y evidencia necesaria, sin asignación ni reenvío automático.
El contrato detallado y sus fuentes están en [REPORTING](../REPORTING.md).
Las pruebas cubren partición, respuesta con resultado no concluyente, no envío,
cancelación, montos inválidos, extremos y precisión de centavos, y presentación
de retiro en Electron. Se mantienen las pruebas de guardado/error/timeout.

Ampliación por audiencia, 2026-11-16: a petición del usuario se generan dos HTML
independientes. `audience` es opcional en el IPC de exportación y se valida solo
para HTML; sin él se genera técnico. CSV/JSON conservan esquema v1. Los nombres
incluyen `negocio` o `tecnico` y el mismo UUID de corrida. El informe de negocio
excluye el detalle individual y presenta una narrativa determinista, sin inferir
certificación. El técnico añade cobertura y agregados de etapas con fórmulas.
TODO-DATA LOAD-REPORT-ACCEPTANCE bloquea únicamente el veredicto de aceptación.
Pruebas cubren selección, separación de contenido, datos ausentes, incertidumbre,
rechazos, estrés, HTML escapado, guardado/error/timeout y ambas acciones en Electron.

Unitarias: payloads, proyección permitida, fechas, nulos, importes y CSV.
Integración: SQLite real, cursor bajo inserciones, filtros, recuperación,
bloqueo/corrupción y guardado de archivos, cancelación y timeout.
Electron: filtros, páginas, correlación, reinicio, fallos IPC y exportación por
Main; se sustituye únicamente el diálogo nativo para elegir destinos temporales.
