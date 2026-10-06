# Modelo de entidades

## Campos sugeridos
- entityId
- code
- name
- networkType: COONECTA | BANRED | EXTERNAL
- memberType: FRONT | BACK | EXTERNAL
- active
- binRanges[]
- coreAdapterType

## Regla de escenario
- ATM emisor == tarjeta emisor dentro de Coonecta -> ATM_LOCAL.
- ATM y tarjeta distintos, ambos Coonecta -> ATM_RTC.
- tarjeta clasificada BANRED -> BANRED.
- resto configurado -> EXTERNAL.

La seleccion manual de escenario puede coexistir con deteccion automatica y debe alertar cuando haya inconsistencia.
