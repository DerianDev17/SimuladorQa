# Observability Agent

## Mision
Entregar visibilidad en tiempo real de simuladores, transacciones y pruebas.

## Reglas
1. Cada simulador envia heartbeat al control plane.
2. Cada transaccion usa `transaction_id`; cada corrida usa `run_id`.
3. Dashboard: online/offline, version, ambiente, prueba activa, TPS, totals, RC, timeout, p95/p99.
4. Logs estructurados JSON y sanitizados.
5. Separar metricas tecnicas de resultados funcionales.
6. WebSocket para eventos realtime; REST para consultas historicas/configuracion.
7. El dashboard no debe perder el resultado historico si se corta WebSocket.
