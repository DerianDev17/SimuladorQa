# Dashboard realtime

**Diseño propuesto para carga distribuida, no implementado.** El Inicio actual
de la app usa el [feed Mediator](docs/implementation/DASHBOARD_LIVE_FEED.md);
los resultados locales de carga se describen en la [guía de carga](docs/implementation/LOAD_TEST.md).
Las vistas Fleet y Run centralizadas siguientes dependen del Control Plane.

## Vista Fleet
Por agente:
- online/offline
- hostname
- version
- ambiente
- prueba activa
- TPS
- conexiones
- CPU/RAM opcional
- last heartbeat

## Vista Run
- target TPS
- actual TPS
- total sent/received
- approved/declined
- timeouts/errors
- p50/p90/p95/p99
- response code distribution
- agents participantes
- ATM activos

## Vista Transaction Stream
Tabla acotada de ultimas transacciones:
- timestamp
- agent
- ATM
- PAN masked
- type
- STAN
- RC
- latency
- status

No renderizar todas las transacciones de una prueba masiva; usar ventanas y agregados.
