# Admision ATM QA: logs del 8 de octubre de 2026

## Fuentes y limites

Fuentes privadas aportadas por el usuario desde Downloads:

| Archivo | Bytes / lineas | SHA-256 | Ventana impresa |
| --- | --- | --- | --- |
| tcpcomms01.out | 7117853 / 112418 | 2faab59ffa47c0b9092198955b6da32e49c262cb21b648cae13d0270ace89a92 | 09:31:38.603665 a 09:54:10.663256 |
| nwint00_22150.out | 10298301 / 145396 | f50cd0b1c88e46e07f999e4160fbdecac983b490d01a77f7b494727cbf272ad1 | 09:31:30.722348 a 09:53:21.624547 |

Los encabezados indican process startup, Oct 8. Estos archivos no cubren el
rechazo TCP de las 09:10 ni la prueba posterior de las 10:00:49 de Ecuador.
Los numeros de linea corresponden a estos hashes; los originales no se copian
al repositorio. Los reportes privados contienen metadatos y texto protegido.

La salida ss -ntp aportada confirma un unico socket ESTAB:
10.60.0.11:16100 con peer 172.60.60.171:47566, fd 82, compartido por varios
procesos tcpcomms01. Los multiples PID Linux que heredan ese fd no equivalen
a multiples conexiones ni al identificador logico SmartVista 80131.
La salida de conexiones establecidas por si sola no enumera listeners.

## Evidencia de admision

En tcpcomms01.out:

- Linea 7701: Subnet is not used for 172.60.60.171.
- Linea 7720: dispositivo 80131, remoto 172.60.60.171, puerto remoto 0,
  local 16100, THEY_CALL, VISA, Enabled.
- Lineas 19415-19420, 09:31:41.908: crea e inicia listener 16100, fd 34.
- Linea 20333, 09:31:42.007796: acepta llamada de 172.60.60.171:47566,
  crea fd 82.
- Lineas 20339-20341: find_incoming_device, find_device_using_address y
  Device #80131 (...) is authorized, proceeding with call.
- Linea 20377: registra dispositivo 80131 activo en fd 82.

Esto demuestra seleccion del dispositivo mediante direccion y autorizacion del
peer del cajero. El mensaje Not found PROTO for PORT 16100 (linea 7711) no impide
que ese listener arranque y acepte al cajero en esta ejecucion. No se interpreta
como causa de la denegacion de la PC ni se generaliza su significado.

La IP 10.10.10.21 aparece una vez en cada archivo, en SystemUserID / UserName /
Host al arrancar. No aparece como peer de Received call. Ese encabezado no es
prueba de conexion ATM aceptada desde la PC. No hay NO AUTHORIZATION en estos
archivos dentro de la ventana recibida.

## Pruebas locales y conclusion limitada

A las 09:10:01.663 de Ecuador (14:10:01.663 UTC), una prueba acotada sin trama
termina ECONNREFUSED. Es anterior al startup registrado a las 09:31; el arranque
posterior es compatible con que el servicio se haya habilitado despues, pero
no demuestra el origen exacto del rechazo previo.

Tras analizar los archivos se prueba de nuevo sin escribir bytes financieros:

- runId: 380452b8-7803-4c1e-9b51-2f553fb651e2.
- UTC: conectado 2026-10-08T15:00:49.078Z; cierre 15:00:49.186Z.
- Ecuador: 10:00:49.
- Endpoint remoto: 10.60.0.11:16100; local 10.10.10.21:52922.
- connected=true; writeAttempted=false; bytesReceived=17.
- Respuesta textual exacta NO AUTHORIZATION; PEER_CLOSED.

El acceso TCP vuelve a estar disponible; el bloqueo actual ocurre en la
admision, antes de evaluar ISO, tarjeta, monto o Core. La configuracion por
direccion del dispositivo 80131 respalda fuertemente la hipotesis de un origen
sin dispositivo autorizado. Aun falta el evento contemporaneo de rechazo para
confirmar IP vista por servidor (NAT posible), dispositivo seleccionado y regla
exacta; no se descartan silenciosamente limites de conexiones u otras reglas.
No se cambia el PID activo, no se suplanta la IP del cajero y no se reenvia una
transaccion financiera durante estas pruebas.

nwint00_22150.out contiene mensajes de red MTI 800/810 y startup; no se
encuentran MTI 200/210/420/430 en las representaciones MTI o msgtype revisadas.
Los 177 registros relacionados con dispositivo 80131 identificados no incluyen
esos MTI financieros. No acreditan llegada de nuestra transaccion al Core.

## Conflicto nuevo del enlace Mediator

La tabla cargada de tcpcomms01 contradice la asociacion aportada anteriormente:

| PID | Destino observado | Linea |
| --- | --- | --- |
| 82032 | 172.60.60.156:49276, WE_CALL, Enabled | 13020 |
| 82052 | 172.60.60.156:49212, WE_CALL, Enabled | 6237 |

Ademas, linea 19531 inicia la llamada de 82032 a 49276; lineas 20733 y 20767
registran finalizacion de conexion e incorporacion activa en fd 40.
El puerto 49276 queda demostrado para 82032 en esta ejecucion, sin depender
solo del orden de columnas. Esto ofrece una explicacion posible de por que el
PCAP previo de 49212 no mostraba trafico financiero dirigido a 82032. No prueba
que la configuracion fuera identica el 7 de octubre.

El usuario confirma despues de revisar esta diferencia que **82052 corresponde
a CB Cooperativa (205)** y solicita trabajar exclusivamente con esa entidad.
Se registra QA / entidad 205 / PID 82052 / 172.60.60.156:49212. La entrada del
simulador sigue siendo 10.60.0.11:16100; el puerto 49212 es el tramo posterior
SmartVista -> Mediator, no un sustituto de la entrada ATM.

El caso USD 20 / STAN 001391 de la captura previa se encaminaba a 82032.
Por ello qa-replay-profile.json pasa a BLOCKED_SOURCE_ROUTE_MISMATCH y deja de
ser elegible como prueba de CB 205. La confirmacion resuelve la identidad actual
de CB; no reasigna retroactivamente una muestra financiera de otro destino.
Los bytes y campos no se modifican para forzar otra entidad. El codec de la
envolvente conserva su validacion mecanica independiente de ese enrutamiento.

La configuracion documental network-evidence.json ya contiene entidad 205 y
destino 49212; se verifica su consistencia sin cambiar el schema ni habilitar
envio general. La asociacion confirmada de PID se conserva en el archivo privado
qa-cb-205-routing.json y el plan de tarjeta ficticia se limita al mismo destino.

## TODO-DATA dependientes

- SWITCH-ATM-ACCESS: evento tcpcomms01 de 10:00:49 del 8 de octubre, con peer
  visto y decision de find_incoming_device / autorizacion. Definir interfaz QA
  para el origen de la PC conservando la conexion del cajero; no inventar PID.
- CB-ATM-GOLDEN-SAMPLE: muestra ATM request/response dirigida al PID CB 82052,
  con correlacion STAN/RRN/UTRNNO; la muestra USD 20 elegida de 82032 queda
  apartada. La asociacion actual 205 / 82052 / 49212 fue confirmada por el usuario.
- CMS-CORRELATION: Journal/Message del intento financiero cuando haya admision;
  no se sustituye por un socket establecido o mensajes de red.

Metadatos privados: artifacts/qa-new-switch-log-review.json,
artifacts/qa-switch-admission-detail.json, artifacts/qa-current-switch-routing.json
y artifacts/qa-current-switch-access.json. No contienen payload financiero.
