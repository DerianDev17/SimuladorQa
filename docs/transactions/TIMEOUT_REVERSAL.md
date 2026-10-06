# Reverso por timeout

## Flujo
`0200 -> WAITING -> timeout -> generar reverso -> enviar -> validar`.

## Requisitos
- timer configurable por ambiente;
- proteccion contra doble reverso;
- registrar si la respuesta original llega tarde;
- politica clara para late response;
- correlacion de original/reverso.

Los tiempos exactos deben provenir de la especificacion operativa.
