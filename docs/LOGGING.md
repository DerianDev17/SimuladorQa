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

El observador Mediator no registra ni persiste Journal/Message, SQL, credenciales
o errores originales del driver. Solo devuelve una proyeccion limitada y la
estructura XML protegida. queryId usa UUID y queriedAt UTC; fechas de negocio SQL
se muestran sin inferir zona. Ver `docs/implementation/MEDIATOR_OBSERVER.md`.

## Rotacion
Implementar rotacion y limite de retencion configurable para evitar crecimiento sin control durante pruebas de carga.
