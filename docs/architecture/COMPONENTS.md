# Componentes

## Estado de implementacion inicial

Implementados: Desktop UI, preload IPC tipado, DesktopApplication en Main y
PreferencesStore como puerto con adaptador de archivo para ambiente y auditoria.
El dominio solo cataloga escenarios/transacciones documentados y sus requisitos
pendientes; no implementa el motor transaccional descrito mas abajo.

El resto de componentes sigue planificado. Ver `../implementation/BOOTSTRAP.md`
y `../adr/ADR-003-DESKTOP-BOOTSTRAP.md`.

## Desktop UI
Responsable de interaccion con QA. No accede directamente a sockets, BD remotas ni secretos.

## CardReaderAdapter
Abstraccion de PC/SC. Detecta lector, insercion/retiro y obtiene datos permitidos por la tarjeta.

## Profile Manager
Administra entidades, ATM y tarjetas.

## Transaction Engine
Orquesta una transaccion funcional y mantiene su state machine.

Estados sugeridos:
`CREATED -> BUILDING -> CONNECTING -> SENT -> WAITING -> RECEIVED -> VALIDATING -> CORRELATING -> COMPLETED/FAILED/TIMED_OUT/REVERSED`.

## ISO8583 Engine
Construccion, parsing, bitmap, codecs y validacion de campos.

## TCP Engine
Framing, conexiones persistentes, reconexion, timeout y correlacion socket/request.

## Load Engine
Generacion de concurrencia, rate limiting y workers.

## Switch Observer
Busca evidencia de la transaccion en SmartVista sin alterar datos.

## Core Adapter
Interfaz comun para consultar diferentes Cores.

## Realtime Agent
Heartbeats y streaming de metricas al Control Plane.
