# Consulta ATM CB 205: muestra y prueba QA

## Fuente y alcance

Actualizacion 2026-10-16: la respuesta real 0210/96 de STAN 900107 contiene
F44, ausente de las muestras previas admitidas. Se incorpora como EBCDIC
variable de 1-25 bytes conforme a ISOBASEI y al prefijo binario observado
en NWINT. La reproduccion offline confirma correlacion y ausencia de saldos.
El rechazo remoto procede de F39 literal `5 ` sin mapeo para nwind 28;
su motivo de negocio requiere PROXY205. Ver
[logs, hashes y regresion](QA_SWITCH_LOGS_20261016.md).

Prueba posterior a correccion QA autorizada del cfg Mediator (OnError del
paso 008: 0121 -> 012), 2026-10-12: runId
e0e41301-165b-4a34-aca7-e504cb4384e1, transactionId
64d3a488-9000-44d4-af25-c00ed853c357. Unico write de 536 bytes a las
21:48:18.738 UTC (16:48:18.738 Ecuador), captura original 007923,
301000/ATM20521/RRN 628100007923. Recibe 0210/F39=96 sin F54 y
finaliza 21:48:19.767 UTC. No produce PIN/EMV nuevo ni demuestra
ejecucion de la rama de error corregida. Reporte bajo artifacts:
qa-cb-balance-attempt-e0e41301-165b-4a34-aca7-e504cb4384e1.json.

La ruta compartida W (172.60.60.156/e$) permite leer PROXY20520261012.txt:
lineas 22/23 ISOREQUEST 16:48:19.087 y 24/25 ISORESPONSE 16:48:19.587,
con coincidencia de STAN/codigo. Se proyectan solo metadatos; no HEX ni
identificadores privados del log. No se infiere UTRNNO de esos identificadores.
El reporte current-proxy-review.json conserva hash/version de la fuente.

SQL de solo lectura (36ffca55-912f-415a-925a-7710c579fe33 y
cb6eb89f-71b2-4d16-b1a6-45903f5179d6) no encuentra una nueva fila
301000 del ATM; ultima exacta sigue siendo 31580488 de las 15:31.
En la ventana aparecen 31580492 y 31580493, codigo 310030/canal 21,
secuencias 176291/176292, sin terminal y RetCode 8908. Los logs
CBCOOPERAT/ADPROUTER registran WS, PROCESADOR NO RESPONDE y respuestas
a las 16:48:40.509/16:48:44.369, posteriores al 96 recibido por el cliente.
No se asignan como suboperaciones del replay sin correlacion de origen.
Ver BALANCE_EXECUTION.md para la correccion aplicada, respaldo y fuentes
de flujo diferenciadas entre host ATM Y y Mediator W.

Prueba real QA posterior a revisar DebitoConecta_999999.cfg, 2026-10-12:
runId d0a39870-baea-44dc-9cd5-4fb3b2530eef, transactionId
3e6acd4e-c840-4f01-b2f5-7a3143c26b6c. Unico write de 536 bytes a las
20:57:09.542 UTC (15:57:09.542 Ecuador), misma captura original
0200/301000/STAN 007923/RRN 628100007923/ATM20521. Recibe
0210/F39=96 sin F54; finaliza a las 20:57:10.487 UTC. No genera
PIN/EMV nuevos, modifica campos del caso ni envia retiro/reverso.

SQL de solo lectura posterior (diagnostico d6481c86-465e-47d0-ac99-7dc9d69938a6)
no encuentra una nueva fila 301000 de ATM20521. El ultimo TraceId exacto
sigue siendo 31580488, correspondiente al intento aprobado de 15:31.
Inspeccion acotada por TraceId (329d4885-0e00-49be-952e-4de76be81f15)
identifica 31580490/31580491, entidad 205/canal 21, codigo 310030,
terminal vacio y secuencias 176289/176290, a las 15:57:10.937 y
15:57:11.877 de fuente. Segun el manual, 310030 corresponde a consulta
de cliente, no saldo. La proximidad horaria no demuestra que sean
suboperaciones del replay; requieren correlacion de logs/UTRNNO.
No se declara llegada de la consulta financiera al Core ni se atribuye
el 96 al rechazo 802 de las 13:19, a duplicidad o al cfg sin log actual.

Reportes privados bajo artifacts: qa-cb-balance-attempt-d0a39870-baea-44dc-9cd5-4fb3b2530eef.json,
cb-current-route-diagnostic-d6481c86-465e-47d0-ac99-7dc9d69938a6.json y
cb-latest-mediator-window-329d4885-0e00-49be-952e-4de76be81f15.json.
TODO-DATA CB-96-CURRENT-SWITCH-LOG: nwint/txrout y logs del autorizador
de 15:57:05-15:57:20 Ecuador (20:57:05-20:57:20 UTC) del 12 de octubre,
para STAN 007923/ATM20521 y posibles consultas CMS 31580490/31580491.
No se modifica SQL ni configuraciones de Y:/ExtremePCI.

Nueva prueba autorizada del 2026-10-12, runId
0d549c7e-1a58-43ce-bba3-6a96597fb646: write unico de 536 bytes a las
20:31:30.970 UTC (15:31:30.970 Ecuador), reproduccion original STAN 007923,
RRN 628100007923 y ATM20521. Recibe 0210/F39=00 con F54 presente;
finaliza a las 20:31:32.301 UTC. No genera PIN/EMV nuevo ni envia retiro.
Consulta SQL de solo lectura correlaciona MDT_Journal/MDT_Message TraceId
31580488, entidad 205/canal 1, secuencia 7923/codigo 301000,
RealDate 2026-10-12 15:31:31.763 y fin 15:31:32.013, RetCode=0,
MappedRespCode=0, CodigoProceso=0 y MsgErr=APROBADO. Confirma llegada y
aprobacion registrada en Mediator en esta ventana; no se obtuvo log directo
del Core ni diagnostico de que cambio en los servidores. El rechazo de
13:19 descrito abajo es historico y no se extrapola al intento aprobado.
Reportes privados: qa-cb-balance-attempt-0d549c7e-1a58-43ce-bba3-6a96597fb646.json
y cb-current-route-diagnostic-31b41232-11e4-4ae0-b87c-5c57e500e1f8.json,
ambos bajo artifacts. No se modificaron datos SQL ni configuraciones remotas.

### Diagnostico correlacionado del 2026-10-12

Los logs tcpcomms01.out, tcpcomms01_bg.out y nwint00_90567.out recibidos
del usuario cubren las dos reproducciones del original enviadas a las
18:19:23.956 y 18:19:56.712 UTC. Los horarios de fuente son compatibles con
Ecuador; no se certifica sincronizacion de relojes. Ambas conservan STAN
007923, RRN 628100007923 y terminal ATM20521, sin generar nuevo PIN/EMV.

| runId | UTRNNO nuevo registrado por Switch | Fallo de fuente | Respuesta registrada |
| --- | --- | --- | --- |
| 32dc6d50-ecbf-4850-be20-cc86f67f59e0 | 262851819241039480 | 13:19:24.146329, denial code 802 | 13:19:24.188402, RESP=802 / RESPCODE=91 |
| a61c4ee1-3a9a-42a3-9e94-349d3d489f13 | 262851819568813530 | 13:19:56.979909, denial code 802 | 13:19:57.193511, RESP=802 / RESPCODE=91 |

Evidencia del primer recorrido en nwint00_90567.out: linea 119638 envia
la solicitud a TXROUT1; lineas 119841 y 119930 muestran regreso con destino
999 y SVT_FRAUD_PID=999; lineas 120243-120255 mantienen ese destino, registran
NETWORK LINE DOWN, PID no disponible, cannot send y denial code 802.
La linea 123475 registra RESP=802 y RESPCODE=91. El segundo recorrido
repite esa secuencia en lineas 126542, 126855-126867 y 130087.
El campo SVT_FRAUD_PID identifica una etapa de fraude; no permite concluir
que 999 deba sustituirse por 82052 ni que su uso sea una configuracion errada.
La solicitud se detiene en esa etapa del Switch antes del recorrido al Core.
No es evidencia del timeout historico 8908 de Mediator.

tcpcomms01.out identifica PID 999 en 10.60.0.20:2223 con llamadas abortadas
(lineas 55357-55371). Independientemente, el enlace CB 82052 hacia
172.60.60.156:49212 tambien aborta conexiones (lineas 59016-59030;
tcpcomms01_bg.out lineas 15849 y 16333-16334). No se establece si es
listener caido, firewall, ruta, servicio o causa compartida sin inspeccion
desde los servidores. Requiere recuperar ambos enlaces y verificar la
politica de la etapa de fraude; cambiar la trama del simulador no resuelve
un destino servidor desconectado.

La consulta SQL de solo lectura del 2026-10-12 al servidor compartido
QA/PREPROD tampoco encuentra registros de hoy para entidad 205/canales 1 y
21 ni consultas 301000 de ATM20521. Conserva los dos registros historicos
del 8 de octubre. La configuracion visible sigue habilitando 301000/ADPROUTER
y ADPCOREGEN para ambos canales. Esto complementa la evidencia de Switch,
sin demostrar por si solo que ese SQL sea la BD runtime de cada proceso.
La excepcion TLS diagnostica puntual no cambia el observador permanente.

Hashes SHA-256 de las fuentes recibidas:

- nwint00_90567.out: 6392923118407631bcbbe9aff582de20f9e144bb375e32d54b7df68dc174ccf2.
- tcpcomms01.out: 9c19572a572371e752556cf3bf60bd54118452d743f04b5e608fa69f0042f228.
- tcpcomms01_bg.out: 019209c4442179249209de0c0eda8c94d6be782fec850f01ee69a9ec64c2fecf.

TODO-DATA CB-CURRENT-SWITCH-LINKS: resultado de conectividad desde Switch a
ambos destinos, listener y logs del servicio de 999 y PROXY205, y txrout de
13:19:20-13:20:10 del 12 de octubre para confirmar politica/seleccion de fraude.
No deshabilitar controles ni modificar rutas/SQL sin contrato aprobado.
Reporte privado: artifacts/current-cb-switch-diagnosis.json. En esta revision
no se transmitieron consultas nuevas ni se modificaron servicios del servidor.

Reejecucion posterior, 2026-10-12: runId 9a6606b3-6829-4f2e-abed-99f27e97d274.
Write unico de 536 bytes a las 18:16:03.939 UTC (13:16:03.939 Ecuador),
STAN 007923 original; el Switch responde 0210/F39 91 correlacionado y sin F54.
La conexion funciona en esta ventana. Falta evidencia nueva de Mediator/Core;
no se reutiliza el TraceId historico ni se infiere la causa actual del 91.
qa-cb-balance-last-attempt.json ahora corresponde a esta reejecucion transmitida.

Ultimo intento real de conexion, 2026-10-12: reproduccion original autorizada,
sin modificar STAN/fechas/PIN/EMV. runId b550c403-42ae-4ae3-8152-2a8b31208152;
conexion intentada 17:40:46.789-17:40:50.841 UTC (12:40:46-12:40:50 Ecuador).
10.60.0.11:16100 devuelve ECONNREFUSED: cero bytes enviados/recibidos, sin write
ni 0210/F39. Probe separado runId d9655f17-b6d9-4a17-aacc-8d2f45c4e560 confirma
REFUSED, igualmente sin transmitir. Esta evidencia no es un nuevo 91/96 ni
prueba de llegada a Mediator/Core. Requiere revisar listener/red de Switch;
la causa exacta del rechazo TCP no se infiere desde el cliente.
El reporte original del caso del 2026-10-08 conserva su referencia historica;
el reporte del intento sin transmision conserva su propio runId.

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

Revision de F35, 2026-10-16: frame 218 de PruebaSimulador.pcap (SHA-256
a59148b665715284d1c673cc9137338386088f31b3922c3f2d77bb42449154ab), cuya
respuesta aprobada es frame 224, contiene 37 digitos en 19 bytes BCD, con
nibble 0 de relleno a la izquierda y sin F final. El separador D ocupa el
indice 17 de los nibbles empaquetados; al quitar el 0 inicial, el PAN coincide
con F2. Por tanto, al convertir tag EMV 57 a F35 se retira su F final y se
reempaca con relleno 0 inicial si la longitud es impar. El prefijo binario
cuenta los digitos utiles (37 = 0x25), sin contar el relleno. Una longitud
par no necesita relleno. No copiar directamente los bytes de tag 57.

SmartVista QA correlaciona ATM20521/STAN 900105 y 900106 del 2026-10-15 con
respuesta interna 880 y externa 19; el detalle de 900106 identifica BAD_TRK2.
Esto y la diferencia de empaquetado sustentan la correccion del proveedor.
La captura aprobada tambien contiene TVR 8080800000 y CVM 3F0001; no atribuir
el rechazo a esos diagnosticos sin evidencia adicional. La comparacion
privada artifacts/approved-track2-20261016.json conserva solo estructura,
hash y tags publicos, sin PAN, Track 2, PIN Block ni volcado de trama.
La validacion financiera posterior sigue pendiente; correlacion completa en
[BALANCE_EXECUTION.md](../implementation/BALANCE_EXECUTION.md).

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
