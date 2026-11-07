# Índice de documentación

## Por dónde empezar

| Necesidad | Documento de referencia |
| --- | --- |
| Instalar, ejecutar y conocer el alcance actual | [README](../README.md) |
| Entender capas y dependencias implementadas | [Arquitectura](../ARCHITECTURE.md) |
| Seguir una solicitud financiera | [Flujo transaccional](architecture/DATA_FLOW.md) |
| Diagnosticar arranque o recarga | [Bootstrap](implementation/BOOTSTRAP.md) |
| Ejecutar carga de saldo o retiro | [Guía de carga](implementation/LOAD_TEST.md) |
| Exportar evidencia de una corrida | [Formatos y alcance](REPORTING.md) |
| Preparar una operación e inspeccionar mensajes | [Transacciones](implementation/TRANSACTION_PREPARATION.md) |
| Configurar y clonar ATM | [Plantilla ATM](implementation/MULTI_ATM_PROFILES.md) |
| Revisar consulta de saldo | [Saldo QA](implementation/BALANCE_EXECUTION.md) |
| Revisar retiro y comprobante | [Retiro](transactions/WITHDRAWAL.md) |
| Revisar reverso explícito y sus límites | [Reversos](transactions/REVERSAL.md) |
| Consultar Mediator | [Observador](implementation/MEDIATOR_OBSERVER.md) y [feed](implementation/DASHBOARD_LIVE_FEED.md) |
| Validar cambios | [Estrategia QA](testing/TEST_STRATEGY.md) |
| Consultar comandos y controles de CI | [CI vigente](CI_CHECKS.md) |
| Identificar datos que bloquean una regla | [TODO-DATA](TODO_DATA.md) y [checklist](INPUT_CHECKLIST.md) |
| Consultar lo que falta implementar o validar | [Backlog vigente](BACKLOG.md) |
| Entender por qué se tomó una decisión | [Índice ADR](adr/README.md) |
| Consultar entregas anteriores | [Changelog](../CHANGELOG.md) |
| Deuda técnica, rendimiento y UI | [Revisión 2026-11-07](implementation/TECHNICAL_REVIEW_20261107.md) |

## Cómo mantener estos documentos

- README y arquitectura describen el estado vigente. Las guías de implementación
  explican uso y límites; evitar copiar la misma guía en varias carpetas.
- Los ADR conservan decisiones, fuentes y sustituciones. Una decisión superada
  permanece trazable y no debe presentarse como comportamiento actual.
- `protocols/`, `core/` y las secciones fechadas de investigación conservan
  evidencia. Una aprobación de una muestra no valida todos los escenarios.
- `product/`, backlog y diagramas iniciales pueden contener alcance propuesto.
  Comprobar su estado frente a la implementación y los ADR vigentes.
- Los resultados de tests documentados son evidencia de la fecha indicada,
  no un contador permanente. La validación actual se obtiene ejecutando las suites.
- No cerrar TODO-DATA por inferencia ni eliminarlo porque exista un mock.
- Usar enlaces relativos a la fuente principal y revisar que resuelvan a archivos
  existentes después de mover o retirar documentación.

El inventario duplicado `architecture/COMPONENTS.md` fue retirado. Las capas y
responsabilidades se mantienen únicamente en [ARCHITECTURE.md](../ARCHITECTURE.md).
