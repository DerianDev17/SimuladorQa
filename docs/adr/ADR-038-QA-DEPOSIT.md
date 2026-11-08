# ADR-038: depósito de prueba QA con monto vinculado a EMV

Estado: implementación local; aceptación host/Core pendiente.
Confirmación de alcance registrada: 2026-11-05. Documento completado: 2026-11-08.

## Contexto y fuentes

El commit `322f272` integró canales IPC, formulario, codec y preparación de
depósito, pero omitió cinco módulos y los documentos enlazados. Se completa
esa entrega usando la confirmación ya registrada en INPUT_CHECKLIST/TODO_DATA
y los contratos de código y pruebas de ese commit. No se presenta esta
reconstrucción como recuperación de los originales ni como aprobación nueva
del proveedor. El [contrato de depósito](../transactions/DEPOSIT.md) distingue
la prueba autorizada de los datos aún pendientes.

## Decisión

Agregar una fachada DepositService sobre FinancialExecutionService, un builder
NewVisaDeposit sobre el codec existente y validadores estrictos de dominio.
Mantener catálogo QA independiente del CMS del proveedor y diario propio.
Se admite exclusivamente QA/LOCAL/ahorros/USD, F3=211000, importe positivo,
9C=30, 9F02=monto y seguridad nueva. La plantilla y sus reservas se revalidan
antes del envío; nunca se reutiliza material de la captura.

No añadir nuevas reglas de framing, HSM, Core o interpretación de campos
privados. Conservar la clasificación ya implementada en el remoto: RC12 no
aprobado; RC00 requiere monto exacto y correlación. Otras respuestas permanecen
por revisar. Sin reintentos, reversos, impresión ni carga de depósitos.

Como salvaguarda local, una entrega incierta o fallo de persistencia bloquea
otro depósito; no se hereda la excepción de continuación de retiros. Esto no
define una regla financiera ni concilia el intento previo. Las extensiones
dependientes de QA-DEPOSIT-RESULT-RULES siguen bloqueadas.

## Consecuencias y validación

Se conserva separación UI/dominio/adaptadores, exclusión financiera e idempotencia
durable. No se habilita PROD ni PREPROD. Las pruebas sintéticas cubren importe,
validación, seguridad nueva, errores, timeout, historial y persistencia; no
certifican aceptación ni abono real. QA-DEPOSIT-HOST-ACCEPTANCE,
QA-DEPOSIT-PRIVATE-FIELDS, QA-DEPOSIT-F55-ENVELOPE y QA-DEPOSIT-RESULT-RULES
permanecen abiertos.
