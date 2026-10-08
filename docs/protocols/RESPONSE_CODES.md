# Response Codes

## Base inicial

- `00`: aprobado.
- `91`: host no disponible/timeout segun material de referencia previo.

## Regla

El catalogo final debe provenir de la documentacion Coonecta/BANRED correspondiente. No asumir un catalogo generico como fuente de verdad.

## Evidencia Extreme Mediator CMS v3.6

El manual distingue RetCode (999 request, 0 exito, 10 parcial), CodigoProceso y
MappedRespCode. El catalogo de pp. 23-24 se condiciona a ChannelId 21; para canal
ATM/POS 1 remite al estandar sin entregar un catalogo ATM Coonecta completo.
No igualar esos campos a F39 ni considerar aprobacion parcial como aprobacion
total. Tampoco confirma el 91 de la referencia inicial como timeout ATM.
Ver [fuente, paginas y pendientes](EXTREME_MEDIATOR_CMS_REVIEW.md).

## Evidencia puntual CB 205, 2026-10-08

Consulta 301000/STAN 007923: el cliente recibio F39 91 y el usuario confirmo
llegada a Mediator. Su msgResponse, TraceId 31580471, indica RetCode 8908,
RetMsg WS, PROCESADOR NO RESPONDE y MappedRespCode 10096. Se registra como
caso observado; no demuestra una equivalencia universal entre esos codigos,
un timeout concreto ni el punto de fallo HTTP/TLS del Core.
Ver [captura y prueba](CB_205_BALANCE_SAMPLE.md).

## Modelo de catalogo

Cada codigo tendra:
- code
- description
- semanticCategory: APPROVED | DECLINED | RETRYABLE | HOST_ERROR | UNKNOWN
- expectedBehavior
