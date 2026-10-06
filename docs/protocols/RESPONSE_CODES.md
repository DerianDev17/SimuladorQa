# Response Codes

## Base inicial

- `00`: aprobado.
- `91`: host no disponible/timeout segun material de referencia previo.

## Regla

El catalogo final debe provenir de la documentacion Coonecta/BANRED correspondiente. No asumir un catalogo generico como fuente de verdad.

## Modelo

Cada codigo tendra:
- code
- description
- semanticCategory: APPROVED | DECLINED | RETRYABLE | HOST_ERROR | UNKNOWN
- expectedBehavior
