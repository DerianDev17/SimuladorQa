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

## Cotejo del stash original — 2026-11-19

Se revisaron los 13 archivos del stash `8be869dd`, llamado
`WIP local deposit antes de pull origin/main`. Estaban en su árbol de archivos
no rastreados; no constituían cambios adicionales sobre los archivos rastreados.
Este cotejo posterior permite recuperar los originales omitidos sin sustituir
las mejoras posteriores a la reconstrucción:

- `deposit-service.ts` ya coincide. Dominio, builder y catálogo QA conservan la
  implementación vigente y la validación compartida de `6d5e22b`.
- Se incorporan las comprobaciones de importe en F4, F23/PAN19 sanitizados,
  rechazo de diarios mixtos y validación CDOL1/política EMV que faltaban en las
  pruebas unitarias. Se conserva el helper actual de respuesta y se construye
  explícitamente la variante sintética de 19 dígitos.
- La prueba original de plantilla, perfil/pool de archivo, PIN/AC, TCP y SQLite
  se recupera como `tests/integration/deposit-template.test.ts`, junto a las
  pruebas vigentes de transporte y migración del diario.
- El contrato recupera preparación, requisitos y detalles de los TODO-DATA
  privados/F55. La retención de mensajes se actualiza a ADR-046.
- `tooling/start.mjs`, el filtro de logs y sus pruebas quedaron sustituidos por
  `47fa845`: los lanzadores muestran stdout/stderr directamente y prueban sus
  dependencias. No se restaura ese filtro anterior.

No se incorporan reglas financieras nuevas ni se cierran los TODO-DATA con
pruebas sintéticas. La implementación de depósito ya estaba en `main`; este
cotejo completa su cobertura y documentación.
