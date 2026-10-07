# Reverso por timeout

## Flujo
`0200 -> WAITING -> timeout -> generar reverso -> enviar -> validar`.

La secuencia anterior expresa la intencion funcional, no un template de red
aprobado. Extreme Mediator CMS v3.6 no aporta timeout, retry, triggers de reverso
ni politica de respuesta tardia. Su tabla MTI (p. 23) no permite escoger el
reverso automaticamente; tampoco confirma un RC para timeout local.
Ver [revision y pendientes](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md).

## Requisitos
- timer configurable por ambiente;
- proteccion contra doble reverso;
- registrar si la respuesta original llega tarde;
- politica clara para late response;
- correlacion de original/reverso.

Los tiempos exactos deben provenir de la especificacion operativa.
