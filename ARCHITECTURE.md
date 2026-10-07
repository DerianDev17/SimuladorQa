# Arquitectura de alto nivel

## Objetivo

Permitir que varias estaciones QA ejecuten transacciones ATM funcionales y carga controlada, mientras una capa central monitorea agentes, consolida metricas y permite correlacionar cada transaccion con Switch y Core.

## Componentes

1. **Desktop App / Electron Agent**
   - React Renderer
   - Electron Main
   - Card Reader Adapter
   - ATM/Card Profile Manager
   - Transaction Engine
   - ISO8583 Engine
   - TCP Engine
   - Load Engine
   - Local SQLite
   - Realtime Agent

2. **Control Plane**
   - REST API
   - WebSocket Gateway
   - Agent Registry / Heartbeats
   - Run Coordinator
   - Metrics Aggregator
   - PostgreSQL

3. **Transaction Targets**
   - SVFE / Switch Coonecta
   - Core Adapter(s)
   - BANRED / Externa segun escenario

4. **Observers**
   - SmartVista Observer: consulta datos de correlacion del Switch.
   - Core Observer: valida aplicacion contable o respuesta Core.
   - Consulta Mediator PREPROD: puerto independiente, SQL parametrizado y
     redaccion XML en proceso PowerShell/.NET externo al Renderer. La vista
     no asigna resultados transaccionales. Ver ADR-009.

## Restricciones

- Produccion bloqueada.
- El Control Plane no genera tramas ISO por si mismo; coordina agentes.
- Las pruebas de carga deben tener limites configurados por ambiente.
- Los datos sensibles se enmascaran antes de salir del agente.

## Diagrama

Ver `docs/architecture/architecture_overview.png`.
