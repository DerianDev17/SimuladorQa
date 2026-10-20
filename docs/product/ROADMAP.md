# Roadmap

## Fase 0 - Fundaciones
- Monorepo.
- Electron shell.
- Configuracion segura.
- SQLite local.
- Logging sanitizado.
- CI local.

## Fase 1 - Flujo funcional
- OMNIKEY 5422.
- ATM/Card profiles.
- ISO8583 builder/parser.
- TCP connection.
- Consulta saldo.
- Inspector ISO.

## Fase 2 - MVP transaccional
- Retiro aprobado.
- Retiro rechazado.
- Reverso.
- Timeout reversal.
- SmartVista observer.
- Core adapter inicial.

## Fase 3 - Carga local
- Worker pool.
- TPS configurable con tope local actual de 5 TPS para la primera campaña QA.
- Single ATM / multi ATM.
- Metricas p50/p90/p95/p99.
- Preparador QA de consultas de saldo con techo local provisional de 5 TPS; envio bloqueado hasta contar con fuente de tarjetas/seguridad QA, limites de corrida y motor de carga. Ver `../implementation/LOAD_TEST.md`.

## Fase 4 - Operacion distribuida
- Control Plane.
- 5+ agentes.
- Heartbeats.
- Dashboard realtime.
- Runs distribuidos.

## Fase 5 - Expansion
- Nuevos tipos de transaccion.
- Nuevas redes.
- Importacion de PCAP/templates.
- Mas Core adapters.
