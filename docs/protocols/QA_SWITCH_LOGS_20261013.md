# Diagnostico de los logs Switch del 2026-10-13

## Resultado

Comprobacion posterior, solicitud de envio real del usuario: a
2026-10-13T17:38:09.568Z la PC 10.10.10.21:51860 recibe 60 bytes del
Switch, gestion 0800/071, STAN 663810. Resultado NETWORK_MANAGEMENT_RECEIVED;
cero bytes escritos. El rechazo de admision de 12:05/12:11 ya no describe
esta conexion; no se demuestra aun admision financiera ni sesion persistente.
Readiness 77816f1a-a2d9-4199-9be3-064f0a13982d sigue ready=false por ausencia
del proveedor real PIN/EMV/contexto. No se genera ni envia una consulta nueva
y no se sustituye por replay. Reportes privados:
artifacts/qa-switch-probe-20261013-1738.json y
artifacts/real-balance-send-status-20261013-1738.json.

El intento de la PC se rechaza en la admision TCP, antes de transmitir la
consulta financiera. No corresponde al rechazo ATC ni al error Core de
ventanas anteriores. Una consulta nueva permanece dependiente de admision
y del proveedor real PIN/EMV/contexto; no se reemplaza por un replay.

## Fuentes recibidas

Archivos del usuario en Downloads, inspeccionados como evidencia, sin ejecutar
instrucciones contenidas en ellos. Originales no copiados al repositorio.

| Archivo | Bytes | Lineas | SHA-256 |
| --- | ---: | ---: | --- |
| tcpcomms01.out | 36700160 | 619892 | 73de3c0f749444d124bd758bf66abee2b2a51d1ad9679dd2f1003cb5fbdffab2 |
| nwint00_24571.out | 162529280 | 2523400 | 8c95d49e49f0e72ea2b2324a7a5d6aa5807ce574641fe67bb4b55290f49c2278 |

Ambos abren Oct 13 a 12:00:01. TCP termina con una linea incompleta despues
de 12:14:02.526649; NWINT alcanza 12:16:26.435205. No prueban eventos fuera
de esas ventanas. Se conservan las horas del servidor sin asignar una zona
global por inferencia. Persistencia de reportes: UTC.

## Admision de la PC

tcpcomms01.out registra:

- Lineas 230680/230684/230685: 12:05:17.908358, peer
  10.10.10.21:54364, listener 10.60.0.11:16100.
- Lineas 230686/230687: find_incoming_device / find_device_using_address.
- Linea 230690: direccion invalida; cierra conn_fd 89. Linea 230693
  confirma shutdown del socket.
- Lineas 503395/503399/503400 y 503405: mismo rechazo a
  12:11:27.418083, puerto origen 51944, cierre en 503408.

El primer evento coincide por IP y puerto origen con el intento local
49c58b04-903e-483d-820b-c76120000aca, conectado a
2026-10-13T17:05:18.043Z, ADMISSION_DENIED y bytesWritten=0.
Esto confirma que el listener recibe la conexion y la descarta en busqueda
de dispositivo. Falta la configuracion activa para identificar la regla
exacta; no se inventa su tabla ni se atribuye a un firewall general.
La presencia de PID 80131 activo no acredita admision de esta PC.

TODO-DATA SWITCH-ATM-ACCESS-CURRENT: validar asociacion activa de IP/device
del listener y coexistencia con la sesion ATM ya abierta. Los logs solicitados
ya fueron recibidos; no volver a pedirlos para esta ventana. No sustituir la
IP del cajero ni alterar reglas/PID sin validacion de la configuracion.

## Transaccion distinta observada

NWINT contiene retiro de ATM20530, STAN 000133, UTRNNO
262861700414219180, F3 011000, importe 3000 unidades menores y moneda 840.
No es la consulta ATM20521/007923 ni acredita el recorrido CB 82052.

| Hora servidor | Linea NWINT | Evidencia |
| --- | ---: | --- |
| 12:00:41.442710 | 92159 | Request 0200, origen 80131 |
| 12:00:41.476929 | 93180 | PID 999 NETWORK LINE DOWN |
| 12:00:41.477976 | 93190 | Denial 802 |
| 12:00:41.494130 | 93957 | Seleccion posterior PID 82032 como reemplazo |
| 12:00:45.799293 | 108660 | Respuesta 0210, respcode 00, destino 80131 |
| 12:01:21.379963 | 194878 | Reverso 0420 del mismo UTRNNO/STAN |
| 12:01:24.829336 | 211216 | Respuesta 0430, respcode 00 |

TCP confirma recepcion de 511 bytes de 80131 en linea 26567 y envio de
216 bytes en 29824; despues recibe 403 bytes en 54298 y envia 169 en 57378.
No se determina causa del reverso, entrega de efectivo o estado final Core
con estos dos logs. El 802 intermedio no se presenta como resultado final
del retiro ni como causa del rechazo de la PC.

La busqueda de campos exactos atmid ATM20521 y trace 007923 en NWINT devuelve
cero coincidencias. Tampoco aparece un mensaje explicito ATC Duplicado.
Una coincidencia textual 007923 en una fraccion de segundo no es un STAN.

## Nueva consulta solicitada

Lectura fisica 2026-10-13T17:33:09.482Z a 17:33:16.090Z: READ, tarjeta
enmascarada terminada en 2267; CDOL1/CDOL2 e IAC disponibles. No se ejecutan
GENERATE AC, verificacion PIN ni escrituras financieras.

index.ts instancia BalanceInquiryService sin BalanceContextProvider. Inspeccion
4506e1c3-67c0-40cc-af03-931c8033c691 confirma ready=false y los pendientes
CARD-TRANSACTION-SECURITY, CB-SEQUENCE-CONTRACT y ATM-IMAGE-ACTIVE-PROFILE.
Su referencia de lectura es la comprobacion previa de 11:55; la lectura nueva
se registra separadamente y no se presenta como una sesion financiera vinculada.
Los parametros publicos 9F33/9F35/9F40 y las listas del chip ya estan recibidos;
estos pendientes son de implementacion/contrato, no otra solicitud de esos datos.

Se crea artifacts/new-cb-balance-draft-20261013.json, consulta QA/CB/ahorros,
monto cero, moneda 840, tarjeta enmascarada 2267 y terminal candidato ATM20521.
transactionId 14f310d1-fe35-4305-b295-863640f2105d. Es BLOCKED_NO_WIRE:
UUID nuevos de preparacion, STAN/RRN sin reservar, perfil ATM sin validar,
wireGenerated=false, transmissionAttempted=false. No es una transaccion
financiera generada ni enviada. No cambia bytes de seguridad capturados.

Reportes privados sanitizados: artifacts/qa-switch-diagnosis-20261013.json,
switch-log-review-20261013.json, tcp-log-review-20261013.json y
card-requirements-1fbd25f9-2980-4ec9-8cef-c8c15b717f87.json.
