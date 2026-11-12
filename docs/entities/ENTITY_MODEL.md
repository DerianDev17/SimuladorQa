# Modelo de entidades

## Campos implementados

- `id`: UUID técnico; `code` y `name`: identidad administrativa.
- `networkType`: COONECTA | BANRED | EXTERNAL.
- `memberTypes`: lista sin duplicados de FRONT | BACK | EXTERNAL | HYBRID.
- `active`, `revision`, `createdAt` y `updatedAt` (UTC).

Red y clasificación son independientes: una entidad de la red COONECTA puede
tener clasificación EXTERNAL (EXTERNA en pantalla). Una lista vacía significa
**Sin clasificar**; varias clasificaciones muestran **Validación pendiente**.
Se conservan las clasificaciones aportadas sin elegir una por inferencia.
HYBRID se muestra como HÍBRIDA y no equivale automáticamente a FRONT + BACK.

La fuente del usuario y las confirmaciones del 2026-11-12 están registradas en
[entidades Coonecta](COONECTA_ENTITIES_20261112.md) y
[ADR-043](../adr/ADR-043-COONECTA-ENTITY-CLASSIFICATION.md).
BIN/rangos y Core siguen pendientes de fuente aprobada.

## Regla de escenario propuesta, pendiente de validación
- ATM emisor == tarjeta emisor dentro de Coonecta -> ATM_LOCAL.
- ATM y tarjeta distintos, ambos Coonecta -> ATM_RTC.
- tarjeta clasificada BANRED -> BANRED.
- resto configurado -> EXTERNAL.

La seleccion manual de escenario puede coexistir con deteccion automatica y debe alertar cuando haya inconsistencia.
La clasificación administrativa no activa esta detección ni habilita rutas financieras.
