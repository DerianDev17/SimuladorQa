# ADR-031: Retiros en pruebas de carga QA

Fecha: 2026-11-02. Estado: implementado; aceptación en host pendiente.

## Contexto y fuentes

El usuario solicita implementar retiros en carga, reducir deuda técnica y bugs.
El retiro individual ya tiene contrato QA/LOCAL/ahorros/USD en ADR-016, montos
personalizados explícitamente autorizados y proveedores validados por ATM.
ADR-025 define los bloqueos del diario; ADR-029 exige una conexión financiera
activa en el enlace. Ninguna de estas fuentes habilita retiros concurrentes en
el motor individual ni reenvíos automáticos ante incertidumbre.

## Decisión

- Extender el plan tipado con `WITHDRAWAL` y monto decimal obligatorio. Saldo
  conserva su formato anterior sin monto. Reutilizar `isWithdrawalAmount`.
- Ejecutar cada retiro mediante `DesktopApplication` y `WithdrawalService`, con
  el contrato y diario propios. Mantener concurrencia uno para retiros; saldo
  conserva 1–5. El mismo monto se aplica por operación y el host decide el resultado.
- Reutilizar preparación, sesión PIN, worker, límite TPS y almacenamiento de
  carga. No duplicar el motor financiero ni tocar builders ISO o perfiles privados.
- Validar todos los ATM y las reservas totales antes del PIN. Comprobar pendientes
  de saldo y bloqueos de retiro, incluso al iniciar carga de saldo.
- Conservar UUID nuevos, `runId` común, lectura/seguridad nuevas, una sola escritura
  por operación, parada al primer rechazo/error y tratamiento conservador del timeout.
- Mostrar operación e importe desde el plan persistido. No ejecutar reversos ni
  imprimir comprobantes durante la carga. No habilitar PREPROD o producción.

## Verificación y límites

Pruebas de dominio y driver, worker real, TCP loopback con dos ATM alternados,
SQLite reabierto y UI Electron con fuente sintética. Casos: aprobación, rechazo,
timeout, parada, importe inválido, contrato ausente y pendientes en diario.
La suite comprueba F4 del retiro, correlación, lectura nueva, PIN único por corrida
y ausencia de reintentos. Los perfiles de saldo históricos permanecen legibles.

TODO-DATA LOAD-WITHDRAWAL-QA-ACCEPTANCE: medir carga real con chip/host y conservar
resultados correlacionados antes de afirmar aceptación financiera o caudal real.
No bloquea la implementación local solicitada. Las reglas generales de montos,
sesión persistente y finalización EMV siguen pendientes en sus TODO-DATA existentes.
