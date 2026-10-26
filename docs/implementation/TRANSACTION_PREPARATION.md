# Preparacion documental de transacciones

## Rediseño aprobado e implementado — 2026-10-14

Se sustituye el recorrido de tres pasos por un formulario único, panel de resultado y
actividad de sesión. La lectura manual selecciona automáticamente su identidad válida;
no se necesita Continuar ni Usar esta tarjeta. Retirada, cambio de lector, fallo y limpieza
siguen invalidando la selección. El polling solo comprueba vigencia y nunca selecciona.

Revisar transacción y las referencias documentales son herramientas opcionales dentro
de Opciones y detalles técnicos. Se eliminan del Renderer las comprobaciones duplicadas
de formato de terminal, estado documental y plazos como requisitos del botón. Main sigue
validando cada solicitud, configuración, perfil, PIN/EMV y alcance, antes de transmitir.
No se amplían las operaciones soportadas ni se cambian contratos ISO/TCP.

El resultado incierto conserva requestId y el bloqueo de reintento. Los últimos 20
intentos de esta sesión se muestran con el resultado real, incluidos los bloqueados
sin transmisión. Recuperar un intento actualiza su fila; cambiar ambiente limpia la vista.
Los casos locales, configuración rápida, PREPROD y protección de datos se conservan.

La cabecera incorpora Conectar/Desconectar mediante el control existente, solo por
acción explícita. Esta entrega se verifica con fixtures sintéticos y servicios locales;
no requiere enviar transacciones QA/PREPROD.

Validación del rediseño: build, lint, TypeScript strict, comprobación de seguridad y
formato correctos; 631 pruebas unitarias, 143 de integración y 47 E2E aprobadas.
Las E2E incluyen lectura automática tras acción manual, invalidación al retirar o
cambiar tarjeta, polling concurrente, selección por teclado, resultado incierto,
actividad de sesión, casos guardados y cambio de ambiente. Las dos pruebas del
lanzador de desarrollo quedan pendientes porque el puerto 5173 estaba ocupado;
no se interrumpió el servidor existente. Las pruebas financieras usan dependencias
sintéticas; la prueba de conexión usa loopback y comprueba cero bytes enviados.

## Historial del alcance entregado

Los recorridos de tres pasos descritos a continuación son anteriores al rediseño.
La sección anterior y docs/ux/UX_SPEC.md describen la interfaz vigente.


Actualizacion 2026-10-14: para consulta local de ahorros QA, Enviar transaccion
es la accion principal y utiliza los datos guardados sin revision manual
obligatoria. Al elegir ATM y tarjeta se puede iniciar la solicitud; Main valida
las dependencias y devuelve el resultado o la causa concreta sin transmision.
Revisar transaccion queda opcional. La descripcion historica siguiente de
un boton siempre deshabilitado no aplica a esta consulta directa.

La pantalla Transacciones presenta tres acciones: Datos de la transaccion,
Elegir tarjeta y Revisar y enviar. Los botones del recorrido enfocan y desplazan
la seccion correspondiente; el paso actual expresa preparacion local, nunca
una ejecucion financiera.

Inicio abre el mismo formulario mediante Nueva transaccion. No mantiene un
segundo formulario de preparacion con controles de ATM/tarjeta deshabilitados.

1. Seleccionar ATM, escenario, operacion, cuenta y monto cuando aplica. Continuar
   a tarjeta verifica seleccion de ATM y formato del monto, enfoca el campo
   pendiente y conserva los datos. Si no hay ATM, ofrece Crear entidad o Crear
   ATM segun el catalogo activo, sin generar perfiles ficticios. La configuracion
   abre el editor y regresa al mismo borrador con el ATM activo recien creado;
   selecciona exclusivamente el UUID/revision que devuelve Main para ese ambiente.
   Cancelar conserva el contexto sin seleccionar un perfil.
2. Seleccionar lector, insertar tarjeta por contacto, pulsar Leer tarjeta y luego
   Usar esta tarjeta. Es una lectura manual de identidad mediante el IPC existente;
   no crea una transaccion ATM. Continuar sin tarjeta por ahora permite revisar
   un borrador parcial y mantiene visible la tarjeta pendiente.
3. El resumen muestra ambiente, ATM, escenario, operacion, cuenta, monto y
   referencia enmascarada de tarjeta. Revisar transaccion revalida el contexto
   desde Main; Enviar transaccion permanece deshabilitado y explica que el envio
   real se habilitara posteriormente. Ningun boton de este recorrido abre TCP,
   transmite ISO, genera PIN/EMV financiero ni declara una aprobacion.

Preparacion y pendientes, flujo/inspector, historial/metricas, documentacion CMS
y capturas se muestran bajo demanda. El resumen del contexto revisado se
expande para ver su referencia y detalles; el resumen operativo no se duplica.
Monto/reverso muestran sus dependencias breves en el formulario y los requisitos
completos en Preparacion y pendientes.

Ver todas abre Historial conservando el borrador de la sesion.
Guardar como caso permite persistir contextos documentales DRAFT por ambiente;
ver [casos locales](SAVED_CASES.md). QA/PREPROD y estados pendientes conservan
el mismo contrato; no se agrega un resultado o conexion ficticios.

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
- Lector y seleccion de identidad disponibles para la UI mediante la lectura
  manual documentada. Solicitud/respuesta/RAW/HEX y envio permanecen sin habilitar.
  No hay PAN completo, PIN, tramas ni resultados de ejemplo en el formulario.
- Referencia de tarjeta solo en memoria del Renderer: readId, readerName,
  panMasked y applicationLabel. No agrega tarjeta al DraftRequest ni la guarda
  en casos, preferencias o logs. Main sigue validando un contexto documental
  independiente de esa referencia; no valida asociacion de cuenta/tarjeta.
- Cambio de lector, retirada/reset, nueva lectura o error de consulta invalidan
  seleccion y revision. Volver a la vista consulta su vigencia desde Main antes
  de permitir usarla. Limpiar/cargar un caso y cambiar ambiente exigen seleccion
  nueva. El polling del selector se detiene al salir de Transacciones.
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
  de monto y dependencia del original aparecen antes de pulsar Revisar transaccion.
- Resumen del contexto devuelto por Main: ambiente, escenario, operacion, ATM y
  revision, cuenta, monto y codigo documental; reviewId UUID y reviewedAt UTC.
  Hora convertida a local solo en UI. Estos IDs identifican una revision local,
  no una transaccion ejecutada ni una autorizacion para enviar.
- Borrador y resumen conservados al navegar dentro del mismo ambiente durante
  la sesion. Cambiar ambiente o Limpiar borrador reinicia los datos. No se guardan
  automaticamente borradores en disco ni se restaura el formulario tras reiniciar;
  los casos guardados explicitamente se recuperan desde Casos guardados.
- Limpiar un borrador con datos pide confirmacion. Conservar borrador y Escape
  mantienen datos, tarjeta y revision. Confirmar limpieza elimina el contexto de
  sesion y enfoca el primer paso, conservando los casos persistidos.
- El ambiente se bloquea durante lectura manual, revision y dialogos de casos o
  limpieza. El estado ocupado combina estas operaciones para que terminar una
  lectura no desbloquee un proceso que aun esta pendiente.

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

Los errores de revision aparecen junto a la confirmacion y su boton de reintento.
Las validaciones de entrada permanecen junto al formulario y enfocan el campo
pendiente; los errores del lector se muestran en Elegir tarjeta.

- ATM editado/eliminado/inactivo, entidad inactiva o ambiente obsoleto: CONFLICT,
  recargar contexto/perfiles.
- Dependencia de preparacion no configurada: SERVICE_UNAVAILABLE.
- Preferencias/base no accesibles: error sanitizado, sin excepcion interna.
- Timeout Worker: respuesta TIMEOUT y terminacion/reapertura segun el adaptador
  existente; el usuario puede recargar/revisar de nuevo. La operacion es de lectura.
- El puente Renderer tiene espera acotada de cinco segundos. Al desmontar la
  pantalla o cambiar el contexto se descartan respuestas tardias de una revision.
- Sin catalogo fiable se deshabilita Revisar transaccion, mostrando el error de
  catalogo y permitiendo recargar. No se crea un backend ficticio en navegador.

## Trazabilidad y comprobaciones

Fuente: [revision CMS v3.6](../protocols/EXTREME_MEDIATOR_CMS_REVIEW.md), pp. 17 y
20 del original. Prioridad sobre el mockup autorizada por el usuario el 2026-10-06.
Presentacion actual: [UX minimalista](../ux/UX_SPEC.md), solicitada el 2026-10-11.

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

La regresion del recorrido guiado usa identidades sinteticas y verifica lectura
manual, seleccion explicita, resumen, navegacion, retirada de tarjeta, aislamiento
QA/PREPROD, entradas invalidas, lector no disponible, timeout y recuperacion.
`tests/unit/transaction-card.test.ts` valida la proyeccion y rechazo de presencia
sin identidad. Captura sintetica: `artifacts/guided-transaction.png`.

Las mejoras de configuracion rapida, confirmacion de limpieza y filtros de casos
se verifican en `tests/unit/transaction-ui-tools.test.ts` y Electron. Se comprueba
retorno/cancelacion, entradas sensibles, catalogo no disponible, conservacion del
borrador y casos, teclado y ajuste de biblioteca a una ventana de 1024 px.

Configuracion/preparacion de envio (2026-10-11): Main inicializa el destino QA
documentado sin plazos inventados ni sockets. Revisar prepara automaticamente un
plan local cuando hay configuracion. La UI ofrece Configurar envio y muestra los
pendientes de generacion, sin pedir HEX. El plan no certifica una trama ni una
transmision: `docs/implementation/SEND_CONFIGURATION.md` y ADR-011.

La seleccion de tarjeta exige coincidencia entre lector presente, identidad y
estado de lectura. Una respuesta IPC de otra interfaz se rechaza y no habilita
Usar esta tarjeta. Cambiar interfaz limpia errores anteriores; un fallo por
retiro consulta estado inmediatamente sin repetir la lectura del chip. La
regresion Electron de 2026-10-11 usa exclusivamente identidades sinteticas.
