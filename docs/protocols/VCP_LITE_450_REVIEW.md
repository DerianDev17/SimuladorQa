# Revision VCP Lite 450 Diebold y logs del Switch

## Fuentes y ventana

Analisis offline del 2026-10-07. Fuente privada:
`Tramas transacciones/CertificacionVcpLite450Diebold.pcap`, 115916 bytes,
1200 paquetes, SHA-256
`903fa9148c1dd12f27f9e6a9e3b14ad300d617ff60bc689600156405d360f314`.
Periodo UTC: 15:47:13.203862 a 17:44:49.057440; conversion a Ecuador:
10:47:13 a 12:44:49. Los tiempos originales conservan precision de microsegundos
en el PCAP; los reportes JSON usan milisegundos.

Carpeta privada `Tramas transacciones/202610071200`: 39 archivos,
43692822 bytes y 676577 lineas incluyendo separadores finales. Las trazas
principales tcpcomms01, nwint00, txrout01 y crout00 cubren 11:00:02 a 12:00:02
en su reloj impreso. Las horas coinciden con PCAP convertido a Ecuador para
los casos correlacionados; no se declara una zona universal para todos los logs.

No contiene los intentos de nuestra PC de 16:26 a 16:45. No se encuentra
NO AUTHORIZATION, la IP local de la PC ni evidencia XML de ExtremeMsg/Core
en estos archivos. Esto no contradice el aviso observado en la conexion posterior.
No se ejecutaron envios ni se modifico configuracion del Switch durante el analisis.

## Enlaces observados y diferencia pendiente

El PCAP contiene dos conversaciones ya abiertas, sin SYN ni RST:

- ATM: equipo de cajeros hacia SmartVista por 16100. Trece paquetes con mensajes
  de solicitud y trece respuestas mayores de 60 bytes, ademas de trafico de control.
- Mediator: enlace 49212 en ambos extremos, con keepalives de un byte y ACK;
  **ningun payload TCP mayor de un byte** en esta captura.

Para el retiro STAN 001391, nwint00 muestra orgdev=80131, destino=82032 y retorno
al PID 80131. tcpcomms01 registra envio al dispositivo 82032 y recepcion desde el.
El usuario confirma que PID 82032 corresponde a Mediator por 49212.
Sin embargo, los bytes financieros no estan en esa conversacion del PCAP.
La causa de esta diferencia no esta confirmada: no se sustituye el puerto ni
se deduce una ruta/interfaz alternativa. Se requiere captura del socket/interfaz
efectivos o configuracion/log contemporaneo que explique la diferencia.

No hay prueba de llegada/aplicacion contable al Core ni respuesta HTTP/XML en
estas fuentes. Los mensajes internos del Switch no sustituyen Journal/Message.

## Retiro de USD 20 identificado

Correlacion por tiempo, STAN y UTRNNO del log, preservado como string en el
reporte privado. Card mask observada: `423216XXXXXX0663`; no corresponde a
la tarjeta ficticia del caso nuevo, terminada en 0311.

| Etapa | Hora impresa / Ecuador | Evidencia |
| --- | --- | --- |
| Entrada ATM | 11:38:05.276 | PCAP paquete 543, 562 bytes; tcpcomms01 linea 157815 lee 4 y linea 157823 lee 558 |
| Operacion interpretada por Switch | 11:38:05.297 | nwint00 linea 157194: STAN 001391, ATM20301, MTI 200, prcode 011000, reqamt 2000, moneda 840 |
| Enrutamiento | 11:38:05.485 | nwint00 linea 160030: destino 82032 |
| Escritura al dispositivo 82032 | 11:38:05.497 | tcpcomms01 linea 158018: 438 bytes en fd 40; cuerpo registrado de 434 bytes |
| Lectura desde dispositivo 82032 | 11:38:08.108 | tcpcomms01 linea 158149: cuerpo de 249 bytes |
| Retorno al ATM | 11:38:08.159 | PCAP paquete 545, 220 bytes; nwint00 linea 164245: MTI 210, resp interno -1 |

Tiempo PCAP entre request/response: aproximadamente 2.883 segundos.
reqamt=2000 coincide con USD 20 mostrado en el monitor aportado; no se crea una
regla universal de escala de montos a partir de esta muestra. El monitor del
usuario muestra -1/00 para ese caso; no se declara debito Core verificado ni
se adopta el codigo interno -1 como una regla universal de RC ISO.

## Operaciones localizadas

La captura contiene 13 solicitudes ATM correlacionadas: siete consultas,
cuatro retiros y dos reversos. Los dos reversos reutilizan los identificadores
del original en estas muestras; no son dos retiros nuevos.
Los montos indicados corresponden a las muestras y al monitor aportado.

| Hora solicitud | STAN | Operacion | Monto | Respuesta interna / retorno |
| --- | --- | --- | --- | --- |
| 11:30:02 | 001370 | Saldo | - | 801 / MTI 210, timeout |
| 11:31:26 | 001372 | Saldo | - | -1 / MTI 210 |
| 11:31:56 | 001374 | Saldo | - | -1 / MTI 210 |
| 11:32:27 | 001376 | Saldo | - | -1 / MTI 210 |
| 11:33:21 | 001378 | Saldo | - | -1 / MTI 210 |
| 11:34:01 | 001381 | Saldo | - | -1 / MTI 210 |
| 11:34:28 | 001383 | Saldo | - | -1 / MTI 210 |
| 11:35:11 | 001385 | Retiro | USD 10 | -1 / MTI 210 |
| 11:35:42 | 001385 | Reverso del retiro | USD 10 | -1 / MTI 430 |
| 11:36:03 | 001387 | Retiro | USD 10 | -1 / MTI 210 |
| 11:36:12 | 001387 | Reverso del retiro | USD 10 | -1 / MTI 430 |
| 11:38:05 | 001391 | Retiro | USD 20 | -1 / MTI 210 |
| 11:54:34 | 001395 | Retiro | USD 10 | -1 / MTI 210 |

El caso 001370 tiene un fallo real dentro del procesamiento: nwint00 linea
54309 entra en tran_req_timeout; linea 54314 registra Sending denial back to ACQ.
A las 11:30:12 se devuelve resp=801 y el monitor aportado muestra 91. La linea
54711 registra Late Response (BALINQ) -- DISCARDED dentro de ese manejo; esta
frase no prueba por si sola una respuesta Core recibida tarde.
El request/response PCAP tarda aproximadamente 9.264 segundos. Ese timeout es
distinto de la denegacion de conexion de nuestra PC antes de enviar ISO.

El codigo 802 aparece en etapas intermedias con destino 999, incluso en el
retiro 001391 que retorna -1. No se toma el primer estado intermedio como el
resultado final ni se cambian reglas de enrutamiento por esa observacion.

## Encapsulado VISA observado en 16100

tcpcomms01 invoca receive_visa_message y registra en linea 157813:
Header length from configuration is ignored for this format.
Lee cuatro bytes y luego el cuerpo. La longitud configurada 2 en la pantalla
del PID no describe por si sola el encabezado efectivo usado por este formato.

| Parte | Observacion en la muestra |
| --- | --- |
| Bytes 0-1 | BE16, longitud del cuerpo excluyendo los cuatro bytes iniciales |
| Bytes 2-3 | Extension preservada sin interpretar: 0x0000 en requests, 0x2020 en sentido Switch -> ATM |
| Desde byte 4 | Cuerpo opaco, sin aplicar el codec BANRED 4946 |

Reensamblado por secuencia TCP, excluyendo los segmentos de un byte y conservando
todos los payloads mayores: cero huecos y cero solapamientos distintos.
Se consumen 7024 bytes / 13 mensajes ATM -> Switch y 16806 bytes / 249 mensajes
Switch -> ATM. Se reconstruyen 262/262 frames identicos, sin residuo; las
extensiones se copian de la fuente. De los 249 del segundo sentido, 236 tienen
60 bytes y quedan separados del conteo de operaciones financieras.

Esto valida la envolvente **de esta captura**, no un diccionario ISO completo,
semantica de la extension, TLS, handshake nuevo o reglas dinamicas. El request
historico de 548 bytes con longitud inicial 544 es compatible con esta forma;
la nueva evidencia explica esa diferencia sin recortar cuatro bytes de la fuente.
No se convierte una coincidencia de packing en autorizacion para enviar.

## Reportes privados y pendientes

Reportes JSON de metadatos bajo artifacts: vcp-log-review, vcp-pcap-review,
vcp-transaction-metadata, vcp-target-log-windows, vcp-framing-and-cases y
vcp-final-diagnostics. Los originales y estos artefactos quedan fuera de Git;
no se conserva payload extraido ni se exponen PAN/PIN/Track2 en los reportes.

- TODO-DATA SWITCH-ATM-ACCESS: log/configuracion de la denegacion de la PC de
  16:26-16:45, origen visto por servidor y admision de interfaz QA.
- TODO-DATA PCAP-LINK-PROFILES: resolver la diferencia de PID 82032/49212 entre
  logs y PCAP. No atribuirla silenciosamente a filtros, interfaces o NAT.
- TODO-DATA ISO-SPEC / GOLDEN-SAMPLES: validar perfil proveedor y campos de
  tarjeta, cuenta, PIN/HSM, EMV, fechas y generacion de STAN/RRN antes de crear
  una solicitud nueva con la tarjeta ficticia. Las tramas reales son referencias.
- TODO-DATA CMS-CORRELATION: Journal/Message y evidencia Core del caso 001391.
  Los mensajes internos del Switch y los bytes del socket no acreditan debito.
