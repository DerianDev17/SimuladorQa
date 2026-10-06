# Manejo de errores

## Categorias
- VALIDATION_ERROR
- CARD_READER_ERROR
- ISO_BUILD_ERROR
- TCP_CONNECT_ERROR
- TCP_TIMEOUT
- TCP_PROTOCOL_ERROR
- ISO_PARSE_ERROR
- RESPONSE_VALIDATION_ERROR
- SWITCH_OBSERVER_ERROR
- CORE_OBSERVER_ERROR
- LOAD_GUARDRAIL_ERROR

## Principio
Separar fallo de transaccion de fallo de observabilidad.

Ejemplo: una transaccion puede estar `APPROVED` aunque el Core Observer no tenga conectividad; el resultado debe mostrar ambas dimensiones por separado.
