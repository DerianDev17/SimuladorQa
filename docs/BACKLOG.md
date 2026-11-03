# Backlog vigente

Revisión: 2026-11-03. Este documento separa desarrollo pendiente de aceptación
externa. La lista inicial queda en el historial Git; sus casillas no describían
el estado actual. Alcance implementado en [README](../README.md) y
[arquitectura](../ARCHITECTURE.md).

## Implementado, sin confundirlo con certificación

- Saldo y retiro QA/LOCAL/ahorros con seguridad por operación, monto explícito,
  correlación, diarios SQLite e idempotencia. La consulta de saldo tiene evidencia
  QA aprobada; esto no valida todos los perfiles o resultados financieros.
- Retiro + reverso explícito tras aprobación y espera local. No es un reverso
  automático por timeout ni una simulación completa del dispensador ATM.
- Carga de saldo y retiro, varios ATM alternados con una tarjeta física,
  planificación inmutable, parada, recuperación, métricas y persistencia.
  Saldo admite 1–5 operaciones en curso; retiro conserva ejecución secuencial.
- Historial de carga paginado con filtros y detalle; exportación CSV/JSON de
  evidencia local sanitizada de corridas cerradas, sin certificación Core (ADR-033).
- Catálogos locales, perfiles QA de chip con referencias públicas, casos guardados
  y expectativas locales; no equivalen a un pool de tarjetas virtuales.
- Feed e historial Mediator, inspector protegido y separación de Renderer,
  dominio, puertos financieros y adaptadores, con controles de arquitectura.

## Desarrollo pendiente

El orden es una propuesta de trabajo; no autoriza envío financiero ni completa
los contratos externos que necesita cada función.

| Prioridad | Función pendiente | Dependencia y criterio de cierre |
| --- | --- | --- |
| 1 | Conciliación automática con SmartVista/Core | Observadores de solo lectura, consulta/correlación aprobada y reglas de resultado; contrastar diario, respuesta y asiento sin inferir ausencia de débito |
| 1 | Reverso automático por timeout y tratamiento de respuestas tardías/parciales | Contrato de reverso, timers, duplicados y finalización EMV; demostrar casos aprobados con original correlacionado |
| 2 | Ampliar ejecución a corriente, PREPROD financiero y otros escenarios/entidades | Perfiles ISO, seguridad, endpoints y muestras aprobadas por escenario; la selección en UI no basta |
| 2 | Carga con múltiples tarjetas o proveedor virtual | LOAD-VIRTUAL-PROVIDER y QA-VIRTUAL-CARD-SECURITY; obtener seguridad nueva por operación sin reutilizar mensajes capturados |
| 2 | Sesiones TCP financieras persistentes | LOAD-PERSISTENT-TCP; validar ciclo de sesión, gestión, correlación y respuestas tardías antes de reutilizar sockets |
| 2 | Validación de casos por campos ISO y secuencias | CASE-FIELD-ORACLES; comparar contra reglas aprobadas, además del veredicto local por resultado/código |
| 3 | Ampliar visualización de campos privados y datos de tarjeta | ISO-PRIVATE-FIELD-DISPLAY / CARD-ISSUER-PRODUCT-DISPLAY / CARD-GROUP-VARIABLE-MAP; mapa y clasificación aprobados, sin exponer secretos |
| 3 | Carga distribuida y Control Plane | Registro de agentes, coordinación, agregación y operación central; propuesta arquitectónica aún sin implementación |

Fuentes: [TODO-DATA](TODO_DATA.md), [retiro](transactions/WITHDRAWAL.md),
[reversos](transactions/REVERSAL.md), [carga](implementation/LOAD_TEST.md),
[casos](implementation/SAVED_CASES.md) y
[preparación](implementation/TRANSACTION_PREPARATION.md).

## Validación externa pendiente

- Carga de retiros con chip, host y correlación financiera real:
  LOAD-WITHDRAWAL-QA-ACCEPTANCE. Las pruebas locales ya cubren el motor.
- TPS sostenidos con lector físico y host, límites y ventanas autorizados:
  LOAD-3TPS-PHYSICAL / LOAD-LIMITS. Los presets de 3/5 TPS son objetivos.
- Aceptación de cada ATM y del reverso explícito:
  MULTI-ATM-QA-RESULT / REVERSAL-QA-ACCEPTANCE.
- Reglas financieras de importes, saldos posteriores, comisiones y resultados
  inciertos: AMOUNT-RULES / WITHDRAWAL-DEBIT-AND-REMAINING /
  QA-WITHDRAWAL-RESULT-RULES. Conservar la evidencia sin remapear resultados.
- Certificado/cadena SQL aprobados y acceso permanente de solo lectura:
  SQL-TLS-SERVER-CERTIFICATE / OBSERVERS. Una excepción puntual no los resuelve.

Los detalles y conflictos entre fuentes están en
[INPUT_CHECKLIST](INPUT_CHECKLIST.md). Este registro contiene investigaciones
fechadas; prevalece la decisión posterior aplicable, sin borrar la evidencia.

## Deuda técnica identificada

- Actualizar de forma compatible la cadena ESLint/TypeScript-ESLint afectada por
  el hallazgo de minimatch registrado en la
  [revisión técnica del 2026-11-02](implementation/TECHNICAL_REVIEW_20261102.md).
  Repetir auditoría y validaciones al realizar ese cambio; no aplicar una
  degradación automática ni un override mayor sin verificar compatibilidad.
- Seguir consolidando documentos históricos por módulo. No usar una casilla
  antigua como prueba de que falta código ni cerrar TODO-DATA con mocks.

Producción permanece bloqueada por arquitectura y no forma parte de este backlog
operativo de QA.
