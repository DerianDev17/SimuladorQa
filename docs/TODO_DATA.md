# Registro de TODO-DATA

Este registro concentra los datos pendientes de fuente aprobada. Un `TODO-DATA`
no se cierra por inferencia ni por un mock: requiere especificación del
proveedor, captura/trama validada o confirmación formal registrada en un ADR.

Estado de todos los elementos: **BLOQUEADO** hasta recibir la fuente indicada.
La columna `Referencias` apunta a los documentos que explican el alcance.

| ID                                | Referencias                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| AMOUNT-RULES                      | `docs/INPUT_CHECKLIST.md`, `docs/transactions/WITHDRAWAL.md`, `docs/adr/ADR-016-QA-WITHDRAWAL-BALANCE-COMPATIBILITY.md` |
| ATM-IMAGE-ACTIVE-PROFILE          | `docs/INPUT_CHECKLIST.md`, `docs/implementation/BALANCE_EXECUTION.md`, `docs/protocols/ISOBASEI_REVIEW.md` |
| AUTOMATIC-FRAME-GENERATOR         | `docs/INPUT_CHECKLIST.md`, `docs/implementation/SEND_CONFIGURATION.md`, `docs/transactions/BALANCE_INQUIRY.md`, `docs/adr/ADR-011-OFFLINE-SEND-CONFIGURATION.md` |
| BALANCE-RESPONSE-CONTRACT         | `docs/INPUT_CHECKLIST.md`, `docs/transactions/BALANCE_INQUIRY.md`                                 |
| CARD-GROUP-VARIABLE-MAP           | `docs/INPUT_CHECKLIST.md`, `docs/implementation/CARD_READER_STATUS.md`, `docs/adr/ADR-019-QA-CHIP-CARD-PROFILES.md` |
| CARD-ISSUER-PRODUCT-DISPLAY       | `docs/INPUT_CHECKLIST.md`                                                                         |
| CARD-TRANSACTION-SECURITY         | `docs/hardware/EMV_IDENTITY_READING.md`, `docs/implementation/BALANCE_EXECUTION.md`               |
| CASE-FIELD-ORACLES                | `docs/INPUT_CHECKLIST.md`                                                                         |
| CB-96-CURRENT-SWITCH-LOG          | `docs/protocols/CB_205_BALANCE_SAMPLE.md`                                                         |
| CB-96-SWITCH-LOG                  | `docs/INPUT_CHECKLIST.md`, `docs/protocols/CB_205_BALANCE_SAMPLE.md`                              |
| CB-96-TRANSLATION                 | `docs/INPUT_CHECKLIST.md`                                                                         |
| CB-CURRENT-CORRELATION            | `docs/protocols/CB_205_BALANCE_SAMPLE.md`                                                         |
| CB-CURRENT-SWITCH-LINKS           | `docs/protocols/CB_205_BALANCE_SAMPLE.md`                                                         |
| CB-DYNAMIC-REQUEST                | `docs/protocols/CB_205_BALANCE_SAMPLE.md`                                                         |
| CB-PROCESSOR-ERROR                | `docs/core/MEDIATOR_ENTITY_205_ROUTING.md`, `docs/INPUT_CHECKLIST.md`, `docs/protocols/CB_205_BALANCE_SAMPLE.md` |
| CB-SEQUENCE-CONTRACT              | `docs/INPUT_CHECKLIST.md`, `docs/implementation/BALANCE_EXECUTION.md`                             |
| CB-SEQUENCE-INSTANCE              | `docs/implementation/PROVIDED_CONFIGURATION_AUDIT.md`                                             |
| CLEARDAEMON-CONFIG                | `docs/protocols/CB_205_BALANCE_SAMPLE.md`                                                         |
| CMS-ATM-MAPPING                   | `docs/INPUT_CHECKLIST.md`                                                                         |
| CMS-CORRELATION                   | `docs/protocols/VCP_LITE_450_REVIEW.md`                                                           |
| CMS-REVERSAL                      | `docs/INPUT_CHECKLIST.md`                                                                         |
| DASHBOARD-SWITCH-LIVE-FEED        | `docs/INPUT_CHECKLIST.md`, `docs/implementation/DASHBOARD_LIVE_FEED.md`                           |
| DEBITO-CONFIG-RUNTIME             | `docs/protocols/ISOBASEI_REVIEW.md`                                                               |
| DIEBOLD-91X-EMV-PROFILE           | `docs/INPUT_CHECKLIST.md`, `docs/implementation/BALANCE_EXECUTION.md`                             |
| ENTITY-CLASSIFICATION             | `docs/INPUT_CHECKLIST.md`, `docs/implementation/LOCAL_CATALOGS.md`, `docs/adr/ADR-004-LOCAL-CATALOGS.md` |
| ENVIRONMENT                       | `docs/INPUT_CHECKLIST.md`, `docs/BACKLOG.md`                                                      |
| GOLDEN-SAMPLES                    | `docs/INPUT_CHECKLIST.md`                                                                         |
| HARDWARE                          | `docs/INPUT_CHECKLIST.md`                                                                         |
| HSM-QA-PROVIDER                   | `docs/INPUT_CHECKLIST.md`                                                                         |
| ISO-PRIVATE-FIELD-DISPLAY         | `docs/INPUT_CHECKLIST.md`, `docs/implementation/TRANSACTION_PREPARATION.md`                       |
| ISO-SPEC                          | `docs/INPUT_CHECKLIST.md`, `docs/protocols/VCP_LITE_450_REVIEW.md`                                |
| LOAD-3TPS-PHYSICAL                | `docs/INPUT_CHECKLIST.md`, `docs/adr/ADR-027-CONCURRENT-ATM-LOAD.md`, `docs/adr/ADR-028-LOAD-PREPARATION-REUSE.md` |
| LOAD-LIMITS                       | `docs/INPUT_CHECKLIST.md`                                                                         |
| LOAD-PERSISTENT-TCP               | `docs/INPUT_CHECKLIST.md`, `docs/implementation/LOAD_TEST.md`, `docs/adr/ADR-027-CONCURRENT-ATM-LOAD.md`, `docs/adr/ADR-029-QA-SINGLE-FINANCIAL-CONNECTION.md` |
| LOAD-VIRTUAL-PROVIDER             | `docs/INPUT_CHECKLIST.md`, `docs/implementation/LOAD_TEST.md`, `docs/BACKLOG.md`, `docs/adr/ADR-020-PHYSICAL-CARD-LOAD.md` |
| MEDIATOR-FLOW-VERSION             | `docs/INPUT_CHECKLIST.md`, `docs/implementation/BALANCE_EXECUTION.md`, `docs/protocols/ISOBASEI_REVIEW.md` |
| MEDIATOR-OBSERVER-ACCESS          | `docs/INPUT_CHECKLIST.md`                                                                         |
| MEDIATOR-SQL-TIMEZONE             | `docs/INPUT_CHECKLIST.md`                                                                         |
| MULTI-ATM-CONCURRENCY             | `docs/implementation/MULTI_ATM_PROFILES.md`                                                       |
| MULTI-ATM-QA-RESULT               | `docs/implementation/MULTI_ATM_PROFILES.md`                                                       |
| OBSERVERS                         | `docs/INPUT_CHECKLIST.md`, `docs/adr/ADR-006-MEDIATOR-INSPECTION-TLS.md`                          |
| PCAP-LINK-PROFILES                | `docs/INPUT_CHECKLIST.md`, `docs/protocols/VCP_LITE_450_REVIEW.md`                                |
| PORT-CARD-EMV-PROFILE             | `docs/hardware/GUIA_PORTABILIDAD_PCSC_PYTHON_CPP.md`                                              |
| PORT-HOST-CONTRACT                | `docs/hardware/GUIA_PORTABILIDAD_PCSC_PYTHON_CPP.md`                                              |
| PORT-PCSC-TARGET                  | `docs/hardware/GUIA_PORTABILIDAD_PCSC_PYTHON_CPP.md`                                              |
| PORT-TRANSACTION-SECURITY         | `docs/hardware/GUIA_PORTABILIDAD_PCSC_PYTHON_CPP.md`                                              |
| PROFILES                          | `docs/INPUT_CHECKLIST.md`, `docs/transactions/BALANCE_INQUIRY.md`                                 |
| QA-ARQC-900108                    | `docs/INPUT_CHECKLIST.md`                                                                         |
| QA-EMV-VERSION-CVM-BINDING        | `docs/INPUT_CHECKLIST.md`, `docs/implementation/BALANCE_EXECUTION.md`                             |
| QA-EXECUTION-ACTIVATION           | `docs/implementation/QA_PIN_EXECUTION.md`                                                         |
| QA-F35-FIX-HOST-VALIDATION        | `docs/INPUT_CHECKLIST.md`, `docs/implementation/BALANCE_EXECUTION.md`                             |
| QA-INVALID-RESPONSE-900107        | `docs/implementation/BALANCE_EXECUTION.md`, `docs/protocols/QA_SWITCH_LOGS_20261016.md`          |
| QA-LOCAL-TEST-BINDING             | `docs/implementation/QA_PIN_EXECUTION.md`                                                         |
| QA-PIN-FORMAT-MAPPING             | `docs/implementation/QA_PIN_EXECUTION.md`                                                         |
| QA-PIN-INSTANCE-BINDING           | `docs/implementation/PROVIDED_CONFIGURATION_AUDIT.md`                                             |
| QA-RC19-900102                    | `docs/INPUT_CHECKLIST.md`, `docs/implementation/BALANCE_EXECUTION.md`                             |
| QA-RC19-900103                    | `docs/INPUT_CHECKLIST.md`, `docs/implementation/BALANCE_EXECUTION.md`                             |
| QA-RC19-900104                    | `docs/INPUT_CHECKLIST.md`, `docs/implementation/BALANCE_EXECUTION.md`                             |
| QA-RC939-900107                   | `docs/implementation/BALANCE_EXECUTION.md`                                                        |
| QA-SEQUENCE-POOL-REPLENISHMENT    | `docs/INPUT_CHECKLIST.md`, `docs/implementation/BALANCE_EXECUTION.md`                             |
| QA-TCS-WIRE-KEY-EXCHANGE          | `docs/INPUT_CHECKLIST.md`, `docs/implementation/QA_PIN_EXECUTION.md`                              |
| QA-TWO-PROFILE-EXECUTION          | `docs/implementation/MULTI_ATM_CONTEXT.md`                                                        |
| QA-VIRTUAL-CARD-SECURITY          | `docs/implementation/QA_PIN_EXECUTION.md`                                                         |
| QA-WITHDRAWAL-900114-CORE         | `docs/INPUT_CHECKLIST.md`, `docs/transactions/WITHDRAWAL.md`, `docs/adr/ADR-016-QA-WITHDRAWAL-BALANCE-COMPATIBILITY.md` |
| QA-WITHDRAWAL-900114-WIRE         | `docs/INPUT_CHECKLIST.md`, `docs/transactions/WITHDRAWAL.md`                                      |
| QA-WITHDRAWAL-EMV-GENERATION      | `docs/INPUT_CHECKLIST.md`, `docs/transactions/WITHDRAWAL.md`                                      |
| QA-WITHDRAWAL-RC59-900125         | `docs/INPUT_CHECKLIST.md`                                                                         |
| QA-WITHDRAWAL-RESULT-RULES        | `docs/transactions/WITHDRAWAL.md`                                                                 |
| REVERSAL-CARD-RETAINED            | `docs/INPUT_CHECKLIST.md`, `docs/transactions/REVERSAL.md`                                        |
| REVERSAL-EMV-COMPLETION           | `docs/transactions/REVERSAL.md`                                                                   |
| REVERSAL-QA-ACCEPTANCE            | `docs/transactions/REVERSAL.md`                                                                   |
| SQL-TLS-SERVER-CERTIFICATE        | `docs/INPUT_CHECKLIST.md`, `docs/implementation/SWITCH_CONNECTION.md`                             |
| SWITCH-ATM-ACCESS                 | `docs/INPUT_CHECKLIST.md`, `docs/protocols/VCP_LITE_450_REVIEW.md`                                |
| SWITCH-ATM-ACCESS-CURRENT         | `docs/implementation/QA_CAPTURE_REPLAY.md`, `docs/protocols/QA_SWITCH_LOGS_20261013.md`          |
| VISA-NETWORK-RESPONSE-POLICY      | `docs/INPUT_CHECKLIST.md`, `docs/protocols/CB_205_BALANCE_SAMPLE.md`                              |
| WITHDRAWAL-DEBIT-AND-REMAINING    | `docs/INPUT_CHECKLIST.md`, `docs/transactions/WITHDRAWAL.md`                                      |
