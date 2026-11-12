# ADR-043: clasificación de entidades Coonecta

Fecha: 2026-11-12. Estado: implementado; tres clasificaciones múltiples pendientes.

## Fuente y confirmación

El usuario solicita configurar las entidades del listado adjunto y distinguir
externas, back y front. Aporta 88 filas (ADQ/EMI incluidas), correspondientes a
74 códigos. Confirma mantener códigos como 205 y asignar 312 a CACECH, cuyo
código venía vacío. Para Tulcán, Mushuc Runa y Pablo Muñoz Vega solicita
«Conservar las clasificaciones del listado y marcar que falta validación».
La [transcripción administrativa](../entities/COONECTA_ENTITIES_20261112.md)
registra hash de fuente, códigos y clasificaciones sin direcciones de red.

## Decisión

`networkType` permanece independiente de `memberTypes`. Se añaden FRONT, BACK,
EXTERNAL y HYBRID, mostrados como FRONT, BACK, EXTERNA e HÍBRIDA. Se admiten
cero o varios valores únicos, normalizados a un orden estable. Vacío se muestra
**Sin clasificar**; más de uno se muestra **Validación pendiente**. La selección
múltiple conserva evidencia; no equivale a validar roles simultáneos.

SQLite versión 4 agrega un campo JSON vacío a entidades anteriores. Lecturas,
escrituras e IPC validan la lista. Un cliente anterior que omite el campo conserva
el valor almacenado; una lista vacía explícita lo borra. Guardar conserva el
control de revisión y la auditoría existente. El Renderer usa exclusivamente IPC.

El adaptador del listado reconoce FRONTEND AUT, BACKEND, SWITCH EXTERNO e HIBRIDA.
Agrupa filas ADQ/EMI por código, conserva sus líneas/clasificaciones y rechaza
códigos ambiguos, nombres incompatibles o valores desconocidos. La conversión
8xxx → xxx requiere parámetro explícito; CACECH=312 también. Esta aprobación
se limita al listado recibido y no define una regla ISO, PID o switch.

La herramienta de importación trabaja bajo demanda sobre una base existente:
vista previa, respaldo SQLite, migración, guardado auditado y comprobación de
UUID/ATM. Conserva estado activo de entidades previas, no elimina entidades,
no duplica registros ni revisiones al repetir. Cada fila se confirma por separado;
el reporte registra fallos y cambios parciales para permitir una recuperación
revisada. No restaura automáticamente ni configura endpoints o credenciales.

La prohibición histórica de precargar nombres reales en ADR-004 queda acotada
por esta solicitud explícita a importar el listado entregado en la estación del
usuario. Las instalaciones nuevas y las pruebas continúan sin precarga real.

## Límites y validación

`TODO-DATA ENTITY-CLASSIFICATION-MULTIPLE` conserva 200 y 232 con FRONT+EXTERNAL,
y 207 con FRONT+HYBRID. Confirmar estos roles antes de resolver rutas dependientes.
La clasificación administrativa no habilita transacciones para otras entidades,
no determina BIN/Core/escenario y no cambia la plantilla ni la identidad de los
ATM QA/205. Se mantiene producción bloqueada.

Pruebas unitarias cubren entradas, agrupación y contradicciones; integración
cubre migraciones, identidad, auditoría, idempotencia, respaldo, bloqueo SQLite
y corrupción. E2E Electron verifica edición, cancelación, filtros, advertencias,
persistencia tras reinicio y ancho de 1024 px con datos sintéticos.
