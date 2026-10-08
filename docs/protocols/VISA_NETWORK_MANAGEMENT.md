# Gestion de red ATM Coonecta

## Fuentes y diferencia observada

El alcance es el enlace QA ATM -> SmartVista 10.60.0.11:16100. No se adopta
el echo del mock BANRED 4946 ni se interpreta un mensaje de red como una
transaccion financiera. La configuracion aportada de SWATM01 usa PKT_VISA
y ISOBASEI.bin; ver `ISOBASEI_REVIEW.md`.

Las fuentes privadas verificadas el 2026-10-08 son:

| Fuente | SHA-256 | Mensajes de red reconstruidos |
| --- | --- | --- |
| CertificacionVcpLite450Diebold.pcap | 903fa9148c1dd12f27f9e6a9e3b14ad300d617ff60bc689600156405d360f314 | 236 mensajes 0800 / codigo 072; ningun 0810 |
| PruebaSimulador.pcap | 31ce4aca7db42c6a61d52438125be3ecc5ec3b93f655a05ba8b33a4a8082b0b8 | 9 mensajes 0800 / codigo 072; ningun 0810 |

La conexion actual desde la PC recibe un 0800 con **codigo 071**. No se
escoge silenciosamente una de las variantes: ambas se reconocen como layouts
observados, pero su significado y politica de respuesta permanecen pendientes.
El usuario indico que no conoce la regla de respuesta al 072. No se presupone
que sean echo, sign-on, sign-off, que deban responderse con 00 ni que completar
un 0810 habilite por si solo el retiro.

## Layout acotado observado

La envolvente `CapturedVisaFraming` separa dos bytes BE16 de longitud del cuerpo
y dos bytes de extension. Los mensajes de red recibidos tienen extension 2020,
cuerpo de 56 bytes y cabecera de negocio de 22. Esta cabecera contiene una
longitud total BE16 en offsets 3-4 que coincide con 56.

| Offset en el cuerpo | Elemento | Representacion observada |
| --- | --- | --- |
| 5-7 / 8-10 | VHDESID / VHSRCID | Dos identificadores opacos de tres bytes |
| 22-23 | MTI 0800 | BCD |
| 24-39 | Bitmap de campos 7, 11, 63, 70 | Binario de 128 bits |
| 40-44 | F7 | BCD, diez digitos |
| 45-47 | F11 STAN | BCD, seis digitos |
| 48 | Longitud de F63 | Un byte, valor observado 5 |
| 49-53 | F63 | Cinco bytes opacos, no publicados |
| 54-55 | F70 | BCD observado 0071 o 0072 |

No se extrapola este prefijo de F63 a otros mensajes/campos ni se define una
pagina EBCDIC general. El inspector rechaza otro bitmap, tamano, longitud,
MTI, codigo de gestion o nibbles invalidos en F7/F11.

Se inspecciono estaticamente `Extreme.Switch2013PCI.dll`, SHA-256
2baf38d1f0a3dd2e61f857d9525f14fa741e6237af44bb0e5f65117c730fda96.
`SwitchIso.GenerarResponse` usa CopyFields(810, ...) para TipoMensaje 800,
intercambia los campos de cabecera 4/5 (destino/origen) y asigna F39 desde
EntityRes.NetResponse. **No fija 00**. La DLL no se carga ni ejecuta.
ISOBASEI define F39 EBCDIC de dos posiciones y permite F7/F11/F39/F63/F70
en el MTI 0810; no aporta la seleccion de NetResponse.

`VisaNetworkManagement.reply` construye offline ese layout de 0810 con codigo
decimal de dos caracteres obligatorio, sin default. Conserva F7/F11/F63/F70,
intercambia destino/origen, agrega F39 con digitos EBCDIC F0-F9, actualiza bitmap
y longitud a 58. La extension de transporte permanece separada del codec.
No hay politica automatica, socket de respuesta ni llamada desde Renderer/IPC.
Esta implementacion mecanica no certifica una respuesta valida para el enlace.

## Diagnostico repetible

`QaNetworkProbePort` tiene un adaptador TCP fuera del Renderer que solo conecta
y observa. Rechaza ambientes distintos de QA y entradas invalidas antes de
abrir el socket. Tiene plazo maximo de 30000 ms y limite de 4096 bytes; son
limites tecnicos del diagnostico, no timeouts del proveedor. Termina al recibir
un frame, denegacion, cierre, error o plazo. No escribe, reintenta ni reconecta.

```powershell
node tooling/probe-visa-network.mjs 10.60.0.11 16100 artifacts/qa-current-switch-network.json
```

El CLI observa hasta 8000 ms y guarda metadatos exclusivamente bajo artifacts.
Devuelve UUID/UTC, direccion/puerto local, cantidad recibida, integridad del
framing, MTI, STAN, codigo de gestion y numeros de campos. No publica cabecera,
F63, PAN, Track 2, PIN o contenido recibido. Borra los buffers al terminar;
errores del driver se reducen a codigos fijos.

Prueba QA del 2026-10-08 a las **17:12:32.195 UTC / 12:12:32 Ecuador**:

- runId b856eeea-40f0-4522-bbbf-b53409d46f2e.
- PC 10.10.10.21:63511 -> SmartVista 10.60.0.11:16100.
- NETWORK_MANAGEMENT_RECEIVED, 60 bytes, framing completo.
- MTI 0800, F70 071, STAN 481360, campos 7/11/63/70.
- writeAttempted=false, bytesWritten=0. No 0810 ni retiro enviados.

La prueba anterior del nuevo inspector rechazo el codigo 071 porque se habia
limitado al 072 historico; la revision estructural separada identifico el cambio
y se agrego esa variante junto con pruebas. Esto no era otro fallo de conexion.
La recepcion actual supera el rechazo textual historico, pero no confirma el
PID asociado, estado operativo de la sesion ni llegada a Mediator/Core.

## Logs posteriores que confirman el PID

El usuario entrega nuevas versiones de tcpcomms01.out y nwint00_22150.out.
Se inspeccionan en lectura; sus textos no se ejecutan como instrucciones.
Los hashes son cb4ee444635877c688583550d4275eb0d07156fc4336f47039c88c4eac84864b
y f14ecf93c4eb02f5a47a0cc17d981109ed5d5720c5a58a92056e2123071a3990,
respectivamente. El primero cubre 12:00:02-12:26:20, el segundo
12:00:02-12:12:32 del 2026-10-08, hora local declarada en el log. Esa hora
coincide con los intentos de Ecuador registrados en UTC por el cliente.

La evidencia resuelve la asociacion de la PC con el PID:

| Fuente/linea | Evidencia del intento 12:12:32 |
| --- | --- |
| tcpcomms01:64128 / 64136 | Acepta 10.10.10.21:63511; Device 80131 is authorized |
| tcpcomms01:64172 | Incorpora 80131 / fd 82 a dispositivos activos |
| nwint:2502 / 2506 | Recibe COMMS_STARTUP y registra NE_LINE_UP |
| nwint:2765 | Estado literal NETWORK ONLINE / NETWORK LINE UP |
| nwint:3038 / 3064 / 3119 | STAN 481360, netmanage 71, F70 0071 |
| tcpcomms01:64244 / 64259 | Envia MTI 800, cuerpo 56, envolvente 60 bytes al fd 82 |
| nwint:2772 / 3160 | Timeout Value ID 5 / PID 80131 = 30; inicia timer 40481360 por 30 segundos |
| tcpcomms01:64306-64310 | recv devuelve 0: disconnect occurred, no error; luego informa Failed to read the message format code |
| nwint:3350 / 3357 / 3388 | COMMS_SHUTDOWN, NE_LINE_DOWN y cancelacion de timers SIGN ON/OFF |

Los otros intentos 12:10:55 / puerto 57622 y 12:11:28 / puerto 63482
tambien fueron autorizados como 80131 (tcpcomms01:54894 / 57546).
El diagnostico del cliente destruye el socket al recibir el primer frame y
registraba cero bytes escritos. La secuencia del servidor es coherente con
ese cierre local, aproximadamente 0.2 segundos despues del envio. No es
evidencia de una trama mal formada ni de vencimiento del timer de 30 segundos.
El estado LINE UP no se convierte en aprobacion o certificacion de sesion
financiera; el log no aporta F39 para responder al 071.

nwint contiene tres secuencias de tipos internos 898 / 800 / 899; no contiene
un 0810 ni un request financiero 0200 en esos intentos. El 0800 se genera en
SmartVista tras COMMS_STARTUP: no es un retiro enviado por el simulador.

La configuracion actual rechaza al balanceador 172.60.60.171 en 16100: **713**
eventos de direccion invalida entre 12:00:02.261728 y 12:26:20.275182
(tcpcomms01:53 / 133645). La PC esta admitida, pero no queda demostrada
coexistencia con el camino del cajero. Antes de pruebas simultaneas se requiere
configuracion de interfaz de prueba aprobada; al terminar la sustitucion temporal
se debe restablecer el remoto original para recuperar ese camino. No se modifica
la configuracion del servidor desde esta revision ni se abre otra conexion.

Reporte privado acotado: artifacts/qa-80131-session-confirmation.json. La
asociacion se actualiza tambien en los planes privados de CB 205; siguen sin
confirmacion financiera ni respuesta automatica habilitada.

## TODO-DATA dependientes

- **VISA-NETWORK-RESPONSE-POLICY**: significado de F70 071/072, si cada solicitud
  requiere respuesta, F39 esperado, iniciador, repeticion y criterio de sesion
  habilitada. Hace falta configuracion/especificacion del enlace o una captura
  completa del intercambio de una sesion autorizada que muestre ese caso.
  Bloquea solo la respuesta automatica y el veredicto de sesion lista.
- **VISA-NETWORK-RESPONSE-WIRE**: contrastar 0810 construido y extension de
  transporte con un par real. Las capturas actuales no contienen ese par.
- **SWITCH-ATM-ACCESS**: PID 80131 y autorizacion de la PC confirmados por los
  logs posteriores. Falta estado de sesion financiera y coexistencia con el
  balanceador, actualmente rechazado. No modificar el PID activo sin su
  configuracion de prueba.
- **CB-ATM-GOLDEN-SAMPLE**: request ATM/response de CB 205 / PID 82052 y reglas
  dinamicas de retiro. El USD 20 de PID 82032 sigue apartado. Comunicacion de
  red y resultado financiero se validan de forma separada.

La generacion de respuesta tiene pruebas unitarias de layout/correlacion,
privacidad y entradas invalidas. La integracion sintetica prueba framing,
fragmentacion/concatenacion, 071/072, denegacion, mensaje no soportado, limite,
timeout y dependencia no disponible; comprueba que el probe no transmite bytes.
Los codigos de las pruebas son datos sinteticos, no reglas aprobadas para QA.
