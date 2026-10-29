# Índice de decisiones de arquitectura

Los ADR registran decisiones y su vigencia. El estado se deriva del propio ADR y
del código; si el ADR no declara un estado explícito, se indica `Aceptado`.
Cuando una decisión reemplaza a otra, ambas se conservan para trazabilidad.

| ADR                                                          | Decisión                                          | Estado                                      |
| ------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------- |
| [001](ADR-001-ELECTRON.md)                                   | Electron + TypeScript + React                     | Aceptado                                    |
| [002](ADR-002-CONTROL_PLANE.md)                              | Control Plane central                             | Propuesto; no implementado                  |
| [003](ADR-003-DESKTOP-BOOTSTRAP.md)                          | Base desktop y configuración local inicial        | Aceptado                                    |
| [004](ADR-004-LOCAL-CATALOGS.md)                             | Catálogos locales en SQLite                       | Aceptado                                    |
| [005](ADR-005-TRANSACTION-PREPARATION.md)                    | Preparación transaccional con catálogo documental | Aceptado para preparación local             |
| [006](ADR-006-MEDIATOR-INSPECTION-TLS.md)                    | Inspección de Mediator en SQL Server PREPROD      | Autorización puntual consumida              |
| [007](ADR-007-OFFLINE-CAPTURE-ENVELOPES.md)                  | Encapsulado offline basado en capturas            | Aceptado; contratos de negocio pendientes   |
| [008](ADR-008-LOCAL-SAVED-CASES.md)                          | Casos documentales persistentes por ambiente      | Aceptado                                    |
| [009](ADR-009-MEDIATOR-OBSERVER.md)                          | Observador limitado de Mediator                   | Aceptado; acceso real pendiente             |
| [010](ADR-010-MANUAL-CARD-IDENTITY.md)                       | Identidad de tarjeta por lectura manual EMV       | Aceptado                                    |
| [011](ADR-011-OFFLINE-SEND-CONFIGURATION.md)                 | Configuración de envío y planes offline           | Aceptado para configuración/preparación     |
| [012](ADR-012-CB-BALANCE-EXECUTION.md)                       | Consulta CB mediante puertos privados en Main     | Aceptado; proveedor QA pendiente            |
| [013](ADR-013-QA-PIN-AND-FIRST-AC.md)                        | PIN nativo y primera AC para saldo QA             | Implementado; activación financiera pendiente |
| [014](ADR-014-ONE-TIME-BALANCE-RESERVATION-INSPECTION.md)    | Inspección puntual de reserva de saldo QA         | Autorización puntual consumida              |
| [015](ADR-015-QA-SEQUENCE-POOL-REPLENISHMENT.md)             | Reposición puntual del pool QA de ATM20521        | Ejecutado; excepción consumida              |
| [016](ADR-016-QA-WITHDRAWAL-BALANCE-COMPATIBILITY.md)        | Retiro QA con la preparación PIN/EMV de saldo     | Vigente; montos ampliados                   |
| [017](ADR-017-LOCAL-VIRTUAL-CARD-FIXTURES.md)                | Referencias virtuales locales sin credenciales    | Aceptado                                    |
| [018](ADR-018-QA-CARD-REFERENCE-INVENTORY.md)                | Inventario QA de referencias de tarjeta           | Aceptado                                    |
| [019](ADR-019-QA-CHIP-CARD-PROFILES.md)                      | Perfiles QA de chip y captura segura              | Aceptado                                    |
| [020](ADR-020-PHYSICAL-CARD-LOAD.md)                         | Carga QA con una tarjeta física                   | Implementado; primera corrida QA pendiente  |
| [021](ADR-021-QA-CARD-DISPLAY-MASK.md)                       | Mostrar primeros seis y últimos cuatro del PAN    | Implementado                                |
| [022](ADR-022-LOCAL-CASE-VERDICTS.md)                        | Expectativas y veredictos locales de casos QA     | Aceptado                                    |
| [023](ADR-023-SHARED-QA-LINK-KEY.md)                         | Referencia de clave de enlace compartida en QA    | Aceptado                                    |
| [024](ADR-024-REUSABLE-ATM-TEMPLATE.md)                      | ATM20521 como plantilla de envío reutilizable     | Aceptado                                    |
| [025](ADR-025-QA-WITHDRAWAL-AFTER-ERROR.md)                  | Nuevas transacciones QA tras un retiro con error  | Implementado                                |
| [026](ADR-026-SEQUENTIAL-MULTI-ATM-LOAD.md)                  | Varios perfiles ATM en carga física               | Sustituido por ADR-027                      |
| [027](ADR-027-CONCURRENT-ATM-LOAD.md)                        | Solicitudes concurrentes de varios ATM en carga   | Sustituido por ADR-029 para el enlace QA    |
| [028](ADR-028-LOAD-PREPARATION-REUSE.md)                     | Reutilizar procesos durante la preparación        | Implementado; caudal QA pendiente           |
| [029](ADR-029-QA-SINGLE-FINANCIAL-CONNECTION.md)             | Una conexión financiera activa en el enlace QA    | Vigente                                     |
| [030](ADR-030-ISO-DISPLAY-AND-REVERSAL-MESSAGES.md)          | Proyección ISO visible y mensajería del reverso   | Implementado; validación host pendiente     |
