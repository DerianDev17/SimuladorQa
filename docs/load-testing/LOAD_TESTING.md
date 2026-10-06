# Carga y estres

## Modos
- cantidad fija de transacciones;
- TPS objetivo + duracion;
- ramp-up;
- single ATM;
- multi ATM;
- single card / card pool.

## Parametros
- targetTPS
- duration
- transactionCount
- concurrency
- connectionCount
- atmStrategy
- cardStrategy
- rampUp
- timeout

## Metricas
- sent
- received
- approved
- declined
- timeouts
- tcpErrors
- tpsCurrent
- tpsAverage
- latencyMin/Avg/Max
- p50/p90/p95/p99
- activeConnections

## Guardrails
Cada ambiente debe tener limites configurados. La app debe impedir superar el limite sin una elevacion autorizada de configuracion.
