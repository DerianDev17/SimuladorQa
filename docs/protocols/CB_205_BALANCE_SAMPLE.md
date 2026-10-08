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
es una cola, procesamiento interno o llamada a una dependencia. Falta nombre
del archivo, proceso y servidor emisor, configuracion de AUTHTD y su relacion
con ADPCOREGEN/Core. No se atribuye automaticamente el timeout a HTTP/TLS.

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

Otra consulta de la captura, STAN 007921, sale a Mediator (frame 208), carece de
respuesta correlacionada en el archivo y recibe F39 91 hacia ATM (frame 212)
aproximadamente diez segundos despues. Es una pista para revisar tiempos y
errores del procesador, sin probar la causa del intento actual.

## Verificacion y pendientes

Fixtures sinteticas cubren reconstruccion exacta, copia independiente,
respuestas 00/14/91, privacidad, transaccion/monto/moneda invalidos, encoding,
longitudes, bitmap, truncamiento y residuo. La integracion TCP local verifica
una unica entrega y respuesta fragmentada. QaTcpReplay cubre errores y timeouts
del transporte en sus pruebas existentes.

- TODO-DATA CB-PROCESSOR-ERROR: espera AUTHTD de 15.001 segundos confirmada.
  Identificar archivo/proceso/servidor emisor y configuracion/ruta AUTHTD;
  correlacionar con ADPCOREGEN/PROXY205, TraceId 31580471 y su dependencia Core
  alrededor de 13:04:37-13:04:58. Precisar recepcion, cola, procesamiento,
  request/response HTTP y plazos efectivos; no cambiar timeouts sin evidencia.
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
