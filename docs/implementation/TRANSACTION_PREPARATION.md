# Preparacion documental de transacciones

## Valores completos de sesión QA — 2026-11-05

Por solicitud del operador, **Mostrar todos los valores de esta sesión** permite
consultar todos los campos sin máscara en Texto legible y Campos. Se activa por
defecto para mensajes nuevos de QA capturados con esta versión. Binarios se muestran
en HEX; PIN Block y criptogramas permanecen cifrados como en la trama original.
No incluye el PIN ingresado ni claves. Ver [ADR-037](../adr/ADR-037-QA-SESSION-MESSAGES.md).

La copia completa vive solo en memoria: últimas 20 solicitudes, máximo 15 minutos
desde su captura, hasta cambiar ambiente o cerrar la app. El historial y las
exportaciones conservan su versión protegida. Desactivar la opción vuelve a esa
versión. Salir de Mensajes retira los valores completos de la vista; reabrir consulta
su disponibilidad. Un error permite actualizar sin reenviar la transacción.
Registros anteriores o vencidos no se pueden desofuscar: se explica la ausencia
del original en lugar de completar valores con datos ajenos.

## REQ y RESP en texto legible — 2026-11-05

Mensajes abre por defecto **Texto legible**: identifica REQ/RESP, MTI y cada
campo ISO con su número, descripción y valor guardado. Incluye los tags EMV
públicos y mantiene las máscaras de ADR-030. **Campos** conserva la tabla y el
detalle individual. Las pestañas permiten consultar 0200/0210 y 0420/0430.
El texto procede de la proyección pública del mensaje real; no representa bytes
RAW ni reconstruye el wire. No cambia el envío ni el formato del diario.

Una operación histórica sin mensajes explica que no se pueden recuperar del
diario. Si hay otra operación con mensajes en el historial cargado, ofrece abrir
la última con REQ/RESP (o la última con REQ si no hay pares). El botón identifica
su STAN, cambia la operación inspeccionada y abre Mensajes; conserva el borrador
y no realiza un envío. No rellena tramas antiguas con datos de otras operaciones.
Timeout o respuesta ajena mantienen únicamente la solicitud realmente guardada.

Validación: formato público, máscaras, ausencia de mensajería, timeout, recuperación
SQLite tras TCP local, navegación Electron, acceso al registro con mensajes,
conservación del borrador y presentación estrecha. Datos sintéticos; sin host QA.

## Inspección interactiva — 2026-11-04

La disposición vigente es preparación compacta y resultado con pestañas
**Flujo / Mensajes / Evidencia**, seguida del historial local. Sustituye la
disposición de tres columnas y el flujo documental descritos en las secciones
históricas siguientes. Ver [ADR-036](../adr/ADR-036-TRANSACTION-INSPECTION.md).

El historial combina saldos y retiros QA, permite buscar operación/ATM/STAN/RRN
y filtrar ATM/resultado. Abrir una fila conserva borrador, monto y lectura; no
reenvía la transacción. Editar el formulario conserva el resultado inspeccionado.
Ocultar preparación conserva montado el lector. Nueva ejecución o Nueva
transacción cambia el contexto de inspección; salir de QA retira el historial.

Flujo permite seleccionar etapas y abrir su mensaje o evidencia. Sus estados
se derivan de la ejecución real disponible, sin simular tráfico ni tiempos.
Mensajes permite abrir el detalle de cada campo manteniendo su máscara.
Evidencia muestra la verificación del diario local, el Core sin verificar y la
referencia documental de la operación inspeccionada. La referencia incluye
fuente/versión/página; el original requiere TODO-DATA TRANSACTION-REFERENCE-SOURCES.

Aplicación/expiración se consultan en Detalles de la tarjeta; comprobante/reverso
tienen un desplegable propio. Código CMS queda en Evidencia. El observador remoto
se denomina Observación. Se eliminan el flujo estático y los botones RAW/HEX
deshabilitados. El resumen conserva incertidumbre, bloqueo y estado de reverso
visibles; importes/correlaciones adicionales quedan en detalle técnico.

Las fuentes del historial se leen de forma independiente. Un error conserva la
última lista disponible con aviso de historial incompleto; Actualizar permite
reintentar la lectura. El alcance es los últimos 50 registros por operación más
20 de sesión, no el diario completo. Registros antiguos sin mensajería explican
la ausencia de campos; no se completan con capturas ni con el borrador.

## Panel compacto de datos — 2026-10-29

El formulario sigue la referencia visual del operador: Cajero (ATM), Tarjeta,
Tipo de Transacción, Cuenta y Ejecutar Transacción. El ATM muestra su entidad
del catálogo. Cuenta usa un selector nativo accesible; importe, comprobante y
espera de reverso siguen disponibles cuando corresponden. El engranaje abre
las opciones existentes, incluido escenario, administración de ATM y limpieza.

Lector físico y Tarjeta configurada separan la lectura normal de la selección de
un perfil QA guardado. Cambiar modo o perfil invalida la tarjeta seleccionada.
El perfil sigue requiriendo tarjeta física y seguridad nueva del chip; no habilita
una tarjeta virtual. Tras leer se compactan los controles del lector, recuperables
con Cambiar. El resumen presenta PAN enmascarado, aplicación y expiración de la
lectura actual; los datos ausentes se identifican sin inventar emisor o producto.
El subtítulo de operación identifica explícitamente el código documental CMS;
la mensajería del resultado conserva el campo ISO realmente transmitido.

Validación Electron: orden y ancho del formulario, selección física y configurada,
perfil vacío, cambio de modo y cuenta, opciones por teclado, error por timeout,
vista estrecha y regresión del resultado ISO/reverso. Datos sintéticos, sin host QA.

## Mensajería junto al resultado — 2026-10-29

Después de enviar, Transacciones muestra Resultado y Mensaje ISO8583 uno al lado
del otro en escritorio, con pestañas Solicitud (0200) y Respuesta (0210). Se abre
la respuesta cuando está disponible. Cada fila corresponde a un campo presente
en la trama real del intento, con número, descripción y valor público; no se
rellena con la captura de ejemplo ni con los datos actuales del formulario.
El panel identifica STAN/RRN y se adapta a ventanas pequeñas.

Main proyecta la solicitud construida y únicamente la respuesta correlacionada
antes de borrar sus buffers. El diario guarda esa proyección opcional, compatible
con registros anteriores. PAN se enmascara; vencimiento, Track 2, PIN Block,
control de seguridad y contenidos privados/no aprobados se representan
con una máscara fija. F42/F43/F44 muestran texto sanitizado; F55 ofrece el
desglose de tags públicos de ADR-030 y protege los demás valores. No se guardan
ni exponen RAW/HEX o bytes originales.
Los campos públicos siguen el codec existente ISOBASEI/CB; no cambian envíos,
reglas financieras, codificación, correlación ni resultados.

Sin envío se distingue una solicitud preparada de una transmitida. Timeout o
respuesta no correlacionada conservan la solicitud sin inventar una respuesta.
Los registros antiguos indican que no tienen mensajería guardada. En retiro con
reverso, se muestran los cuatro mensajes 0200/0210/0420/0430 con resultados
independientes. La selección inicial sigue el mensaje disponible más reciente
hasta que el operador elige una pestaña. Cambiar de pestaña reinicia el scroll.
Ver todos los campos permite expandir la tabla sin desplazamiento interno.

TODO-DATA ISO-PRIVATE-FIELD-DISPLAY: queda pendiente ampliar la proyección de
F48/F53/F60/F62/F63 y tags EMV fuera de la lista pública. F42/F43/F44 y los tags
de ADR-030 se muestran según las fuentes existentes y la solicitud del usuario.

Criterios de aceptación: respuesta aprobada y rechazada, solicitud visible tras
timeout, exclusión de respuestas ajenas, validación estricta del diario,
recuperación tras reapertura y navegación por teclado. Pruebas con TCP local,
SQLite y datos sintéticos; no requieren operaciones financieras QA nuevas.

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
