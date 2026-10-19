# Consultas ATM20521 / STAN 900107 y 900108: logs del 2026-10-16

## Ampliacion: PROXY y SRVPIN, consulta 900108

El usuario entrega los extractos PROXY de 900107 (13:21) y 900108 (15:35),
y Texto pegado.txt con el detalle SRVPIN de 900108. El adjunto tiene 6141 bytes,
90 lineas y SHA-256
409f2c14db1756f39fbe3384a7c80c4f9f84043d06cfe44290628ce4c337c0bb.
Se trata como evidencia; no se ejecuta su contenido ni se reproducen datos
de tarjeta, PIN, criptogramas o tramas en este informe.

El diario local correlaciona 900108 / RRN 628900900108 / ATM20521 con
requestId 54eb2fbb-9010-4015-8919-1f3f7de5a18f,
runId d06a8fc3-908f-4c42-8075-cf034e784c52 y
transactionId b5999c28-00af-4560-9f53-a1424c9067d7. Inicio
2026-10-16T20:35:36.703Z, fin 20:35:49.917Z, transporte 1086 ms,
NOT_APPROVED / 96. Esto confirma el comportamiento corregido del parser F44
en una consulta real enviada por el usuario; no equivale a aprobacion.

| Fuente | Hora local | Evidencia |
| --- | --- | --- |
| Adjunto, lineas 19/22/31 | 15:35:49.371 | Procesamiento 301000, STAN 900108, ATM20521 |
| Adjunto, linea 57 | 15:35:49.652 | Pasa Validacion Cript/Tarjeta OK |
| Adjunto, lineas 59-60 | 15:35:49.668-683 | Validacion ARQC errada; Criptograma negado |
| Adjunto, linea 83 | Respuesta posterior al error | V039_ResponseCode = 57 |
| PROXY, ISORESPONSE M y salida | 15:35:49.699 | F39 codificado como `5 `, no `57` |
| Diario local | 20:35:49.917Z | Respuesta final 96, interpretada como NOT_APPROVED |

No se atribuye el fallo de 900108 al PIN digitado: la etapa PIN/tarjeta pasa
y el error explicito aparece despues, en ARQC. El extracto SRVPIN corresponde
solo a 900108; para 900107 PROXY confirma el mismo F39 `5 ` pero no aporta
su detalle SRVPIN. No se extrapola silenciosamente la causa criptografica.

### Secuencia de aplicacion perdida y correccion local

F55 del adjunto tiene 95 bytes TLV y 14 tags. El texto Error EnvioCrypto
contiene el TLV de entrada al validador, no un codigo de error: sus 111 bytes
incluyen esos mismos 14 tags, sin cambios de valor, mas 5A y 5F34 agregados.
La secuencia agregada es 5F34=00. Se conserva solo metadata de esta comparacion.

La inspeccion estatica de ValidacionPinLocal2018.dll recibida de Mediator,
SHA-256 9c9e34c02d1b68843398fced64ceaa527d2bbc6919d843107573296c1f01e774,
confirma el fallback en ValidaTagEMV.ValidaARQC: busca 5F34 (IL 615-630);
si falta, empieza con 00 (IL 648); si existe F23, toma sus dos ultimos digitos
(IL 655-690). La solicitud del extracto PROXY/SRVPIN no contiene F23 ni 5F34.
No se carga ni ejecuta la biblioteca y no se certifica su hash como el binario
en ejecucion del servidor actual; el log confirma el resultado de ese fallback.

El request original de 900107, NWINT lineas 2149772-2149799, contiene F23=001
y omite 5F34 en F55. La captura aprobada PruebaSimulador.pcap, frame 218,
incluye ambos: F23=001 y 5F34=01. Su SHA-256 es
a59148b665715284d1c673cc9137338386088f31b3922c3f2d77bb42449154ab.
Esta evidencia identifica la omision local y la perdida de F23 en el recorrido;
no es una comprobacion criptografica offline del ARQC ni demuestra por si sola
que sea la unica causa del rechazo actual.

QaEmvOperation ahora incorpora siempre 5F34 desde la lectura vigente del chip,
validado como un byte BCD. No fija el valor 01 ni lo toma de otra tarjeta.
Si el perfil ya lo incluye, conserva su posicion; si lo omite, lo agrega al
final de F55. Los perfiles guardados siguen siendo compatibles sin escribir
AppData. El perfil puede ordenar el tag pero no asignarle un valor fijo en
extraTags. El mismo valor leido se usa para F23 y para 5F34; se conservan
los datos originales del chip y se limpia la copia temporal al finalizar.

Regresion: nueve fallos reproducidos antes del cambio. Despues pasan 46 pruebas
especificas, incluidas secuencias 00/01/02, dato ausente/invalido, tag unico,
compatibilidad del perfil e igualdad F23/5F34 en la trama TCP sintetica.
La validacion completa se registra en artifacts/qa-900108-arqc-review-20261016.json.

### Pendientes acotados

- QA-ARQC-900108: comprobar una nueva consulta, con PIN/AC nuevos, y confirmar
  en SRVPIN que 5F34 conserva la secuencia real del chip y que ARQC pasa.
  Si persiste el rechazo, se requiere el diagnostico del servicio Crypto para
  esa referencia, sin entregar claves ni PIN. Esta revision no envia una TRX.
- QA-RESPONSE57-PACKING-900108: determinar por que el 57 de SRVPIN termina
  como `5 ` en PROXY, antes de llegar a SmartVista. No mapear `5 ` a `05`,
  ni cambiar FROM_NTWK_RESP_TAB para ocultar la diferencia. Los extractos
  sitúan el cambio entre SRVPIN y la serializacion que registra PROXY;
  no identifican aun la funcion/configuracion exacta responsable.
- QA-RC939-900107: PROXY recibido; el origen de su codigo requiere SRVPIN de
  esa consulta si se necesita cerrar tambien el diagnostico historico.

## Resultado comprobado

La consulta llega al Switch y al enlace PID 82052. NWINT recibe de ese enlace
F39 con dos caracteres: `5 ` (digito 5 seguido de espacio). La busqueda del
codigo literal para nwind 28 no encuentra correspondencia en FROM_NTWK_RESP_TAB.
SmartVista registra RESP 939 y devuelve al cliente 0210/F39=96.

La respuesta final incluye F44. El parser local no lo admitia, por lo que
clasificaba la respuesta como INVALID_RESPONSE. Con soporte acotado para F44,
el mismo cuerpo original se interpreta como 0210/96 y coincide con la solicitud
en STAN, RRN, terminal, procesamiento y moneda. No contiene saldo aprobado.

## Procedencia y limites

Archivo del usuario: Downloads/202610161400.tar.gz, 74448896 bytes, SHA-256
0674718ea1f60fa32ca7c1ddf50a15743c54646a42c7698cb5d388f24625c243.
El archivo esta truncado al comenzar tcpcomms01.Oct16.1; no se dispone de su
contenido. El miembro nwint00_22905.Oct16.1 si esta completo: 426785993 bytes,
6617807 lineas, SHA-256
828a5562e109821aac4615c7c57e40d1fe8dea8e2d707022c0b9a26d0d2f7f18.
Cubre 13:00:42.568558 a 14:00:02.537465, horas de fuente del 16 de octubre.
La ventana solicitada se correlaciona con Ecuador; no se certifica sincronizacion
entre relojes. Reportes persistidos con timestamp UTC.

El log se procesa por streaming y la ventana se analiza en memoria. No se
guardan tramas, PAN, Track 2, PIN Block ni datos criptograficos en documentacion
o fixtures. No se ejecuta contenido del archivo ni se modifica el original.

## Recorrido correlacionado

UTRNNO 262891821077305370, STAN 900107, terminal ATM20521. El diario local
identifica runId 6ec1a36d-76c5-44ad-ac17-e10fdf09bbd7 y transactionId
0bbd5588-4c52-4ae8-bcbf-5331d7eb9c11.

| Hora de fuente | Lineas NWINT | Evidencia |
| --- | --- | --- |
| 13:21:07.729304 | 2149772-2149799 | Cuerpo 0200 del cliente, 443 bytes; 447 con framing local |
| 13:21:07.777600-13:21:07.778516 | 2152289-2152299 | PID 999 NETWORK LINE DOWN; denial 802 |
| 13:21:07.791961 | 2153061-2153062 | Seleccion posterior de PID 82052 como reemplazo temporal |
| 13:21:07.928664 | 2154388-2154413 | Cuerpo 0200 hacia 82052, 404 bytes |
| 13:21:09.158908-13:21:09.159017 | 2154630, 2154658-2154667 | Origen 82052; cuerpo 0210 de 155 bytes |
| 13:21:09.159603 | 2154783-2154784 | F39 literal `5 ` |
| 13:21:09.160490-13:21:09.160500 | 2154790-2154791 | No encuentra `5 ` para nwind 28; No data in FROM_NTWK_RESP_TAB |
| 13:21:09.199497-13:21:09.199550 | 2158159-2158173 | F37=628900900107, F39=96, F44 de cinco caracteres |
| 13:21:09.199710 | 2158214-2158223 | Cuerpo final 0210 al cliente, 157 bytes |
| 13:21:09.205946-13:21:09.207637 | 2158347, 2158362 | Actualiza RESP=939 y RESPCODE=96 |

El RRN 628918900107 aparece en el recorrido interno, pero la respuesta final
restaura 628900900107. No hace falta cambiar la correlacion local. El fallo de
PID 999 tampoco explica por si solo el resultado final: despues hay intercambio
con 82052. La evidencia no determina por que el autorizador genero `5 ` ni
autoriza tratarlo como `05`, error de PIN, aprobacion o rechazo especifico Core.

## Soporte local de F44 y regresion

ISOBASEI.bin, SHA-256 c9e90739f0e14109869304e469d4bab43eec4cbdf97c76320022097cf0a05d39,
define V044_AddRespData con encoding EBCDIC, parametro de longitud 25,
atributo 1 y asociacion a MTI 0210. El cuerpo final confirma un prefijo binario
de un byte con valor 5, seguido de cuatro espacios EBCDIC y un digito 2.
El dato se omite de la proyeccion publica y no se le asigna significado financiero.

CapturedVisaBalance admite F44 opcional en respuestas, con longitud 1-25,
conservando limites, campos requeridos y correlacion estricta. El perfil de
solicitud no cambia. Una respuesta 00 sigue requiriendo saldos F54 validos.
La reproduccion offline usa el cuerpo real solo en memoria: el parser anterior
devuelve BALANCE_SOURCE_UNSUPPORTED; el corregido devuelve 0210/96, sin saldos
y con los cinco criterios de correlacion coincidentes.

Las pruebas versionadas usan datos sinteticos. Cubren longitudes 1/5/25,
longitud vacia/excesiva, truncamiento, campo no permitido, respuesta aprobada
con F54 y respuesta 96 fragmentada por TCP local con la estructura de 157 bytes.
Cinco pruebas fallan antes del arreglo y pasan despues. La regresion acotada
inicial completa 37 pruebas. Ver validacion final en BALANCE_EXECUTION.md.

## Pendiente externo

Resuelto TODO-DATA QA-INVALID-RESPONSE-900107: causa local identificada y
corregida con respuesta real. El diario historico conserva el resultado que
obtuvo la version anterior; no se reescribe ni se reutiliza STAN 900107.

El pedido inicial de PROXY se atiende con los extractos descritos al inicio
de este documento. No volver a pedir NWINT o PROXY para estas ventanas.
Los pendientes actuales son ARQC, la diferencia 57 / `5 ` y, si se requiere
cerrar 900107 por separado, su detalle SRVPIN. La aprobacion sigue pendiente.

Reporte local sanitizado: artifacts/qa-900107-resolution-20261016.json.
