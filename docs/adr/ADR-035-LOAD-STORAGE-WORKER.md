# ADR-035: persistencia de carga en worker e índices de historial

Fecha: 2026-11-07. Estado: implementado. Amplía ADR-033.

## Motivo

Las consultas SQLite síncronas y la lectura de JSON del historial se ejecutaban
en Main. Un bloqueo del archivo de hasta 500 ms detenía también sus temporizadores.
Se necesita mantener disponible el proceso que coordina IPC y operaciones.

## Decisión

- `WorkerLoadRunStore` implementa los mismos puertos de carga e historial. El
  worker es el único propietario de esa conexión SQLite; Renderer no accede a BD.
- Los mensajes se atienden en orden. `postMessage` copia los datos antes de ceder
  control; una mutación posterior del llamador no altera una escritura encolada.
- El cierre drena operaciones aceptadas antes de cerrar SQLite. Un error ordinario
  de SQLite se comunica sin rutas ni mensajes privados y permite consultas posteriores.
- Un timeout de 10 s o la caída del worker rechaza pendientes y deja el adaptador
  inhabilitado hasta reiniciar la aplicación. Nunca se recrea automáticamente para
  reenviar una escritura cuyo resultado pudiera haberse perdido. La recuperación
  existente de carga marca corridas activas como interrumpidas, sin reanudarlas.
- Migración transaccional a esquema 2: índices por estado/secuencia,
  operación/secuencia y fecha UTC/secuencia. Los filtros exclusivos de fecha usan
  su índice para evitar el recorrido por secuencia elegido por SQLite con LIMIT.
  Los payloads, UUID, secuencias y restricciones únicas se conservan.
- Las expresiones toleran JSON malformado al indexar, pero un índice parcial de
  JSON inválido hace fallar la consulta de historial: no se oculta corrupción como
  una página vacía. Los snapshots devueltos mantienen la validación completa.

## Consecuencias y límites

Se conserva `synchronous=FULL`, el bloqueo SQLite de 500 ms y la exclusión financiera.
Los filtros ATM principal/secundario siguen usando JSON dentro del worker; no se
introduce otra fuente de verdad ni una tabla de membresía sin medir su necesidad.
El worker protege Main pero no reduce por sí mismo la duración de una consulta.

Un ejecutable anterior que solo conoce el esquema 1 no abre el esquema 2. Para
retroceder, usar un respaldo previo de la BD; no reducir `user_version` manualmente
en datos de operación. Una migración fallida revierte sus cambios de esquema.
No se modifican los diarios financieros de saldo/retiro ni las reservas.

## Validación

SQLite real: migración 1→2 sin cambios de payload, plan de consulta indexado,
cursor, filtros combinados, corrupción y bloqueo. Worker real: orden, copia de
escrituras, cierre con trabajo pendiente, idempotencia, entradas inválidas, caída
de arranque, timeout sin reenvío y temporizadores activos durante bloqueo SQLite.
`node tooling/benchmark-load-history.mjs` compara consultas sintéticas de 1.000,
10.000 y 50.000 corridas. No acredita capacidad del Switch ni TPS financieros.
