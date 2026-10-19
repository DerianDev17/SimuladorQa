# Emisor de captura ATM para una prueba QA

## Objetivo y alcance

Logs del 13 de octubre recibidos posteriormente: tcpcomms01.out confirma
el rechazo por direccion invalida de 10.10.10.21 en find_device_using_address,
puertos 54364 y 51944 a 12:05:17 y 12:11:27. El primero correlaciona con el
intento local por endpoint completo. Se resuelve la falta de log actual;
queda validar configuracion activa de admision y coexistencia de sesiones.
NWINT muestra otro retiro ATM20530 con 00 y reverso, sin consulta ATM20521.
Ver ../protocols/QA_SWITCH_LOGS_20261013.md. No se transmite otro replay
para sustituir una consulta nueva; proveedor PIN/EMV/contexto sigue pendiente.

Revision 2026-10-13: intento autorizado runId
49c58b04-903e-483d-820b-c76120000aca conecta a 12:05:18 Ecuador pero termina
ADMISSION_DENIED antes del write: cero bytes financieros. Probe posterior
4b8afd61-c700-4725-9f5e-da801e82c453 a 12:11:27, sin enviar datos, confirma
texto exacto NO AUTHORIZATION y cierre del peer. Endpoint, origen local y
hash del payload preparado coinciden con el replay aprobado del 12 de octubre;
no se atribuye este rechazo a PIN/EMV, ATC ni al Core.

SELECT de Mediator, diagnostico b08ffba4-5b7f-4bf0-9653-ec8706bc6a88,
confirma consulta 301000/ATM20521/secuencia 7939 a 2026-10-13 11:53:18.383
(reloj del Journal), TraceId 31580499, RetCode 0 y respuesta APROBADO.
Compatible con la transaccion del cajero indicada por el usuario; no prueba
por si sola su aplicacion contable. Habilitacion, ruta y flags SQL consultados
coinciden con el diagnostico previo del 12 de octubre. No hubo DML/DDL.

Unico cambio remoto propio registrado: cfg de Mediator, Step 008 OnError
0121 -> 012, aplicado 2026-10-12 16:48:07 Ecuador; no modifica admision TCP.
No se pudo comprobar su hash vigente por falta de acceso a W/Y y UNC.
TODO-DATA SWITCH-ATM-ACCESS-CURRENT: configuracion activa de admision del
listener/PID 80131 y tcpcomms01.out del 13 de octubre, ventana 12:05-12:12
Ecuador, para identificar el dispositivo y motivo concreto del rechazo.
Los logs locales disponibles son del 12; no usarlos como estado actual ni
sustituir la IP/configuracion del cajero activo por la del simulador.

Diagnostico de la prueba 2026-10-12 18:00:44 Ecuador: el usuario aporta monitor
18:00:45.130 con Ret=5/motivo 1136, y catalogo OCTOCLI_PCI RetCode 11136 =
ATC Duplicado, TAGs Counters, mapeo 5. SELECT propio confirma 11136 y ausencia
de 1136 en ese catalogo. El socket recibio F39=96; la traduccion entre esos
codigos y correlacion por STAN/UTRNNO siguen pendientes. La seguridad F55
preservada por replay aporta un origen concreto de duplicacion; no seguir
repitiendola como solucion para consulta nueva. Estos casos sirven como
comunicacion/prueba negativa identificada. Para una nueva consulta se necesita
seguridad EMV originada por el chip para esa operacion. No cambiar solo ATC,
STAN o fecha ni borrar contadores del host. Ver BALANCE_EXECUTION.md.

Reejecucion solicitada por el usuario el 2026-10-12: ahora conecta a
10.60.0.11:16100, recibe 0800/071, transmite una vez los 536 bytes originales
STAN 007923 y recibe 0210/F39 91 correlacionado por STAN/RRN/terminal.
runId 9a6606b3-6829-4f2e-abed-99f27e97d274; write UTC 18:16:03.939
(13:16:03.939 Ecuador), respuesta antes de 18:16:04.502 UTC.
No hay F54 en la respuesta ni una consulta aprobada. No se confirma llegada
actual a Mediator/Core ni se atribuye la causa de 91 al error historico.
Reporte privado qa-cb-balance-attempt-9a6606b3-6829-4f2e-abed-99f27e97d274.json.
El rechazo TCP descrito a continuacion pertenece al intento anterior.

Actualizacion 2026-10-12: el usuario solicita enviar al Switch como en la prueba
anterior. Se ejecuta el emisor de la consulta original CB, sin cambios de campos,
con hashes y destino QA comprobados. La conexion a 10.60.0.11:16100 resulta en
ECONNREFUSED antes de transmitir: writeAttempted=false, writeCompleted=false,
bytesWritten=0, bytesReceived=0; no existe respuesta ISO financiera de este intento.
Un probe independiente sin writes confirma REFUSED en el mismo destino.
La ruta local elegida usa 10.10.10.21 por Wi-Fi y gateway 10.10.10.1; no acredita
la direccion observada por el Switch ni identifica quien origina el rechazo TCP.
Revisar listener/ruta/reglas del puerto con el administrador del Switch antes
de otro envio. No se atribuye este fallo a PIN/EMV, STAN ni al Core.
Reportes privados: qa-cb-balance-attempt-b550c403-42ae-4ae3-8152-2a8b31208152.json
y qa-switch-connectivity-20261012.json en artifacts. No se enviaron 0810, retiro
o reverso; no se declaro una consulta nueva generada desde el chip.

Revision PCAP/nwint del 2026-10-08: cuatro envios reales y tres preparaciones
sin transmision. El replay identico STAN 007923 recibio 91; variantes que
cambian solo F11 a 008101/008102/008103 recibieron 96. El nwint adjunto no
contiene sus STAN/PID en los registros inspeccionados; no se confirma la
causa del 96 ni llegada de esos tres intentos a Mediator/Core.
Ver la tabla, hashes y herramienta offline en
`docs/protocols/CB_205_BALANCE_SAMPLE.md`. Las variantes conservan fechas,
RRN y seguridad de la captura; no constituyen generacion de trx nuevas.

Actualizacion 2026-10-08: consulta CB 205 reconstruida y enviada una vez desde
la PC a 16100. Se recibio 0210 / F39 91. El usuario confirma llegada a SmartVista
y Mediator; msgResponse TraceId 31580471 indica RetCode 8908,
WS, PROCESADOR NO RESPONDE, MappedRespCode 10096. No se envio retiro ni 0810.
La siguiente investigacion corresponde a ADPCOREGEN/PROXY205 y la llamada al
procesador/Core, sin atribuir causa a PIN/EMV o al codigo 91 por convencion.
Ver [muestra, codec y correlacion del intento](../protocols/CB_205_BALANCE_SAMPLE.md).
Las denegaciones y los bloqueos descritos abajo son evidencia historica.

El usuario solicito una prueba de USD 20 por cajero -> SmartVista -> Mediator ->
Core, aunque se rechace, para comprobar llegada. Identifico STAN 007803 y UTRNNO
del caso original; se localizo un paquete candidato en los PCAP aportados.
Ratifico ese recorrido despues de las pruebas TCP. No se cambia a envio directo
del XML financiero al Core.

El emisor permite un intento controlado con bytes seleccionados de una captura,
sin modificar encabezados, STAN, monto, fecha ni datos de tarjeta. No construye
una nueva transaccion ISO ni implementa la sesion completa del cajero. El monto
solicitado es una referencia aportada por el usuario: no se verifica ni cambia
F4/F49 sin el diccionario. Duplicados, campos historicos y estados de sesion
pueden producir rechazo; no se inventan reglas para evitarlos.

## Implementacion y limites

QaReplayPort es un puerto interno de Main/herramientas locales. QaTcpReplay usa
TCP IPv4 fuera del Renderer. Rechaza ambientes distintos de QA, IP/puerto
invalidos, bytes vacios/excesivos y plazos invalidos antes de abrir un socket.
Los limites de 65535 bytes y 30000 ms son controles tecnicos de esta herramienta,
no un perfil ISO, regla VLI ni timeout financiero del proveedor.

Se copia el bloque de entrada antes de esperar la conexion. Solo despues de
conectar se intenta un unico write. No hay retries, reconexion, reverso,
keepalive de negocio ni envio por el enlace Mediator 49212. Un timeout de
conexion informa writeAttempted=false y bytesQueued=0: no representa una
transaccion enviada.

bytesQueued informa la cantidad entregada a la pila local; writeCompleted
indica callback de write completado. Ninguno acredita llegada/procesamiento en
SmartVista/Core. Durante una ventana acotada se cuenta bytesReceived, sin
retener/publicar contenido ni asumir limites de mensajes TCP. Cierre, error,
timeout o limite de observacion destruyen el socket y borran la copia de entrada.
El resultado contiene solo metricas y codigos de error fijos, sin mensajes del
driver. No se clasifica aprobacion financiera ni se registra PASS/FAIL funcional.

El caso puntual se prepara en una herramienta privada bajo artifacts, con
hash de PCAP y payload, paquete y ruta comprobados, destino QA validado mediante
FileNetworkEvidence, runId/transactionId UUID y timestamps UTC. Los bytes de la
fuente permanecen en memoria y se borran al terminar. No se versiona el payload
ni se publica por IPC. La herramienta ejecuta un intento autorizado por el
usuario; la evidencia de red por si sola no autoriza envios.

No hay nuevos canales IPC ni cambios al boton de envio general de la app. Ese
flujo sigue pendiente de diccionario ATM, templates, perfiles y reglas dinamicas.
El emisor acota la prueba actual a reproducir una fuente existente; no habilita
PROD, PREPROD ni carga.

## TODO-DATA y diagnostico

- ISO-SPEC/GOLDEN-SAMPLES: confirmar monto/campos, limites del mensaje capturado,
  sesion ATM y regeneracion de identificadores antes de construir nuevas tramas.
- SWITCH-ATM-ACCESS: las pruebas locales emiten SYN a 16100 sin respuesta. El
  PCAP del servidor cubre el intento y contiene solo conexiones existentes de
  cajeros y Mediator; no contiene los SYN de la PC en ens3. La captura posterior
  en any aportada tampoco muestra esos intentos. Confirmar interfaz/ruta/filtros
  y el permiso especifico TCP 16100; no atribuirlo al monto o respuesta Core.
  Este era el estado inicial. La conexion posterior acepta TCP pero devuelve
  NO AUTHORIZATION sin recibir una trama; falta validar la IP vista por el
  servidor y su autorizacion/vinculacion al PID QA (ver evidencia posterior).
- CMS-CORRELATION: vincular los identificadores de la captura con Journal/Message
  sin asumir eco de TraceId. El par XML aportado de USD 10 es otra muestra.

## Verificacion

Intento QA del 2026-10-07: conexion iniciada a las 20:17:10.184 UTC
(15:17:10 Ecuador) y terminada a las 20:17:18.189 UTC. Se prepararon 548 bytes
del paquete candidato 759 con la referencia STAN 007803 aportada por el usuario.
El resultado fue CONNECT_TIMEOUT, writeAttempted=false, writeCompleted=false,
bytesQueued=0 y bytesReceived=0. No se transmitio una trama ni se acredita
llegada a SmartVista, Mediator o Core. runId:
8b44afb9-e3de-468e-b9ea-afe1106a4bad. Reporte privado de metadatos:
artifacts/qa-captured-send-attempt.json.

Intento posterior a las 21:26:18.151 UTC (16:26:18 Ecuador): writeCompleted=true,
bytesQueued=548, bytesReceived=17 y PEER_CLOSED. El usuario informo que no aparece
en los monitores ni en SmartVista. El contenido de esos 17 bytes no se conservo;
no se identifica retrospectivamente como respuesta ISO ni como un mensaje
concreto. runId: 17109565-f5de-469e-8a50-06a4a49d400d.

Diagnostico separado a las 21:36:53.571 UTC (16:36:53 Ecuador): se abrio TCP sin
ningun write ni trama. El extremo devolvio el aviso textual NO AUTHORIZATION
y cerro, con 17 bytes recibidos. Esto prueba una denegacion de la conexion
independiente del contenido ISO o monto; no se interpreta como response code
financiero. La causa precisa requiere log/configuracion del Switch. El PID
aportado admite como remoto el equipo de cajeros, mientras esta prueba usa la
PC; falta confirmar el origen visto por SmartVista y su asignacion autorizada.
El usuario ratifico que la Direccion remota del PID sigue siendo el equipo de
cajeros. Esa configuracion es coherente con la denegacion de la PC, pero el log
del Switch debe confirmar la regla exacta y la IP que ve (posible NAT). La
habilitacion debe acordarse en una interfaz de prueba preservando el enlace
existente; no se inventa un PID/puerto ni una regla de coexistencia del proveedor.
No se cambia el PID activo ni se envia otra transaccion durante el diagnostico.
runId: 2fcdaf9c-8715-4213-88f3-26c76abe2ab6; evidencia privada de metadatos:
artifacts/qa-switch-greeting.json.

La revision inicial del paquete 759 observaba 548 bytes y valor BE16 544, sin
explicar la diferencia. La captura VCP Lite y sus logs posteriores identifican
la envolvente de cuatro bytes descrita abajo; ya no se considera desconocida
esa mecanica para esta muestra. El perfil completo del proveedor sigue pendiente.

## Caso USD 20 y envolvente observada VCP Lite

La nueva fuente CertificacionVcpLite450Diebold.pcap y los logs de la misma hora
permiten seleccionar el retiro historico STAN 001391 / UTRNNO
262801638052798660, Terminal ATM20301, codigo observado 011000. El log registra
monto 2000 y moneda 840; el monitor de ese caso muestra USD 20 y respuesta 00.
El estado interno final observado es -1. Esta correlacion identifica la muestra;
no define por si sola reglas generales de packing o aprobacion futura.

El request es el paquete 543, con 562 bytes: BE16 de 558 bytes de cuerpo,
extension 0000 y cuerpo opaco. Su respuesta historica es el paquete 545, con
220 bytes, cuerpo 216 y extension 2020. El codigo CapturedVisaFraming preserva
los dos bytes de extension sin interpretarlos, soporta fragmentacion TCP y
varios frames concatenados, y rechaza fin de fuente incompleta. No aplica el
codec BANRED ni decodifica campos ISO. El maximo mecanico BE16 es 65535 bytes de
cuerpo (65539 de frame); el emisor conserva su limite tecnico de 65535 bytes
totales. No se modifica ese limite por una observacion de esta captura.

La herramienta privada artifacts/prepare-vcp-approved-replay.mjs verifica hash
de PCAP, direccion/puertos, hashes request/response y destino documental QA antes
de preparar el caso. Utiliza el codec implementado para reensamblar y reconstruir
262/262 frames byte a byte, sin huecos, conflictos ni residuo. No abre sockets.
Guarda exclusivamente metadatos en qa-replay-profile.json del directorio privado
de datos de la app y artifacts/qa-vcp-replay-case.json; no almacena payload
extraido. Estos reportes no son un catalogo de casos importado en la UI.

La reproduccion preparada conserva todos los campos historicos, incluida la
tarjeta original terminada en 0663, fechas y STAN/RRN. No se reemplazan por la
tarjeta ficticia terminada en 0311 ni por otra cuenta. Reutilizar campos de
seguridad o identificadores no garantiza aceptacion. Construir un request nuevo
requiere el diccionario y las reglas de sesion, PIN/HSM y campos dinamicos.
Se preparo offline sin nuevo envio porque la ultima evidencia de la PC sigue
siendo NO AUTHORIZATION antes de escribir. La admision y la envolvente son
dependencias distintas; las capturas aprobadas resuelven la segunda para este
caso, pero no cambian la configuracion del PID ni prueban llegada al Core.

Detalle de correlacion y conflicto del enlace Mediator:
`docs/protocols/VCP_LITE_450_REVIEW.md`.

Actualizacion 2026-10-08: el usuario confirma que CB 205 es el PID 82052 / 49212
y limita la prueba a CB. La muestra STAN 001391 fue encaminada a 82032; el
perfil preparado cambia a BLOCKED_SOURCE_ROUTE_MISMATCH y no es elegible para
esa prueba. La validacion de sus bytes queda como evidencia de envolvente, sin
atribuirle una entidad distinta. En esa revision faltaba request ATM dirigido
a CB 82052 y resolver la admision de la PC. La consulta documentada al inicio
ya demuestra admision y llegada a Mediator con una muestra propia de CB.
Ver `docs/protocols/QA_SWITCH_ADMISSION_REVIEW.md`.

Unit: QA obligatorio, entrada invalida sin sockets, conexion pendiente sin write
ni reintento y error protegido. Integration: servidor TCP local real, bytes
originales pese a mutacion del consumidor, envio unico, respuesta contada sin
contenido, silencio con plazo, dependencia no disponible y limite de recepcion.
Las fixtures son sinteticas y no constituyen una transaccion bancaria aprobada.
Las pruebas adicionales del encapsulado cubren request/response, extension,
fragmentacion, concatenacion, limites y entrada invalida. La integracion TCP
local comprueba una entrega completa y un receptor que espera un frame truncado
hasta finalizar la ventana de observacion. No usa datos bancarios reales.
