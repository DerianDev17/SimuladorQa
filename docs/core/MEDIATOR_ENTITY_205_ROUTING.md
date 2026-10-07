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
El acceso desde la PC y el contrato/framing siguen pendientes.

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
  faltan acceso desde la PC al PID, transporte/TLS, framing y contrato ISO
  aprobado. Ambiente QA y recorrido cajero -> Switch -> Core confirmados;
  no hay envio directo al Core.
- CMS-TRANSPORT: metodo, ruta/operacion exacta, Content-Type, cabeceras,
  autenticacion, TLS y unidad/semantica de entEndPointTimeOut.
- CMS-XML-CONTRACT: request/response emparejados y sanitizados o contrato validado
  del servicio, incluyendo errores. La ruta por si sola no define la envoltura.
- MEDIATOR-ENTITY-CHANNEL: alcance y significado de canales 1/21 y mapeo a
  perfiles locales. No escoger canal 21 automaticamente para una transaccion ATM.

La nueva URL es un destino de servicio, independiente del acceso SQL del
observador. No resuelve el certificado SQL ni la credencial con minimo privilegio.
Solo la parte de envio dependiente del acceso al PID y contrato permanece
bloqueada. El observador SQL PREPROD existente conserva su configuracion y alcance.
