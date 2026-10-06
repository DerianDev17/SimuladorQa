# Logging

## Campos comunes
- timestamp
- level
- agentId
- runId
- transactionId
- module
- event
- durationMs

## Sanitizacion
- PAN masked.
- no PIN.
- no CVV.
- no secrets.
- raw ISO solo en almacenamiento local restringido y sanitizado cuando sea posible.

## Rotacion
Implementar rotacion y limite de retencion configurable para evitar crecimiento sin control durante pruebas de carga.
