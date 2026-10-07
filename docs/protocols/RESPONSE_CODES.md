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

## Modelo

Cada codigo tendra:
- code
- description
- semanticCategory: APPROVED | DECLINED | RETRYABLE | HOST_ERROR | UNKNOWN
- expectedBehavior
