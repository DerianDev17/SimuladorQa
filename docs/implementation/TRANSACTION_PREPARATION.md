# Preparacion documental de transacciones

## Alcance entregado

La pantalla Transacciones sigue la composicion del mockup: cuatro pasos,
formulario de contexto, recorrido ATM/Switch/Core, inspector e historial vacios.
Solo Datos Generales esta activo; revisar un borrador no avanza a ejecucion.

La igualacion visual compacta la cabecera, controles y paneles; agrega conectores
en pasos/recorrido y tabla vacia del inspector. Los requisitos, referencia CMS y
PCAP siguen visibles debajo del resumen de historial/metricas, separados de un
mensaje ejecutado. Ver todas abre Historial conservando el borrador de la sesion.
Guardar como caso permanece deshabilitado. QA/PREPROD y estados pendientes
conservan el mismo contrato; no se agrega un resultado o conexion ficticios.

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
- Plantillas documentales de saldo/retiro por ahorros/corriente. Seleccionar una
  cambia operacion/cuenta y limpia monto, conservando ATM y escenario; no completa
  campos bancarios ni es un fixture ISO aprobado.
- Validacion del monto al escribir, con aria-invalid, ayuda asociada y foco en
  el campo al solicitar revision con sintaxis incorrecta. No corrige ni convierte
  automaticamente coma, signo, ceros iniciales o decimales de la entrada.
- Checklist de preparacion local separado de requisitos de envio. Seleccionar
  un perfil en borrador completa la seleccion, no su validacion QA. Las reglas
  de monto y dependencia del original aparecen antes de pulsar Revisar requisitos.
- Resumen del contexto devuelto por Main: ambiente, escenario, operacion, ATM y
  revision, cuenta, monto y codigo documental; reviewId UUID y reviewedAt UTC.
  Hora convertida a local solo en UI. Estos IDs identifican una revision local,
  no una transaccion ejecutada ni una autorizacion para enviar.
- Borrador y resumen conservados al navegar dentro del mismo ambiente durante
  la sesion. Cambiar ambiente o Limpiar borrador reinicia los datos. No se guardan
  casos en disco ni se restaura el borrador tras cerrar/reiniciar la app.

## Capas y contratos

La inspeccion de Mediator PREPROD agrega una comparacion de compatibilidad del
destino al revisar. Main usa un puerto DestinationInspector con evidencia guardada;
la UI muestra longitudes incompatibles sin modificar los perfiles y deja pendiente
el vinculo entidad/canal/terminal. No se aplica esa evidencia a QA ni prueba una
conexion activa. Ver `docs/core/MEDIATOR_SCHEMA_REVIEW.md`.

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
El contrato de respuesta ReviewedDraft agrega reviewId/reviewedAt desde Main;
el payload de entrada no puede suministrarlos. El resumen representa ese instante
de revision y debe volver a revisarse tras editar; no garantiza estado futuro de
un perfil ni de dependencias externas. draftBlockers centraliza los requisitos
por operacion para la vista previa y la respuesta del dominio.

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
La mejora incluye `tests/unit/draft-feedback.test.ts` y comprobaciones Electron
de plantillas, feedback/foco, navegacion conservada, resumen e invalidacion.
`artifacts/transaction-review-summary.png` captura un contexto sintetico revisado.

La pantalla agrega evidencia sanitizada de diez PCAP y 218 envolventes verificadas
del enlace BANRED. Es referencia del analisis offline, independiente de una
revision de borrador; no es un mensaje generado/recibido por la app. La vista
no cambia TrnCode CMS ni habilita RAW/HEX. Ver [revision PCAP](../protocols/PCAP_REVIEW.md).

Pendientes: profiles aprobados/tarjetas, PIN/HSM, diccionario ATM, perfiles de framing aprobados por ambiente,
fixtures request/response, mapeo ISO/CMS, codigos ATM y observadores de lectura.
Ver [checklist de datos](../INPUT_CHECKLIST.md) y [backlog](../BACKLOG.md).
