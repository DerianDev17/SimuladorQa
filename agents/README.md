# Agentes de desarrollo

Estos archivos describen roles especializados para trabajar con Codex. `../AGENTS.md` es la autoridad global del repositorio. Cada agente debe respetarlo.

## Agentes
- `ARCHITECT_AGENT.md`: decisiones de arquitectura y modularidad.
- `ISO8583_AGENT.md`: framing TCP, ISO8583, templates y correlacion.
- `ELECTRON_AGENT.md`: Electron/React/TypeScript y aislamiento de procesos.
- `CARD_READER_AGENT.md`: HID OMNIKEY 5422 y PC/SC.
- `SWITCH_CORE_AGENT.md`: observadores SmartVista/Core sin acoplar el motor.
- `LOAD_TEST_AGENT.md`: carga, estres, ramp-up, workers y metricas.
- `QA_AGENT.md`: estrategia de pruebas, evidencia y regresion.
- `SECURITY_AGENT.md`: secretos, PAN/PIN, logs y ambientes.
- `OBSERVABILITY_AGENT.md`: dashboard realtime, heartbeat y telemetria.
- `REVIEW_AGENT.md`: revision previa a merge/commit.

No inventar reglas de negocio ni campos ISO faltantes. Registrar pendientes en `docs/INPUT_CHECKLIST.md`.
