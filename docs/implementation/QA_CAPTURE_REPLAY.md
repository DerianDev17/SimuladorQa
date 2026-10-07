# Emisor de captura ATM para una prueba QA

## Objetivo y alcance

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

La revision offline del paquete 759 observa 548 bytes y valor 544 al leer los
primeros dos bytes como BE16. No coincide con longitud total ni total menos dos.
No se recorta/reencapsula ni se declara completo un mensaje ISO a partir de un
limite de paquete TCP. Resolver SWITCH-ATM-FRAMING con el perfil aprobado sigue
siendo necesario despues de resolver la autorizacion de la conexion.

Unit: QA obligatorio, entrada invalida sin sockets, conexion pendiente sin write
ni reintento y error protegido. Integration: servidor TCP local real, bytes
originales pese a mutacion del consumidor, envio unico, respuesta contada sin
contenido, silencio con plazo, dependencia no disponible y limite de recepcion.
Las fixtures son sinteticas y no constituyen una transaccion bancaria aprobada.
