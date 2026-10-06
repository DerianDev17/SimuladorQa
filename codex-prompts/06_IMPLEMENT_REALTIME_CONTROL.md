# Codex task: Realtime control plane

Read `docs/architecture/DISTRIBUTED_ARCHITECTURE.md` and `docs/observability/REALTIME_DASHBOARD.md`.

Implement simulator registration, heartbeat, WebSocket telemetry and historical persistence. Each simulator has simulator_id and version; each test has run_id; each transaction has transaction_id. Build for five initial desktop agents but avoid hardcoded limits.
