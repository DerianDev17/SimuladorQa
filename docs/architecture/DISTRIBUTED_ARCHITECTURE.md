# Arquitectura distribuida

**Propuesta, no implementada.** El alcance operativo es una estación desktop.
La estructura vigente está en [ARCHITECTURE.md](../../ARCHITECTURE.md) y los
pendientes en [BACKLOG.md](../BACKLOG.md). Los agentes, heartbeats y coordinación
descritos a continuación son diseño objetivo, no servicios disponibles.

## Modelo

Cada PC de QA ejecuta un Electron Agent autonomo. Un Control Plane central registra agentes y consolida metricas.

## Escalabilidad

No se impone un limite logico de 5 maquinas. La capacidad real depende de:

- limites de SVFE;
- conexiones concurrentes;
- TPS permitido por ambiente;
- Core;
- red;
- capacidad del Control Plane.

## Heartbeat

Cada agente envia periodicamente:

- agentId
- hostname
- version
- environment
- status
- activeRunId
- currentTPS
- activeConnections
- lastError

## Run distribuido

Un `runId` comun agrupa trabajo de multiples agentes. El coordinador asigna target TPS y conjunto de ATM a cada agente.
