# Backlog inicial

## Epic 1 - Foundation
- [x] crear monorepo npm (desktop/domain/shared)
- [x] Electron shell seguro con IPC validado
- [x] TypeScript strict
- [x] React layout y navegacion inicial
- [x] seleccion de ambiente persistida y auditoria local
- [ ] configuracion completa de endpoints y limites (TODO-DATA ENVIRONMENT)
- [x] SQLite/Worker para catalogos de entidades y ATM, con auditoria atomica
- [ ] SQLite para historial transaccional
- [ ] logging transaccional sanitizado y rotacion

La primera entrega tiene pruebas unitarias, integracion y E2E Electron. Ver `docs/implementation/BOOTSTRAP.md`.

## Epic 2 - Hardware
- listar readers PC/SC
- detectar OMNIKEY 5422
- detectar tarjeta
- resolver perfil

## Epic 3 - Profiles
- [x] entidades CRUD (campos comunes, en borrador)
- [x] ATM CRUD (ambientes independientes, en borrador)
- [ ] membresia/BIN/Core y validacion de catalogos aprobados
- [ ] tarjetas CRUD con almacenamiento cifrado
- [ ] import CSV tarjetas

## Epic 4 - ISO/TCP
- field dictionary
- parser
- builder
- bitmap
- framing
- persistent connection
- timeout/reconnect

## Epic 5 - Transactions
- balance
- withdrawal approved
- withdrawal declined
- reversal
- timeout reversal

## Epic 6 - Observability
- ISO inspector
- SmartVista observer
- Core adapter
- evidence view

## Epic 7 - Load
- worker pool
- rate limiter
- single/multi ATM
- metrics

## Epic 8 - Distributed
- Control Plane
- agent registration
- heartbeat
- realtime dashboard
- distributed runs
