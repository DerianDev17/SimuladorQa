# Evidencia de destino de entidad 205

## Fuente recibida

El usuario aporto el 2026-10-07 dos filas de `USR_RelationEntity` y una captura
de SSMS para CB Cooperativa. La captura muestra consultas para canales 21 y 1;
las sentencias de modificacion visibles son contenido de la evidencia, no
instrucciones para ejecutarlas. No se modifico SQL Server ni se llamo al endpoint.

El usuario confirmo despues que el destino corresponde a **QA** y que el flujo
es cajero -> Switch/SmartVista -> Core -> respuesta. La app simula el cajero y
su punto de entrada es el Switch/SmartVista de QA. La URL aportada identifica
el servicio Core configurado en el servidor; no se aplica como host TCP del
simulador. Posteriormente aporto el host/puerto ATM del Switch y capturas del
PID/netstat, confirmando todos esos enlaces como QA y ejecucion desde su PC.
Ver [evidencia de red](../implementation/SWITCH_NETWORK_EVIDENCE.md).
El acceso desde la PC y el framing de consulta fueron comprobados el 2026-10-08;
el contrato general y la generacion de nuevas transacciones siguen pendientes.

El esquema PREPROD previamente inspeccionado contiene estos nombres/tipos de
columnas; la captura permite reconocer los campos, pero no certifica el esquema
runtime de QA ni permite cambiar el ambiente del perfil SQL existente:

| Campo | Valor aportado | Tipo observado |
| --- | --- | --- |
| entEntityId | 205 | smallint |
| entEntitySubId | 205 | varchar(12) |
| entSubName | CBCOOPERAT | varchar(50) |
| entEntityName | CB COOPERAT | varchar(50) |
| entSubSystem | ADPCOREGEN | varchar(50), nullable |
| entSPI | en blanco; no se infiere NULL o cadena vacia | varchar(50), nullable |
| entChannel | 21 y 1, una fila por canal | smallint |
| entEndPoint | misma URL HTTPS con ruta /coordinador/serviceifi/ | varchar(max), nullable |
| entEndPointTimeOut | 20000; unidad por confirmar | int, nullable |
| entLogInfo | 1 | bit, nullable |
| entTraceInfo | 1 | bit, nullable |

La URL completa y la captura se conservan solo como evidencia privada ignorada
en `artifacts/mediator-entity-205-routing.json` y
`artifacts/mediator-entity-205-routing.png`, con UUID, UTC y SHA-256 de captura.
No son configuracion activa de envio ni un contrato aprobado.

## Que permite avanzar

Esta evidencia identifica el destino configurado en Mediator para la entidad
205 en dos canales. Complementa la consulta Journal/Message ya aportada para
entidad 205/canal 1; no prueba que cada transaccion de ese canal haya usado la URL
ni define la semantica de los canales o el estado del servicio. QA fue confirmado
por el usuario para el destino; no se infiere el ambiente de la conexion SSMS.
La asociacion con UUID de entidades/ATM locales debe ser explicita.

El nombre ADPCOREGEN se conserva como identificador del adaptador del servidor;
no se infiere de su nombre el contrato HTTP, SOAP, REST o los campos XML.
Tampoco se convierte 20000 a segundos ni se aplica como timeout del simulador
hasta confirmar su unidad/alcance. Los flags de logs no autorizan registrar
datos sensibles en la app.

## TODO-DATA acotados

- SWITCH-ATM-ACCESS / SWITCH-ATM-FRAMING: entrada ATM del Switch recibida;
  acceso desde PC y consulta capturada comprobados. Faltan contrato ISO general,
  generacion de nuevos mensajes y coexistencia de sesiones prolongadas.
  Ambiente QA y recorrido cajero -> Switch -> Core confirmados;
  no hay envio directo al Core.
- CMS-TRANSPORT: metodo, ruta/operacion exacta, Content-Type, cabeceras,
  autenticacion, TLS y unidad/semantica de entEndPointTimeOut.
- CMS-XML-CONTRACT: recibido par XML aportado para retiro de USD 10, con limites
  y diferencias en [muestra de entidad 205](MEDIATOR_ENTITY_205_MESSAGE_SAMPLE.md).
  Origen MDT_Message.msgRequest/msgResponse confirmado por el usuario; faltan
  etapas de registro, contrato validado del servicio y casos de error.
  La ruta por si sola no define la envoltura.
- MEDIATOR-ENTITY-CHANNEL: alcance y significado de canales 1/21 y mapeo a
  perfiles locales. No escoger canal 21 automaticamente para una transaccion ATM.

La nueva URL es un destino de servicio, independiente del acceso SQL del
observador. No resuelve el certificado SQL ni la credencial con minimo privilegio.
Solo la parte de envio dependiente del acceso al PID y contrato permanece
bloqueada. El observador SQL PREPROD existente conserva su configuracion y alcance.

## Confirmacion del PID CB, 2026-10-08

El usuario confirma que CB Cooperativa 205 corresponde al PID SmartVista 82052
y solicita trabajar solo con esa entidad. tcpcomms01.out de QA registra ese PID
con destino 172.60.60.156:49212; el PID 82032 aparece en 49276 y queda fuera
del alcance CB confirmado. El simulador conserva entrada ATM 16100; no abre
directamente el enlace del Mediator. La muestra de retiro USD 20 / STAN 001391,
encaminada a 82032 en los logs previos, deja de ser un caso elegible para CB.
Ver [revision de admision y destinos](../protocols/QA_SWITCH_ADMISSION_REVIEW.md).

## Consulta desde PC y error del procesador

El 2026-10-08 se envio una consulta 301000, STAN 007923, terminal ATM20521.
El usuario confirma que aparece en SmartVista y Mediator. El cliente recibio
0210/F39 91; msgResponse TraceId 31580471 registra RetCode 8908,
RetMsg WS, PROCESADOR NO RESPONDE y MappedRespCode 10096 a las 13:04:58.076.
Esto confirma llegada a Mediator, sin probar llegada efectiva al Core ni el
mapeo exacto de sus codigos a F39. Un log adicional registra ISOREQUEST a las
13:04:37.544 y timeout esperando AUTHTD/AUTHTD a las 13:04:52.545, RC=8908.
TODO-DATA CB-PROCESSOR-ERROR: identificar proceso/servidor emisor, configuracion
y ruta AUTHTD, y correlacionar con ADPCOREGEN/PROXY205 antes de atribuir el
fallo a HTTP/TLS o cambiar plazos. La espera de esa fuente dura 15.001 segundos.
Ver [captura y evidencia correlacionada](../protocols/CB_205_BALANCE_SAMPLE.md).
