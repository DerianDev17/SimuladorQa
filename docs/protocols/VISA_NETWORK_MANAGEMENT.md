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

## TODO-DATA dependientes

- **VISA-NETWORK-RESPONSE-POLICY**: significado de F70 071/072, si cada solicitud
  requiere respuesta, F39 esperado, iniciador, repeticion y criterio de sesion
  habilitada. Hace falta configuracion/especificacion del enlace o una captura
  completa del intercambio de una sesion autorizada que muestre ese caso.
  Bloquea solo la respuesta automatica y el veredicto de sesion lista.
- **VISA-NETWORK-RESPONSE-WIRE**: contrastar 0810 construido y extension de
  transporte con un par real. Las capturas actuales no contienen ese par.
- **SWITCH-ATM-ACCESS**: confirmar PID asociado a la PC y coexistencia con el
  balanceador; ahora llega gestion de red y no persiste evidencia actual de
  NO AUTHORIZATION. No modificar el PID activo sin su configuracion de prueba.
- **CB-ATM-GOLDEN-SAMPLE**: request ATM/response de CB 205 / PID 82052 y reglas
  dinamicas de retiro. El USD 20 de PID 82032 sigue apartado. Comunicacion de
  red y resultado financiero se validan de forma separada.

La generacion de respuesta tiene pruebas unitarias de layout/correlacion,
privacidad y entradas invalidas. La integracion sintetica prueba framing,
fragmentacion/concatenacion, 071/072, denegacion, mensaje no soportado, limite,
timeout y dependencia no disponible; comprueba que el probe no transmite bytes.
Los codigos de las pruebas son datos sinteticos, no reglas aprobadas para QA.
