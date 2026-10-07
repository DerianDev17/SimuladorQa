# Preparacion documental de transacciones

## Alcance entregado

La pantalla Transacciones sigue la composicion del mockup: cuatro pasos,
formulario de contexto, recorrido ATM/Switch/Core, inspector e historial vacios.
Solo Datos Generales esta activo; revisar un borrador no avanza a ejecucion.

- Seleccion de ATM activo con entidad activa dentro de QA o PREPROD. Los perfiles
  siguen en estado DRAFT y requieren validacion.
- Escenario manual: LOCAL, RTC, BANRED o EXTERNAL. No se deduce del perfil/red.
- Cinco flujos MVP; ahorros/corriente para saldo y retiro.
- Catalogo del manual CMS v3.6: saldo 301000/302000 y retiro 011000/012000, con
  ceros preservados, version y pagina de fuente. Retiro aprobado y rechazado usan
  la misma operacion solicitada, sin forzar la respuesta.
- Monto de borrador para retiro como string con punto y dos decimales. No se
  convierte a float ni se genera ValueTrn/F4. Limite tecnico de representacion:
  11 digitos enteros y dos decimales; no es limite de negocio ni ISO.
- Reversos muestran la dependencia del original. No asignan codigo, cuenta,
  familia MTI, F90 ni timeout por suposicion.
- Lector/tarjeta, solicitud/respuesta/RAW/HEX y envio permanecen sin habilitar.
  No hay PAN, PIN, datos personales, tramas o resultados de ejemplo en el formulario.
- Cambio de ambiente reinicia el contexto. Recarga de perfiles invalida la
  revision y elimina una seleccion no disponible. Edicion de cualquier campo
  invalida el resultado anterior.

## Capas y contratos

`CmsV36Catalog` es un adaptador de metadatos en Main que implementa el puerto
`OperationCatalog` del dominio. La aplicacion recibe el adaptador por inyeccion;
el dominio y Renderer no importan una implementacion Core/SmartVista.
`AppSnapshot.documentedOperations` expone exclusivamente los metadatos publicos.

IPC `transaction:draft:review`: environment, transaction, scenario, atmId,
atmRevision, account y amount. Todos los campos son obligatorios en el contrato;
los datos ausentes se representan con null. Claves adicionales, PROD, UUID o
revision invalidos, cuentas no soportadas y montos ambiguos se rechazan.
Para reversos account/amount son null; para saldo amount es null: esto expresa
ausencia de una regla de monto validada, no un importe cero de una trama ISO.

Main verifica preferencias, lee el catalogo mediante Worker/SQLite y revalida
revision ATM, ambiente y estado del ATM/entidad antes de devolver DraftReview.
Toda revision conserva status BLOCKED y los requisitos de evidencia. No se
guarda como transaccion ejecutada ni genera runId, STAN, RRN o RC artificiales.

El resumen no certifica disponibilidad de fondos ni monto elegible. Incluso un
monto 0.00 con sintaxis correcta permanece bloqueado por reglas financieras
pendientes: no se interpreta como retiro permitido. Tampoco se asume moneda ni
denominaciones de dispensacion a partir del ejemplo del manual.

## Fallos y recuperacion

- ATM editado/eliminado/inactivo, entidad inactiva o ambiente obsoleto: CONFLICT,
  recargar contexto/perfiles.
- Dependencia de preparacion no configurada: SERVICE_UNAVAILABLE.
- Preferencias/base no accesibles: error sanitizado, sin excepcion interna.
- Timeout Worker: respuesta TIMEOUT y terminacion/reapertura segun el adaptador
  existente; el usuario puede recargar/revisar de nuevo. La operacion es de lectura.
- El puente Renderer tiene espera acotada de cinco segundos. Al desmontar la
  pantalla o cambiar el contexto se descartan respuestas tardias de una revision.
- Sin catalogo fiable se deshabilita Revisar requisitos, mostrando el error de
  catalogo y permitiendo recargar. No se crea un backend ficticio en navegador.

## Trazabilidad y comprobaciones

Fuente: [revision CMS v3.6](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md), pp. 17 y
20 del original. Prioridad sobre el mockup autorizada por el usuario el 2026-10-06.
Diseno visual: [revision del mockup](../mockups/MOCKUP_REVIEW.md).

Pruebas: `tests/unit/transaction-draft.test.ts` (catalogo, entradas, escenarios,
bloqueos y montos), `tests/integration/transaction-draft.test.ts` (Main con
preferencias y Worker SQLite reales, revision/ambiente, dependencia ausente y
timeout), `tests/e2e/desktop.spec.ts` (pantalla, cambio de cuenta/ambiente, monto,
reverso, edicion concurrente y recuperacion). Screenshot local ignorado:
`artifacts/transaction-workspace.png`; solo usa perfiles sinteticos de pruebas.

Pendientes: profiles aprobados/tarjetas, PIN/HSM, diccionario ATM, framing,
fixtures request/response, mapeo ISO/CMS, codigos ATM y observadores de lectura.
Ver [checklist de datos](../INPUT_CHECKLIST.md) y [backlog](../BACKLOG.md).
