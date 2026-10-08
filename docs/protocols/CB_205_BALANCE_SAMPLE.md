# Consulta ATM CB 205: muestra y prueba QA

## Fuente y alcance

El usuario entrego PruebaSimulador.pcap el 2026-10-08, identifico la consulta
UTRNNO 262811741235439980 y aporto su par MDT_Message.msgRequest/msgResponse.
SHA-256 de esta version: a59148b665715284d1c673cc9137338386088f31b3922c3f2d77bb42449154ab.
No usar versiones anteriores del archivo con el mismo nombre.

La muestra se contrasto con ISOBASEI.bin y el formatter. Corresponde a ATM20521,
STAN 007923, tarjeta 428150XXXXXX2267, codigo 301000, monto cero y moneda 840.
El usuario confirma CB 205 como PID 82052 / Mediator 49212. UTRNNO es una
referencia del usuario; no se encontro como campo del wire.

| Frame | Tramo | UTC 2026-10-08 | MTI | Bytes wire/cuerpo | RRN | F39 |
| --- | --- | --- | --- | --- | --- | --- |
| 218 | ATM -> SmartVista 16100 | 17:41:23.541 | 0200 | 536/532 | 628100007923 | ausente |
| 220 | SmartVista -> Mediator 49212 | 17:41:23.756 | 0200 | 410/406 | 628117007923 | ausente |
| 222 | Mediator -> SmartVista 49212 | 17:41:24.523 | 0210 | 237/233 | 628117007923 | 00 |
| 224 | SmartVista -> ATM 16100 | 17:41:24.597 | 0210 | 208/204 | 628100007923 | 00 |

El XML historico tiene entidad/destino 205, canal 1, secuencia 7923, codigo
301000, TraceId de respuesta 31580463 y RetCode 0. F7 y RRN difieren entre
el frente ATM y Mediator: se conserva la observacion, sin establecer una regla
general de generacion. FechaContable 20251021 difiere de la fecha transaccional;
no se corrige ni se infiere su causa.

El retiro identificado como UTRNNO 262811742319878870 corresponde a frames
248/250/252/254, STAN 007927, codigo 011000, USD 20, F39 00 y TraceId 31580469.
Se conserva como referencia; no se envio durante esta prueba.

## Codec y limites

CapturedVisaBalance se ejecuta fuera del Renderer. Acepta solo el conjunto de
campos observado para consulta 0200 y el subconjunto de respuesta 0210, con
codigo 301000, moneda 840, PAN de 16 digitos y monto cero en request. Comprueba
cabecera de 22 bytes, longitud de cuerpo, bitmap primario de ocho bytes, limites
de campos variables y consumo completo. Los prefijos variables son un byte
binario en estas muestras; BCD usa ceil(digitos/2). EBCDIC se decodifica solo
para identificadores/codigo de respuesta con el subconjunto observado.

La reconstruccion copia cabecera y segmentos originales; el request preparado
coincide byte a byte con frame 218. CapturedVisaFraming agrega la envolvente
BE16 de longitud de cuerpo y extension 0000. Conserva fechas, STAN/RRN y campos
privados originales. No genera PIN/EMV, sustituye tarjeta/cuenta, crea una nueva
transaccion ni construye retiros.

La inspeccion proyecta solo metadatos, PAN enmascarado y longitudes/numero de
campos. Los bytes sensibles permanecen en memoria privada, sin logs, IPC,
fixtures reales ni archivos extraidos versionados. La UI general de envio
sigue pendiente de reglas de generacion y sesion.

## Intento unico desde la PC

runId: e9a62eee-893c-44b2-a26c-8ce93ccea567.
transactionId: 3983e80e-1bd0-4d3e-9771-e09e0072077f.

- QA: PC 10.10.10.21:64323 -> SmartVista 10.60.0.11:16100.
- Conexion UTC 18:04:37.116; write UTC 18:04:37.260 (13:04:37 Ecuador).
- Unico request: 536 bytes, 0200 / 301000 / STAN 007923 / ATM20521.
- Primero se recibio 0800 / 071; no se envio 0810.
- Respuesta correlacionada: 0210 / F39 91, RRN 628100007923, 142 bytes wire.
- Fin UTC 18:04:46.607 (13:04:46 Ecuador), framing completo.
- Sin reintentos, reconexion, reverso ni retiro.

La captura historica contiene gestion 071/072 y consultas aprobadas sin 0810
capturado. Esto describe lo observado, sin definir una politica universal de
respuesta o sesion lista. La prueba no modifica la configuracion del servidor.

El usuario confirma la llegada a SmartVista y Mediator. Su msgResponse identifica
TraceId 31580471, entidad/destino 205, canal 1, terminal ATM20521, secuencia
7923, codigo 301000 y monto cero:

| Campo | Valor aportado |
| --- | --- |
| RealDate de Mediator | 20261008 13:04:58.076 |
| RetCode | 8908 |
| RetMsg | WS, PROCESADOR NO RESPONDE |
| MappedRespCode | 10096 |

RealDate se conserva como hora del XML. Al compararlo con Ecuador, Mediator
parece registrar el error despues del 91; falta confirmar zona/reloj del servidor
y el instante exacto de respuesta financiera. No se declaran equivalentes esos
codigos a F39 ni se incorpora un mapeo universal. La comunicacion hasta Mediator
esta confirmada; llegada efectiva al Core y aprobacion no estan demostradas.

### Log adicional de espera AUTHTD

El usuario aporta dos registros ISOREQUEST a las 13:04:37.544 y un registro
ISORESPONSE a las 13:04:52.545: Time Out esperando respuesta (AUTHTD/AUTHTD),
RC=8908. El intervalo dentro de esa misma fuente es 15.001 segundos.
Se confirma una espera agotada hacia AUTHTD/AUTHTD, sin precisar si su origen
es una cola, procesamiento interno o llamada a una dependencia. El usuario
identifica despues el servidor Mediator 172.60.60.156 y PROXY205 como emisor.
Faltan archivo/configuracion de AUTHTD y su relacion con ADPCOREGEN/Core.
No se atribuye automaticamente ese timeout a HTTP/TLS.

El contenido aportado permite reconocer codigo 301000, STAN 007923 y terminal
ATM20521. No se conserva el HEX ni el identificador del log: contienen campos
privados o identificadores cuyo tipo no ha sido confirmado. Tampoco se deduce
UTRNNO del sufijo de ISOREQUEST. La fuente registra dos variantes O/M; no se
inventa el significado de esas etiquetas.

Si los relojes coinciden, el cliente ya habia finalizado con F39 91 a las
13:04:46.607, antes del timeout AUTHTD a las 13:04:52.545 y del RealDate XML
13:04:58.076. Son puntos de observacion distintos. No se confunde la ventana
del simulador con la espera interna ni se aumenta una para corregir la otra.
El timeout de execute=15000 del XML SWATM01 tampoco se identifica con este
intervalo: su unidad y funcion siguen sin documentar.

### Eventos identificados en Mediator

El usuario aporta los siguientes eventos de 172.60.60.156, fecha 2026-10-08:

| Hora de fuente | Componente | Evidencia |
| --- | --- | --- |
| 13:04:52.545 | W-PROXY205 | Time Out esperando respuesta AUTHTD/AUTHTD, RC=8908 |
| 13:04:58.091 | E-AUTHTD | WakeUpClientFromAuth: Transaccion #15 en TimeOut |
| 13:04:59.716 | E-EXTREMELOG | IECLIPSOFT WS, NO SE PUEDE PROCESAR: The underlying connection was closed: An unexpected error occurred on a receive. |

Esto ubica la espera en PROXY205 y un intento posterior de despertar una
transaccion vencida en AUTHTD. El numero interno 15 no reemplaza el TraceId,
STAN, transactionId UUID ni UTRNNO. El evento WS confirma un error al recibir
en una conexion, pero carece de entidad/TraceId y excepcion interna; su
asociacion al intento CB 205 requiere correlacion. No demuestra protocolo TLS
incompatible, certificado invalido, cierre remoto, proxy o causa financiera.

El archivo Texto pegado.txt adjunto tiene 5779 bytes y eventos de
ClearDeamonNet.exe / GetConfigFile en MEDIATORCLONE a las 13:04:44. Reporta
claves ausentes MaximoTCR91, GeneraTC90, ReprocONUS y FechaFin en
E:/ExtremePci/ConfigFiles/ClearDeamonNet.exe.config. No contiene el stack del
error WS ni una referencia a esta consulta. Se registra como incidencia de
configuracion separada, sin inventar valores ni atribuirle el timeout.

Otra consulta de la captura, STAN 007921, sale a Mediator (frame 208), carece de
respuesta correlacionada en el archivo y recibe F39 91 hacia ATM (frame 212)
aproximadamente diez segundos despues. Es una pista para revisar tiempos y
errores del procesador, sin probar la causa del intento actual.

## Verificacion y pendientes

### Comparacion PCAP / envios / nwint recibida el 2026-10-08

La revision offline vuelve a verificar el SHA-256 de la captura y reconstruye
cada envio contra su hash registrado. Hay **cuatro envios** de 536 bytes y
**tres preparaciones PREPARED_ONLY**; estas ultimas no transmitieron.
Esta comprobacion usa registros locales de envio, no una captura nueva del
trafico de la PC.

| STAN | Envio UTC | Hora Ecuador | Cambio frente a frame 218 | F39 recibido |
| --- | --- | --- | --- | --- |
| 007923 | 18:04:37.260 | 13:04:37.260 | Ninguno; reconstruccion identica | 91 |
| 008101 | 20:28:46.389 | 15:28:46.389 | Solo F11 | 96 |
| 008102 | 20:29:34.582 | 15:29:34.582 | Solo F11 | 96 |
| 008103 | 20:46:56.107 | 15:46:56.107 | Solo F11 | 96 |

En los cuatro intentos se conservaron F7=1008124123, F12=124123,
F13/F15=1008 y F37=628100007923. Cabecera, bitmap, campos privados y datos
PIN/EMV se conservaron byte a byte. Los intentos con STAN diferente son
variantes de una captura; **no son transacciones nuevas validadas**. La
presencia del lector en 008103 no cambia el origen de los datos a lectura del
chip. No se atribuye el codigo 96 a RRN, fechas, PIN o EMV sin log correlacionado.

El request original y la envolvente se reconstruyen sin diferencias. El
request historico enviado por SmartVista a Mediator cambia F7, F25, F37 y
campos privados; pertenece a otro tramo. No se reemplaza el request ATM por
ese request ni se trasladan sus reglas al simulador.

El nwint00_22150.out adjunto tiene SHA-256
640c2ac840878efa8776115a23c8186ef3b0e5ee017a9ff8833bbecdcd2f083a.
Su reloj de fuente va de 16:00:01.747263 a 16:46:32.520847, con zona sin
confirmar. La proyeccion de org_pid/dest_pid muestra 0, 82262 y 280120;
no aparecen 80131 ni 82052 en esos registros. Los campos ISO impresos son
F7/F11/F39/F70; ninguno de los 91 registros reconocidos de F11 corresponde
a los cuatro STAN de la tabla. No hay un mensaje financiero 0200/0210
identificado en los encabezados msgtype. Los errores de AUTH_PARAM_TAB y
la seleccion alternativa de token_scheme_id observados pertenecen a esos
otros mensajes; no prueban la causa de los rechazos del simulador.

La herramienta reproducible `tooling/review-cb-evidence.mjs` acepta la ruta
actual de PCAP y nwint, comprueba hashes y metadatos y genera solo la
proyeccion protegida en artifacts/cb-capture-versus-simulator-comparison.json:

```powershell
node tooling/review-cb-evidence.mjs 'Tramas transacciones/PruebaSimulador.pcap' 'C:/Users/dnazareno/Downloads/nwint00_22150.out'
```

No abre sockets. No depende de la antigua ruta Downloads del PCAP ni cuenta
preparaciones como envios. Bloquea el reporte ante discrepancia de hash,
STAN/RRN/terminal o registro contradictorio. El inspector de nwint devuelve
solo tiempos de fuente, PID, tipos y STAN con numero de linea; no devuelve
lineas RAW, PAN, PIN Block, Track 2, EMV ni textos de error del proveedor.
Requiere los reportes privados existentes de ISOBASEI, caso y envios bajo
artifacts, ademas de tshark/esbuild; no es un importador ISO de proposito general.
Se corrigio la ruta privada del caso a la copia local de igual hash y su
execution.report apunta al archivo del runId original, en lugar del mutable
qa-cb-balance-last-attempt.json que ahora corresponde a otro envio.

- TODO-DATA CB-96-SWITCH-LOG: obtener el nwint del proceso que atiende
  PID 80131 y su recorrido a CB 82052 para STAN 008101/008102/008103,
  con UTRNNO y reloj confirmado. Ventanas del cliente: 15:28:46,
  15:29:34 y 15:46:56 Ecuador del 2026-10-08. El adjunto actual no permite
  localizar la etapa que devuelve 96. Bloquea solo esa correccion causal.
- TODO-DATA CB-DYNAMIC-REQUEST sigue abierto: no establecer una formula
  RRN/STAN/fechas ni reutilizacion valida de seguridad por inferencia de los
  cuatro intentos. No corregirlos cambiando F39 ni ampliando timeouts.

Fixtures sinteticas cubren reconstruccion exacta, copia independiente,
respuestas 00/14/91, privacidad, transaccion/monto/moneda invalidos, encoding,
longitudes, bitmap, truncamiento y residuo. La integracion TCP local verifica
una unica entrega y respuesta fragmentada. QaTcpReplay cubre errores y timeouts
del transporte en sus pruebas existentes.

- TODO-DATA CB-PROCESSOR-ERROR: servidor/proceso identificados como
  172.60.60.156 / PROXY205; espera AUTHTD de 15.001 segundos confirmada.
  Falta configuracion/ruta AUTHTD y evento WS completo con StackTrace,
  InnerException y entidad/TraceId. Correlacionar con ADPCOREGEN, TraceId
  31580471 y dependencia Core en 13:04:37-13:04:59; no cambiar plazos/TLS
  ni generar reintentos sin resolver causa y correlacion.
- TODO-DATA CLEARDAEMON-CONFIG: contrastar las cuatro claves ausentes con
  configuracion/version aprobada de ClearDeamonNet. Su efecto y vinculacion
  con esta consulta no estan establecidos; no bloquea la inspeccion del caso.
- TODO-DATA CB-CURRENT-CORRELATION: UTRNNO nuevo de este intento y relojes;
  el UTRNNO historico no identifica el replay.
- TODO-DATA CB-DYNAMIC-REQUEST: reglas nuevas de fechas/STAN/RRN, PIN/HSM/EMV
  y perfiles de tarjeta/cuenta. Bloquea generacion, no inspeccion.
- TODO-DATA VISA-NETWORK-RESPONSE-POLICY: politica 071/072 y respuesta 0810,
  sesiones prolongadas/coexistencia. Bloquea automatizacion de gestion/carga.

Reportes privados: artifacts/cb-balance-capture-review.json,
artifacts/qa-cb-balance-case.json y artifacts/qa-cb-balance-last-attempt.json.
El ultimo guarda solo una proyeccion permitida de la evidencia del usuario,
sin XML completo, cuenta, documento o datos privados.
