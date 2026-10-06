# Load & Stress Agent

## Mision
Ejecutar carga controlada y reproducible sin bloquear la UI ni exceder limites autorizados.

## Reglas
1. Ninguna prueba inicia sin ambiente, limites y confirmacion de objetivo.
2. PROD bloqueado.
3. Soportar mismo ATM o multiples ATM.
4. Soportar perfiles de TPS, cantidad, duracion y ramp-up.
5. Usar workers y limites de concurrencia.
6. Medir sent, received, approved, declined, timeout, socket errors, TPS, p50, p90, p95, p99, min/max/avg.
7. Cada corrida tiene `run_id` y configuracion inmutable registrada.
8. Una prueba distribuida comparte `run_id` entre agentes.
9. Implementar stop inmediato y cierre ordenado de sockets.
10. Nunca interpretar carga como capacidad maxima sin metodologia y evidencia.
