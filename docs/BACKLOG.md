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

Los items marcados corresponden a funcionalidad implementada y verificada. Las
fuentes/ambientes autorizados se siguen en `docs/INPUT_CHECKLIST.md`; configurar
un borrador no completa esos requisitos.

## Epic 2 - Hardware
- [ ] listar readers PC/SC
- [ ] detectar OMNIKEY 5422
- [ ] detectar tarjeta
- [ ] resolver perfil

## Epic 3 - Profiles
- [x] entidades CRUD (campos comunes, en borrador)
- [x] ATM CRUD (ambientes independientes, en borrador)
- [ ] membresia/BIN/Core y validacion de catalogos aprobados
- [ ] tarjetas CRUD con almacenamiento cifrado
- [ ] import CSV tarjetas

## Epic 4 - ISO/TCP
- [ ] field dictionary ATM aprobado
- [ ] parser
- [ ] builder
- [ ] bitmap
- [ ] framing
- [ ] persistent connection
- [ ] timeout/reconnect de transporte ATM

## Epic 5 - Transactions
- [x] revision del mockup y manual CMS v3.6 con matriz de los cinco flujos
- [x] catalogo documental por cuenta: saldo 301000/302000 y retiro 011000/012000
- [x] fuente/version/pagina y adaptador CMS separado del dominio
- [x] pantalla de transacciones con pasos, formulario, recorrido e inspector vacios
- [x] seleccion ATM/entidad activos por ambiente, conservando estado borrador
- [x] cuenta ahorros/corriente y validacion de sintaxis de monto sin floats
- [x] revision de borrador por IPC y revalidacion de ambiente/version ATM en Main
- [x] bloqueo explicito de reverso/original y requisitos de envio
- [x] invalidacion del contexto al editar, recargar o cambiar ambiente
- [x] plantillas documentales por operacion/cuenta que conservan ATM/escenario
- [x] feedback de monto y checklist local/requisitos de envio en vivo
- [x] resumen del contexto revisado por Main con UUID y timestamp UTC
- [x] borrador conservado al navegar durante la sesion y accion Limpiar borrador
- [ ] guardar/cargar casos persistentes con evidencia sanitizada
- [ ] balance real (ISO-SPEC / GOLDEN-SAMPLES / ENVIRONMENT / PROFILES)
- [ ] withdrawal approved real
- [ ] withdrawal declined real
- [ ] reversal real
- [ ] timeout reversal real

Ver `docs/implementation/TRANSACTION_PREPARATION.md`. Revisar el borrador no
genera una transaccion ni se cuenta como un flujo MVP aprobado.

## Epic 6 - Observability
- [x] inspeccion autenticada de esquema Mediator PREPROD y matriz de evidencia
- [x] compatibilidad de destino en revision Main con esquema observado, sin truncado
- [ ] cuenta de solo lectura y TLS aprobado para Observer permanente
- [ ] vinculo entidad/canal/terminal y query de correlacion Mediator aprobada
- [x] estados vacios del inspector, recorrido, historial y metricas sin datos ficticios
- [ ] ISO inspector con evidencia sanitizada (Parsed / RAW / HEX)
- [ ] SmartVista observer
- [ ] Core adapter read-only
- [ ] evidence view con resultados reales

## Epic 7 - Load
- [ ] worker pool de carga
- [ ] rate limiter
- [ ] single/multi ATM
- [ ] metrics de ejecucion

## Epic 8 - Distributed
- [ ] Control Plane
- [ ] agent registration
- [ ] heartbeat
- [ ] realtime dashboard
- [ ] distributed runs
