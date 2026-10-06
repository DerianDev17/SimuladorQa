# Contratos iniciales Control Plane

## POST /agents/register
Registra una instancia.

## POST /agents/{id}/heartbeat
Estado periodico.

## POST /runs
Crea un run coordinado.

## POST /runs/{id}/metrics
Publica muestras agregadas.

## POST /runs/{id}/events
Publica eventos relevantes sanitizados.

## WebSocket
Canales sugeridos:
- fleet.status
- run.metrics
- run.events
- run.command

Los contratos exactos se formalizaran con OpenAPI durante desarrollo.
