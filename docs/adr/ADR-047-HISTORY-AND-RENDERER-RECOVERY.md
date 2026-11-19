# ADR-047: Historial completo y recuperación de interfaz

Fecha: 2026-11-19. Estado: implementado por solicitud del operador.

## Decisión

El historial reciente conserva su consulta de 50 registros por operación y sus
estados parciales. **Buscar en todo el historial** agrega una consulta independiente
de los tres diarios QA, con páginas de hasta 50 registros, fechas locales convertidas
a UTC, tipo de operación y búsqueda por STAN/RRN/Terminal ID/UUID. El límite Hasta
es exclusivo. El cursor compuesto por fecha de inicio y UUID ordena empates sin
duplicar registros. Una consulta fallida no entrega una página parcial ni avanza
el cursor. Abrir una operación antigua conserva el borrador y permite consultar
sus mensajes mediante el archivo cifrado existente de ADR-046.

`TransactionHistoryService` depende de puertos de lectura y preferencias, valida
el ambiente y el contrato antes de consultar. IPC valida también el emisor. SQL
parametrizado busca únicamente referencias públicas; no busca PAN ni contenidos
completos de mensajes. La interfaz mantiene la última página ante error o timeout.

`BalanceJournal` incorpora `save` y `find` opcionales para adaptadores capaces de
actualizar/consultar un registro. SQLite implementa UPSERT atómico por requestId,
con `synchronous=FULL`, conservando la secuencia de inserción. El motor conserva
la serialización, el registro PENDING previo al envío y la lectura completa de
preflight que comprueba idempotencia y operaciones bloqueantes. Los adaptadores
anteriores conservan el camino read/write; no se cambia ninguna regla financiera.

El esquema SQLite financiero pasa a versión 2 mediante un índice por startedAt
y requestId; no cambia los payloads ni elimina registros. La migración se ejecuta
en transacción y mantiene los respaldos JSON. Una versión antigua que solo admita
esquema 1 rechazará esta base: no se debe forzar el número de versión para degradar.

Un ErrorBoundary captura errores de renderizado y muestra una pantalla de
recuperación sin registrar la excepción ni contenidos de componentes. El IPC
de recuperación es solo lectura: consulta actividad en Main y referencias recientes
de los tres diarios. Error, timeout o actividad en curso impiden restaurar la UI.
El botón de restauración vuelve a comprobar el estado y abre Transacciones para
revisar el historial. Se pierde el borrador/lectura efímeros del Renderer; Main y
sus operaciones continúan sin reiniciar ni reenviar. Esto no recupera un proceso
Renderer terminado por el sistema ni convierte un resultado incierto en aprobado.

Corrección de revisión: la pantalla de recuperación consulta por separado la
corrida actual y ofrece **Detener prueba** mediante el IPC de parada existente,
incluso si no se puede consultar el historial financiero. No inicia corridas.
Un error o timeout exige **Actualizar estado de carga** antes de repetir la
parada; STOPPING no permite un segundo comando. Las lecturas anteriores a una
parada no pueden sobrescribir su respuesta. Restaurar la UI sigue exigiendo
comprobar que Main esté libre. La selección de un registro antiguo conserva su
snapshot al volver a abrirlo desde la lista local, incluso después de actualizarla.

No hay dependencias nuevas ni cambios en ISO/TCP, PIN/EMV, retención o producción.

## Ajustes de uso

- Historial de carga conserva tabla, detalle y cursor tras un error de consulta,
  indica que siguen correspondiendo a la última consulta correcta y permite reintentar.
- Los fallos del diario de depósitos se identifican como Depósitos.
- Mediator recuerda únicamente el último intervalo SQL válido consultado, bajo
  una clave local versionada. Primera apertura sin fechas; datos inválidos o
  almacenamiento inaccesible permiten entrada manual. No se convierte ni infiere
  la zona horaria SQL pendiente de confirmación.

## Validación y medición

Pruebas de validación, paginación entre tres diarios, filtros, migración v1→v2,
actualización y reapertura, corrupción, recuperación con Main ocupado, errores y
timeout. Electron recorre páginas antiguas, abre la inspección, conserva datos
ante fallos, verifica etiquetas, recuerda fechas tras reinicio y recupera un error
de renderizado sin comandos financieros. Todo usa fuentes sintéticas locales.

Medición reproducible: `node tooling/benchmark-financial-journal.mjs`, Windows,
Node 22.20.0, 10 muestras tras 2 calentamientos, misma base y validadores:

| Registros | Guardado anterior p50 / p95 | Guardado por registro p50 / p95 |
| --- | --- | --- |
| 1.000 | 141,63 / 150,65 ms | 6,02 / 6,63 ms |
| 10.000 | 1.399,17 / 1.499,92 ms | 5,80 / 6,58 ms |

Solo mide el guardado. Excluye preflight, hardware, cifrado y host. No acredita
TPS financieros. SQLite sigue en Main; la lectura completa previa al envío y
búsquedas por referencia sin índice de texto pueden crecer con el historial.
