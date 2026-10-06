# Dashboard realtime

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
