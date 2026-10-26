# Motor de consulta de saldo CB en QA

## Estado entregado

### Consulta aprobada despues de incorporar 5F34, 2026-10-16

El usuario confirma aprobacion y el diario registra ATM20521/STAN 900110,
RRN 628900900110, requestId 249d14f7-8124-4c31-9905-4fedbf7276a6,
runId f786ea6e-21b0-4632-b189-d1eec79b9aba y transactionId
efadc78a-c9d8-469d-9ff7-0561bab65b48. Inicio 2026-10-16T21:07:14.435Z,
fin 21:07:27.983Z; 451 bytes, transporte 1271 ms, APPROVED/00.
El intento anterior 900109 recibio 91, sin aprobacion; no se reescribe.

Se completa la validacion financiera posterior a F35/5F34 para consulta.
No se afirma una revision directa de logs Crypto/Core de 900110. El error
historico de serializacion 57 / `5 ` sigue como pendiente independiente.
La solicitud posterior de retiro requiere un motor propio y validar el
conflicto EMV de su captura; ver [retiro](../transactions/WITHDRAWAL.md).
Reporte sanitizado: artifacts/qa-withdrawal-readiness-20261016.json.

### SRVPIN 900108: ARQC rechazado y secuencia de chip, 2026-10-16

La consulta nueva del usuario confirma el arreglo F44: el diario registra
NOT_APPROVED/96, STAN 900108, RRN 628900900108, runId
d06a8fc3-908f-4c42-8075-cf034e784c52. El adjunto SRVPIN pasa PIN/tarjeta,
rechaza ARQC y produce 57; los extractos PROXY ya contienen `5 `.

Se corrige una omision comprobada: 5F34 faltaba en F55 y el validador usaba
00 porque F23 no llega a SRVPIN. El proveedor ahora incluye siempre la
secuencia leida del chip, con la misma fuente de F23, sin valor fijo ni
modificacion del archivo de perfil. La captura aprobada lleva 5F34=01;
NWINT 900107 conserva F23=001. No se cambia PIN, claves, TVR/CVM o versiones.

La correccion local necesita validacion ARQC en una nueva consulta; no se
declara aprobacion a partir de las pruebas. El cambio de 57 a `5 ` requiere
revision de la serializacion/flujo del servidor y se conserva como pendiente
separado. No se extrapola ARQC de 900108 a 900107 sin su SRVPIN correspondiente.
Ver [fuentes y pruebas](../protocols/QA_SWITCH_LOGS_20261016.md).

Validacion: 723 pruebas aprobadas en 47 archivos, lint y typecheck correctos.
Incluye toda la suite unitaria y las integraciones de proveedor, perfiles,
saldo, TCP y lectura de tarjeta. Evidencia sanitizada y comprobaciones finales
en artifacts/qa-900108-arqc-review-20261016.json.

### Consulta posterior al arreglo de F35: 939/96, 2026-10-16

El usuario envia desde `npm run dev` la consulta STAN 900107, terminal
ATM20521. El diario local confirma requestId 7e5dd26d-12cb-44f0-baa0-fc97deb8b5cd,
runId 6ec1a36d-76c5-44ad-ac17-e10fdf09bbd7 y transactionId
0bbd5588-4c52-4ae8-bcbf-5331d7eb9c11. Inicio 2026-10-16T18:20:53.337Z,
fin 18:21:09.185Z: 447 bytes enviados, transporte 1774 ms, duracion total
15848 ms. Resultado local INVALID_RESPONSE, responseCode null.

La consulta de solo lectura al portal SmartVista QA identifica
UTRNNO 262891821077305370, 16/10/2026 13:21:07 Ecuador, ATM20521/STAN
900107, institucion emisora 8205 (Cooperativa Cacpe Biblian) y respuesta
939 (No such response code from network), codigo de Red/Host 96.
History muestra esta secuencia, con horas de fuente en Ecuador:

| Hora | PID | Respuesta interna | Auth entity resp |
| --- | --- | --- | --- |
| 13:21:07.770 | 999 | 802 (Issuer Inoperative) | vacio |
| 13:21:09.160 | 82052 | 939 (No such response code from network) | 5 |
| 13:21:09.190 | 80131 | 939 (No such response code from network) | 96 |

El archivo 202610161400.tar.gz recibido despues contiene NWINT completo.
Confirma que F39 desde 82052 es literalmente `5 `, con espacio final, y que
la busqueda para nwind 28 falla por ausencia de correspondencia en
FROM_NTWK_RESP_TAB. No demuestra aprobacion, un error de PIN ni que deba
normalizarse a `05`. Tras el fallo de PID 999, NWINT selecciona 82052 como
reemplazo temporal y recibe su respuesta. Ver
[fuente, hashes y lineas](../protocols/QA_SWITCH_LOGS_20261016.md).

El RRN local es 628900900107; la referencia del recorrido interno es
628918900107. NWINT confirma que el F37 final restaura 628900900107. La
respuesta de 157 bytes coincide en STAN, RRN, terminal, procesamiento y moneda.
La causa local de INVALID_RESPONSE es F44, presente en ese cuerpo pero ausente
de la lista de campos admitidos del parser. ISOBASEI lo define como EBCDIC
variable de maximo 25; el log confirma prefijo binario de un byte y longitud 5.
Se admite F44 opcional sin proyectar su contenido ni modificar la correlacion.
El mismo cuerpo original, analizado en memoria, falla con el parser anterior
y pasa con el corregido como 0210/96 sin saldos. El diario historico no se
reescribe; el cambio aplica a respuestas recibidas por la version corregida.

El panel ISO8583 Messages muestra Sin datos. Mostrar registros falla con
`AttendantClientHolder hasn't been initialized properly`, sin archivos.
El log PROXY20520261016.txt en el recurso administrativo conocido tampoco
resulta accesible desde esta estacion. No se ejecutan nuevos SELECT ni se
reutilizan las excepciones TLS consumidas.

TODO-DATA QA-RC939-900107: PROXY recibido despues confirma el literal `5 `;
falta SRVPIN de ese intento para determinar su causa especifica. El nuevo
adjunto SRVPIN es de 900108. NWINT y PROXY no se vuelven a solicitar.
Resuelto TODO-DATA QA-INVALID-RESPONSE-900107 con soporte local F44 respaldado
por diccionario y respuesta real. El tar esta truncado antes del contenido de
tcpcomms; NWINT completo basta para demostrar este defecto local.
QA-F35-FIX-HOST-VALIDATION tiene avance verificable (otro rechazo y emisor
identificado), pero la aprobacion financiera sigue pendiente.

El aviso `net/disk_cache` de Electron es de la cache HTTP local del Renderer;
el transporte financiero usa node:net en Main. Se desactiva esa cache solo
en desarrollo, antes de `ready`, sin borrar AppData. Ver
[arranque y cache](BOOTSTRAP.md). Esta revision no envia otra transaccion
ni modifica configuraciones del Switch, Mediator o Core.
Las pruebas sinteticas reproducen cinco fallos antes del arreglo y pasan
despues; incluyen 0210/96 de 157 bytes fragmentado por TCP local, aprobacion
con F54, limites/truncamiento F44 y rechazo de campos no admitidos.
Validacion final: 708 pruebas aprobadas en 46 archivos (toda la suite unitaria
y las integraciones de codec, transporte, servicio y proveedor de saldo),
lint y typecheck correctos. Comprobaciones de seguridad, formato y build
se registran en el reporte de esta revision.
Evidencia sanitizada: artifacts/qa-900107-resolution-20261016.json;
la revision anterior del portal se conserva en qa-900107-host-review-20261016.json.

### Rechazo 19 correlacionado y correccion de F35, 2026-10-16

Los dos intentos comunicados por el usuario si fueron transmitidos. El diario
local registra 447 bytes por intento y respuesta 0210/19. La consulta de solo
lectura al portal SmartVista QA, filtrada por ATM20521, fecha y STAN, confirma:

| STAN | RRN | UTRNNO | Hora del host (Ecuador, 2026-10-15) | Respuesta interna / externa |
| --- | --- | --- | --- | --- |
| 900105 | 628800900105 | 262882257483118950 | 17:57:48 | 880 / 19 |
| 900106 | 628800900106 | 262882258532152760 | 17:58:53 | 880 (BAD_TRK2) / 19 |

La segunda corresponde a transactionId b20d47f8-4ddb-443c-9d53-2a7af7851967,
runId 2bd22528-05b9-4c0c-b0a9-b41ff8e0dc9a y requestId
24ecd4cf-4b60-4a10-9a98-6d1d9a5cea11. Transporte 264 ms; duracion total
13642 ms, incluida preparacion. La primera registra transporte de 262 ms.
La correlacion resuelve el motivo de estos dos rechazos; no establece un
significado universal de F39=19 ni resuelve los intentos 900102-900104.

Se identifica un defecto en QaBalanceExecutionProvider: eliminaba el nibble
F final de tag 57 para contar los digitos, pero copiaba los bytes originales
del chip a F35. La muestra aprobada, frame 218 de PruebaSimulador.pcap,
declara 37 digitos y empaqueta BCD con un nibble 0 inicial. Copiar el F final
desplaza la interpretacion del PAN, separador y resto del Track 2 en ese codec.
El proveedor ahora reconstruye F35 desde los digitos validados: prefijo
binario, relleno 0 a la izquierda solo para longitud impar, sin relleno para
longitud par. Conserva tag 57 original y borra F35 al liberar el contexto.

La captura aprobada contiene el mismo TVR 8080800000 y CVM 3F0001 reportados
por el usuario; esos valores no demuestran la causa de BAD_TRK2. No se cambian
versiones/capacidades EMV, fecha contable, PIN, claves ni rutas del host.
Ver [evidencia del codec](../protocols/CB_205_BALANCE_SAMPLE.md).

Pruebas de regresion con tarjeta sintetica reproducen el defecto antes del
cambio (unidad y trama TCP local). Cubren longitudes par/impar, datos invalidos,
limpieza de memoria y recorrido PIN/EMV/ISO/TCP. No se envia una consulta QA
nueva, ni se consume una reserva real; el perfil conserva 998 al inspeccionarlo.
Validacion final: 698 pruebas aprobadas en 45 archivos (toda la suite unitaria
y las integraciones del proveedor, saldo y transporte); lint, typecheck,
check:security y build correctos. El paquete dist queda recompilado para la
siguiente apertura del simulador. Evidencia sanitizada:
artifacts/qa-track2-fix-20261016.json.
TODO-DATA QA-F35-FIX-HOST-VALIDATION: correlacionar una nueva consulta con
PIN/EMV nuevos y STAN reservado para comprobar el resultado del host despues
del arreglo. La correccion local no demuestra aun aprobacion financiera.

### Reservas repuestas con autorizacion, 2026-10-15T22:41:47Z

Resuelto QA-SEQUENCE-POOL-REPLENISHMENT para ATM20521: el usuario autoriza
verificar y asignar 900105-901104 exclusivamente a esta estacion. Los tres
SELECT de ADR-015 confirman lote/fecha compatibles y cero registros del rango.
Electron Main carga las 1000 reservas con lock, respaldo, reemplazo atomico
y comprobacion del parser/proveedor real. QA-SEQUENCE-POOL desaparece; queda
QA-CARD-SESSION tras el reinicio y se requiere lectura manual de tarjeta.

El historial conserva las mismas cinco entradas y su hash. No se envia
ninguna transaccion ni se modifica SQL. La entrada temporal se retira y el
codigo de Main recupera su hash original. No hay reposicion automatica ni
reciclaje de secuencias. La excepcion SQL queda consumida. Ver
[ADR-015](../adr/ADR-015-QA-SEQUENCE-POOL-REPLENISHMENT.md).

### Bloqueo por reservas agotadas, 2026-10-15T22:15:34Z

El usuario reporta la solicitud aa348124-ebe0-45e3-a086-f7089b300e46,
runId 20d18cc6-089d-4656-8462-0fe1ac5c382b y transactionId
134375c0-13e8-4212-a660-1f362213480a, a las 17:12:50 America/Guayaquil.
La pantalla informa QA-SEQUENCE-POOL y transporte de 0 ms. La lectura local
confirma ATM20521 con reservedSequences vacio, sin lock ni copia virtual activa
del perfil. El diario conserva cinco entradas; la ultima transmitida uso
900104. La solicitud bloqueada no figura en ese diario, conforme al
comportamiento existente de los bloqueos previos a la preparacion.

TODO-DATA QA-SEQUENCE-POOL-REPLENISHMENT: validar y asignar un nuevo pool
exclusivo de esta estacion. Se prepara como propuesta el rango 900105-901104
(1000 reservas, limite admitido por el parser), sin asignarlo ni asumir que
esta libre. La comprobacion parametrizada consta de tres SELECT: lote abierto
en ATMDayClose, serial actual en ATMTCS y COUNT_BIG de MDT_Journal para la
entidad 205/ATM20521 y ese rango. No modifica SQL ni el serial del ATM.

La conexion con TLS estricto falla antes de ejecutar consultas por
CERTIFICATE_CHAIN_UNTRUSTED. ADR-014 esta consumido y no autoriza otra
excepcion. Quedan pendientes la autorizacion puntual de esta nueva inspeccion
y la asignacion exclusiva del rango propuesto. Solo si la evidencia confirma
ausencia de uso/conflictos y calendario compatible se podra reponer el archivo
local con lock, respaldo y verificacion desde el contexto real de Electron,
evitando la virtualizacion de AppData ya documentada. No se reutiliza 900104.

Evidencia privada: artifacts/sequence-pool-inspection-6b56c5af-8c1d-43e9-8151-2d4d976411be.json.
Script preparado: artifacts/check-sequence-pool-20261015.ps1; TLS estricto por
defecto, sin fallback ni reintentos. No se cambia codigo de la app, no se
reinicia la instancia y no se solicita PIN ni se envia otra transaccion.

### Consulta desde la instancia Electron, 2026-10-15T21:23:31Z

El usuario solicita resolver los bloqueos y enviar una TRX. Autoriza una vez
los tres SELECT cifrados sin validacion del certificado SQL, con el alcance
documentado en ADR-014. Se confirman lote 31 abierto, fecha 2026-08-17,
serial actual 7973 y cero coincidencias del candidato 900104 en Mediator.
Se reserva exclusivamente ese serial para esta estacion QA, sin escrituras
SQL ni actualizacion del contador del cajero fisico.

La primera preparacion se detiene antes de PIN/EMV/envio porque una escritura
desde la herramienta vuelve a crear una copia virtual de AppData. Electron
Main confirma pool vacio. La reserva se recupera desde Main con backup y
verificacion SHA-256; la copia virtual activa se mueve a respaldo. Este
comportamiento demuestra que la migracion anterior no desactiva la
virtualizacion de escrituras posteriores desde herramientas empaquetadas.

Una entrada puntual llama al DesktopApplication de la misma instancia, con
sus servicios/diario y una referencia exclusiva, sin controlar la interfaz:

- ATM20521, QA/local/saldo/ahorros, destino 10.60.0.11:16100.
- Inicio 2026-10-15T21:23:18.431Z; fin 2026-10-15T21:23:31.115Z.
- PIN por ventana nativa y primera AC nueva del chip.
- STAN 900104, RRN 628800900104; 447 bytes; transporte 283 ms.
- Respuesta correlacionada 0210/19: NOT_APPROVED, sin saldos.
- runId f2f3bd52-a519-40bb-8bf0-f0d6e6c2a524.
- transactionId 88df29d7-b26b-4d74-92c0-2b09386b72a2.
- requestId 83fca633-801f-4d60-9e34-1871beaf7dca.

El diario real de la app conserva cinco entradas y el pool queda en cero.
La entrada temporal se retira despues de finalizar; index.ts coincide por
SHA-256 con su contenido anterior. No queda envio automatico al iniciar.
Typecheck correcto; no se ejecutan suites automatizadas. La excepcion SQL
queda consumida y no modifica el observador ni su validacion TLS.

TODO-DATA QA-RC19-900104: obtener el motivo interno de SmartVista correlacionado
con esas referencias y hora. El codigo 19 no identifica por si solo la causa.
Las versiones EMV 008C/00A0, TVR 8080800000 y CVM 3F0001 son diagnosticos,
no prueba de que alguna diferencia cause el rechazo. No hay reintento.

Evidencias privadas: artifacts/requested-balance-900104-20261015-execution-result.json,
artifacts/sequence-900104-main-provision-20261015.json y
artifacts/requested-balance-900104-20261015-main-inspection.json.

### Consulta nueva solicitada el 2026-10-15

La ejecucion solicitada usa los mismos DesktopApplication, proveedor, servicio,
transporte y diario que la app, desde una entrada puntual sin control de UI.
Comprueba que Electron no este activo, conserva un marcador exclusivo para
impedir repetir la entrada y no usa capturas ni reintentos. PIN ingresado por
el usuario en la ventana nativa y primera AC nueva de la tarjeta.

- ATM20521, QA/local/saldo/ahorros, destino guardado 10.60.0.11:16100.
- Inicio 2026-10-15T18:51:45.395Z; fin 2026-10-15T18:52:05.807Z.
- STAN 900103, RRN 628800900103; 447 bytes; transporte 270 ms.
- Respuesta correlacionada 0210/19: NOT_APPROVED, sin saldos.
- runId 33f2b5ea-09a5-4fae-a219-307b79eb1c57.
- transactionId 258df6f2-bc97-494f-ad75-9985061bd495.
- Diagnostico publico: fecha contable 2026-08-17, version terminal 008C,
  version chip 00A0, TVR 8080800000, CVM 3F0001.

El pool queda en cero. Se conserva el registro normal del diario y un resumen
sanitizado en artifacts/fresh-balance-20261015-result.json. No se persisten
PIN, PIN Block, PAN, Track 2 ni criptogramas en estos resultados.
TODO-DATA QA-RC19-900103 requiere el motivo interno del host; no se atribuye
el rechazo a las diferencias EMV solo por coincidir en la misma ejecucion.

Las capturas recibidas documentan PID 80131, formatter VISA Coonecta,
TCP01/local 16100, REMOTE initiator, VSMS_USE_ACCTP=1 y forwarding ID 450724.
La direccion remota de ese nodo no sustituye el destino QA del simulador.
La etiqueta PRODUCTION MODE de la pantalla no cambia el ambiente permitido.
El bloque protegido de Device keys no se convierte en clave local; permanece
la referencia DPAPI TEST ya validada contra la captura aprobada.

Se corrige getBalanceReadiness para preservar sequencesRemaining al devolver
el estado a la UI: el proveedor lo calculaba, pero la fachada lo descartaba.
Typecheck y compilacion Main correctos. No se ejecutan pruebas ni se abre,
reinicia o controla la interfaz. Solo se realiza la consulta pedida.

Actualizacion 2026-10-15: un resultado APPROVED o NOT_APPROVED con respuesta y
fecha de fin libera la referencia de envio del formulario. Conserva el resultado
y actividad, limpia la seleccion consumida y requiere lectura manual para una
consulta nueva. No solicita recuperar un resultado ya confirmado. Timeout,
PENDING y STORAGE_ERROR siguen conservando su referencia y no se reenvian.

El proveedor informa sequencesRemaining sin consumir reservas durante la
consulta de disponibilidad. La UI lo muestra sin exigir revision manual;
avisa cuando queda una o ninguna. No se crean secuencias ni se reciclan valores.

Las nuevas ejecuciones pueden persistir diagnostics: UUID de perfil, fecha
contable, versiones de aplicacion del terminal/chip, TVR y resultado CVM. Se
valida una lista cerrada de propiedades, sin PIN, PIN Block, IAD, ARQC ni RAW.
El diario sigue leyendo registros anteriores sin diagnosticos. La UI distingue
duracion del transporte de tiempo total con preparacion. Un rechazo conserva
el codigo original y explica que el motivo interno requiere correlacion.

Evidencia anterior a estos cambios: el 2026-10-15T14:46:31.395Z se registro
NOT_APPROVED/F39=19 para ATM20521, STAN 900102, RRN 628800900102, 447 bytes,
551 ms de transporte. No hubo otra transaccion en esta entrega. Ese registro
no incluye diagnostico EMV y no se completa retrospectivamente por inferencia.
TODO-DATA QA-RC19-900102: falta motivo interno/mapeo correlacionado del host.
TODO-DATA QA-EMV-VERSION-CVM-BINDING: contrastar el perfil 008C con el 00A0
leido y la seleccion CVM de esta consulta con evidencia aprobada del terminal.
No se cambian capacidades, CVM, version ni fecha contable por suposicion.

Se escriben regresiones para respuesta final, entrega incierta, diagnosticos
protegidos y compatibilidad del diario. Typecheck y build completan sin errores;
son comprobaciones de compilacion, sin ejecutar la aplicacion. No se ejecutan
pruebas por instruccion del usuario; la instancia abierta no se controla ni se
reinicia. La aprobacion financiera del host sigue pendiente.

Correccion de bloqueos del 2026-10-14:

- Un error devuelto por Main antes de iniciar la ejecucion libera la referencia
  de la UI. Antes quedaba bloqueada esperando un registro que no existia.
  Un timeout o rechazo del puente IPC conserva la referencia: no demuestra
  que Main haya detenido la operacion.
- CONTEXT_ERROR (incluida cancelacion/timeout de PIN) y fallos de conexion
  confirmados sin intento de transmision ni bytes permiten otro clic explicito.
  Se conserva el resultado en actividad y se crea un requestId nuevo. La misma
  referencia en Main sigue siendo idempotente; no se ejecuta de nuevo.
- Editar cuenta, tarjeta o formulario no elimina una referencia con entrega
  incierta, incluida RESPONSE_TIMEOUT. Se mantiene disponible su recuperacion.
- Los fallos de PIN, lector, perfil de tarjeta, reserva y EMV muestran mensajes
  fijos por etapa. Los errores originales de dependencias no llegan a UI/logs.

Diagnostico local en lectura: los dos intentos del 2026-10-14 registrados a
19:56 y 20:02 UTC terminaron en CONTEXT_ERROR, sin trama, intento de transmision
ni bytes. El mensaje generico anterior no permite atribuirles una causa mas
precisa. No se repiten contra QA para diagnosticar ni se generan AC reales.

Validacion de esta correccion: 661 pruebas unitarias, 143 de integracion y
9 E2E enfocadas en envio/seleccion pasan. Tras el ultimo ajuste de diagnosticos
y clasificacion de entrega se repiten 70 pruebas del modulo, todas correctas.
Lint, typecheck, build, control de secretos, formato de los archivos de codigo
modificados y git diff --check correctos. Las ejecuciones de prueba usan
IPC/lector/cifrado sinteticos o un servidor TCP local; no el host QA.

Actualizacion 2026-10-14: Enviar transaccion acepta directamente la seleccion
QA/local/saldo/ahorros, ATM y tarjeta vigentes, y destino/plazos guardados.
No exige pulsar Revisar transaccion ni obtener ready=true en Renderer primero.
Main ejecuta las mismas validaciones de perfil, tarjeta, cifrado y contexto
antes de solicitar PIN o construir/transmitir la trama. Esto simplifica el
intento; no hace compatibles llaves distintas ni convierte un bloqueo en envio.
Una respuesta BLOCKED sin trama ni bytes deja intentar de nuevo y muestra
su causa, sin ofrecer recuperar un registro inexistente. Un timeout/resultado
incierto conserva requestId y bloquea otro envio, incluso despues de editar.
La revision documental sigue disponible como accion opcional.

Entrega posterior 2026-10-13: se conecta un proveedor concreto por ATM para
lectura vigente -> ventana PIN nativa -> cifrado TEST Windows/DPAPI -> primera
AC nueva -> builder -> TCP. Main carga perfiles privados aprobados al iniciar;
su ausencia ya no se describe como codigo del proveedor sin implementar.
Pruebas de contexto, cifrado real con clave sintetica y recorrido TCP local
estan implementadas. No hubo envio financiero QA ni activacion automatica de
claves/capturas. Alcance acotado, configuracion y TODO-DATA restantes:
[QA_PIN_EXECUTION.md](QA_PIN_EXECUTION.md), ADR-013. Los apartados siguientes
conservan evidencia historica de etapas anteriores.

Revision de fuentes 2026-10-13: la configuracion aportada no se considera
ausente por ready=false. Index instancia el servicio sin proveedor; ese
resultado diagnostica wiring local, no estado del HSM. La DLL canonica
MsgFormatDotNet incluye Des.EncrytPinToZone -> CCrypto2.EncryptPinToZone,
funcion originadora de cifrado ya recibida. Falta su integracion local,
procesamiento transaccional del chip y vinculacion de contexto por operacion.
Se corrigen mensajes para distinguir esos pendientes de datos/configuracion
ya entregados. Ver PROVIDED_CONFIGURATION_AUDIT.md para fuentes y limites.

Avance 2026-10-13: parametros de Registro recibidos 9F33=604020, 9F35=14,
9F40=EF80B05010; TAC_DENIAL no encontrado. Parser Main y analisis online-only
implementados con reglas EMV Book 3 10.7 y Book 4 anexo A. Se leen IAC del
chip y se conserva rechazo del emisor aunque TAC-Denial este ausente.
Revision local 348fa7c9-b125-44dc-a5cf-8d9be1dcbcf8, sin cambios en
cajero/SQL/Registro. La decision ARQC/AAC no ejecuta GENERATE AC ni calcula
TVR/CVM. Prueba fisica 11:17 Ecuador: tarjeta no presente, cero APDU/envios.
No volver a pedir estos parametros. Detalle en EMV_TERMINAL_PARAMETERS.md.

Busqueda de Registro recibida el 2026-10-13 resuelve la raiz del componente:
HKLM/SOFTWARE/Wincor Nixdorf/ProTopas/CurrentVersion/EmvDebitCreditFW con
/reg:32. Texto /reg:64 la muestra bajo SOFTWARE/WOW6432Node. El adjunto
Texto pegado.txt tiene 142 coincidencias: 141 rutas DATADICT y una raiz del
componente, sin lineas de valores de Registro. No interpretar rutas
EMVDEBITCREDITFW_PROP_TAG_9F33/9F35 del diccionario como capacidades/tipo
configurados. No volver a pedir busqueda global ni asumir runtime completo.
La siguiente lectura publica usa la ruta descubierta, con nombres de
subclaves derivados del INA (existencia aun por comprobar):

```bat
set "QA_EMV_ROOT=HKLM\SOFTWARE\Wincor Nixdorf\ProTopas\CurrentVersion\EmvDebitCreditFW"
reg query "%QA_EMV_ROOT%\TERMINAL_PROPERTIES\TAGS" /v 9F33 /reg:32
reg query "%QA_EMV_ROOT%\TERMINAL_PROPERTIES\TAGS" /v 9F35 /reg:32
reg query "%QA_EMV_ROOT%\TERMINAL_PROPERTIES\TAGS" /v 9F40 /reg:32
reg query "%QA_EMV_ROOT%\TERMINAL_PROPERTIES" /v TAC_DENIAL /reg:32
```

Consultas de valores concretos, sin /s ni export/import. Si las subclaves o
valores no existen, registrar ausencia; no heredar valores de DATADICT/NCR
ni declarar capacidad cero. La configuracion recibida y desarrollo del
procesador EMV siguen separados; esta evidencia no origina criptogramas.

Precision de alcance del 2026-10-13: el objetivo es simular el recorrido
transaccional ATM; no requiere recrear todos los dispositivos o instalar el
software Diebold entero. Los archivos INA/BAT y las listas CDOL leidas de 2267
ya constituyen fuentes recibidas. No volver a solicitar "perfil EMV" completo
como si esos entregables faltaran. El procesamiento de TVR/CVM, GENERATE AC y
su integracion con PIN/contexto son trabajo de implementacion pendiente.
Si se necesita reproducir el perfil exacto del ATM fisico, acotar confirmacion
a parametros que no aparecen en el INA: capacidades 9F33, tipo 9F35 y datos
adicionales 9F40/TAC_DENIAL cuando sean requeridos por el perfil seleccionado.
Se buscan en configuracion efectiva del componente EMVDEBITCREDITFW, cuya
ruta fisica se descubre con reg query por nombres en las vistas 32/64. No se
presupone una ruta NCR ni se pide export general del Registro. TVR debe
calcularse a partir de las comprobaciones reales; no pedirlo como valor fijo
ni sustituirlo por TVR capturado. Esto acota solicitudes, sin declarar una
configuracion completa o habilitar envios nuevos.

Seleccion de tarjeta resuelta por el usuario y comprobada fisicamente:
relectura 2026-10-12 18:24 Ecuador, runId
c85c288e-feb7-4dbd-a8ab-f4c425d29946, termina READ con tarjeta 2267,
AID A0000000031010 y CDOL1/CDOL2 leidos de esta tarjeta. No se vuelven a
solicitar esas listas ni seleccion. Esta comprobacion no genera criptograma,
PIN Block ni consulta financiera. Quedan los pendientes de procesamiento
EMV, cifrado PIN TEST y contexto ATM, sin sustituirlos por datos del PCAP.

Avance posterior al rechazo ATC, 2026-10-12 18:14 Ecuador: implementada lectura
de CDOL1/CDOL2 en adaptador PC/SC existente, proyectando solo tags/longitudes.
La prueba de tarjeta real termina READ, runId
d00384a2-3db3-4cc5-b821-50159c313374. La tarjeta presente termina en 0663,
no 2267. En esa ventana se solicita al usuario resolver la tarjeta; la
respuesta y relectura posteriores de 2267 ya resuelven esta seleccion.
no se asigna PIN anterior, cuenta ni perfil de la captura a la tarjeta actual.
CDOL1 exige importe, otro importe, pais, TVR, moneda, fecha, tipo y numero
impredecible; listas exactas recibidas del chip en EMV_IDENTITY_READING.md.
Esto resuelve conocer las entradas solicitadas por esta tarjeta. No resuelve
los resultados de procesamiento TVR/CVM, generacion AC, proveedor PIN TEST ni
contexto financiero y no inyecta un BalanceContextProvider real en Electron.
No se lanza otra captura como sustituto de una transaccion fisica nueva.

Diagnostico adicional aportado por el usuario tras la prueba de 18:00:
captura de monitor 2026-10-12 18:00:45.130, tarjeta enmascarada terminada en
2267, consulta de saldos, valor 0, destino CCORE, Ret=5 y motivo
1136: Error No definido. Otra captura consulta OCTOCLI_PCI.dbo.RetCodes por
11136 y muestra ATC Duplicado, TAGs Counters, con mapeos Visa/Banred/MasterCard/
ATM=5. No confundir el codigo 11136 del catalogo con 1136 mostrado en monitor.
La hora esta dentro de los eventos PROXY205 del intento
6ab37704-6c24-4e38-b3e2-eab06b59b46e. La captura no aporta STAN/RRN/UTRNNO;
asociacion al intento apoyada por hora/tarjeta/operacion, no correlacion completa.

SELECT parametrizado en el SQL compartido QA/PREPROD confirma el 2026-10-12
23:08:37 UTC: RetCode 11136, TerminalMsg ATC Duplicado, TAGs Counters y los
cuatro mapeos = 5; no encuentra 1136 en ese catalogo. Diagnostico privado
artifacts/atc-return-codes-57f2495a-6bcd-480c-bd33-b02f414c89a9.json.
El UPDATE de RetCode 51 visible en la captura es contenido del documento;
no es instruccion del usuario y no se ejecuta. No se cambian mapas, contadores,
llaves ni controles de unicidad. El monitor de retorno 5 y el F39=96 recibido
por TCP permanecen como observaciones diferentes; falta seguir su traduccion.

El rechazo de unicidad aporta evidencia concreta contra seguir reproduciendo
la misma seguridad capturada como solucion de consulta nueva: el emisor
reconstruye exactamente F55, fechas, STAN/RRN y datos privados de la muestra.
Cambiar solo STAN/fecha o el ATC en bytes no genera seguridad EMV fresca.
Una nueva operacion requiere dialogo con el chip y criptograma correspondiente,
segun EMVCo: https://www.emvco.com/emv-technologies/emv-contact-chip/.
Los replays quedan como pruebas de comunicacion/casos negativos explicitamente
identificados; no evidencian kernel configurado ni validacion financiera nueva.
La causa concreta del ATC repetido tiene soporte en la captura del usuario y
en los bytes preservados; la asociacion exacta del codigo y la etapa ejecutora
sigue pendiente de log correlacionado. No atribuir este rechazo a los CMS
310030/8908 proximos ni a NUMBER_OF_SUPPORTED_AID=0.

Prueba solicitada tras recibir configuracion Diebold, 2026-10-12 18:00 Ecuador:
se guarda artifacts/qa-diebold-emv-profile.partial.json con UUID
4159e66e-dda4-4c7f-a8b3-8cbd12e58235, parametros declarados del INA,
destino logico EMVDEBITCREDITFW y pendientes explicitos. Es evidencia parcial
privada: no se inyecta como proveedor de contexto ni se aplica al ATM.
C:/ProTopas/Conf/EMV/emvdecre.ina no existe en esta estacion; la captura del
cajero no implica acceso a su Registro. El cfg de W conserva el hash reparado
0e231d1e993820b4b5049cd5710126593a005654bb0fa71a7ad2cbb595122c1d.
No se ejecutan kconv/ccrcconv ni se cambia un contador AID por inferencia.

Una sola reproduccion exacta de consulta, runId
6ab37704-6c24-4e38-b3e2-eab06b59b46e, transactionId
9423398e-8fc7-4754-b6cb-c90d4b8aa6ea, write 23:00:44.720 UTC
(18:00:44.720 Ecuador): 536 bytes a 10.60.0.11:16100, 0800/071 previo,
respuesta 0210/F39=96, sin F54. Conserva STAN 007923, RRN y seguridad de
la captura; no es una consulta nueva generada con el chip. Reporte privado
artifacts/qa-cb-balance-attempt-6ab37704-6c24-4e38-b3e2-eab06b59b46e.json.
PROXY205 confirma ISOREQUEST a 18:00:45.083 (lineas 26/27) e ISORESPONSE
a 18:00:45.552 (28/29), con coincidencia de STAN y codigo de procesamiento.
La comprobacion SQL posterior no encuentra nuevo 301000 de ATM20521; su
ultimo TraceId exacto sigue siendo 31580488 de 15:31. En la ventana aparecen
31580494/31580495, CMS 310030/canal 21, secuencias 176293/176294 y RetCode 8908;
CBCOOPERAT/ADPROUTER registran WS, PROCESADOR NO RESPONDE. Su vinculacion con
el replay no se prueba por tiempo ni se iguala 8908 a F39=96. No se acredita
consulta de saldo aplicada al Core. SQL se usa exclusivamente en lectura.
Diagnosticos SQL 2a7a0cb3-c962-4f3b-95b8-074e3cf0e0f0 y
c8db1f98-48f4-49ca-b745-c19b485b8541; proyeccion de logs privada en
artifacts/mediator-review/balance-attempt-logs-6ab37704-6c24-4e38-b3e2-eab06b59b46e.json.
Validacion local previa: seis suites, 47 pruebas de codec, motor, TCP y
preparacion PIN pasan. No hay cambios de codigo de produccion en esta prueba;
generacion fisica sigue dependiendo de runtime EMV, proveedor PIN TEST y
reserva/calendario ATM. La configuracion completa no queda habilitada.

Actualizacion de configuracion QA del 2026-10-12: revision directa de W:
confirmada por el usuario, mapeada a 172.60.60.156/e$, frente a Y:
172.60.60.152/e$ (host ATM). El cfg de Mediator difiere del recibido desde Y:
y usa paso 011 ExtremeAuthConectaPCI.CAuth.SendMediator, metodo existente.
La propuesta anterior de cambiar CSendCore.SendMediator no aplica a esa
instalacion y queda descartada para despliegue. No se mezclan los dos perfiles.

En W:/ExtremePCI/SwitchConfig/DebitoConecta_999999.cfg se corrige exclusivamente
OnError del paso 008 ValidarBloqueos, de 0121 (paso inexistente) a 012
NotificarSMS. El flujo previo del host ATM tambien remite esa validacion al
paso de NotificarSMS, y las otras validaciones del flujo Mediator usan 012.
El controlador convierte OnError a indice numerico; la correccion repara esa
referencia sin cambiar el resultado de la validacion ni el paso criptografico.
Aplicacion autorizada por el usuario a las 21:48:07.625 UTC; sustitucion atomica,
hashes/versions comprobados y respaldo fechado completo:
DebitoConecta_999999.cfg_20261012T214806578Z.bak en la misma carpeta W.
SHA-256 anterior 4f98977f8569313fbce62d20caa68dd131d4b76ade89de69cfad6525efb741d8;
posterior 0e231d1e993820b4b5049cd5710126593a005654bb0fa71a7ad2cbb595122c1d.
Todos los metodos y destinos OnError verificados; XML valido y unico atributo
modificado. No se cambian llaves, Registro, bases, endpoints o servicios.

Prueba unica posterior: runId e0e41301-165b-4a34-aca7-e504cb4384e1,
write 21:48:18.738 UTC (16:48:18.738 Ecuador), captura original 301000,
STAN 007923, ATM20521. Respuesta 0210/F39=96 sin F54. PROXY205 registra
ISOREQUEST a las 16:48:19.087 e ISORESPONSE a las 16:48:19.587.
SQL no registra nueva consulta 301000 del ATM; el TraceId financiero exacto
sigue siendo 31580488 de la prueba aprobada anterior. En la ventana hay
CMS 310030/canal 21, TraceId 31580492/31580493, RetCode=8908.
CBCOOPERAT/ADPROUTER los registran con WS, PROCESADOR NO RESPONDE;
no se demuestra su vinculo al replay por proximidad horaria ni se igualan
esos codigos al F39=96. La prueba no acredita que se ejecuto la rama corregida.
El error de referencia queda reparado; el rechazo observado sigue pendiente
de correlacion AUTHTD/UTRNNO/etapa. No se envia otra transaccion automatica.

Reportes privados: artifacts/mediator-review/live-mediator-config.json,
live-error-target-fix-f8646969-052b-4c02-b6ce-796ca58881cb.json,
current-proxy-review.json y current-mediator-logs.json; envio y consultas SQL
referenciados en CB_205_BALANCE_SAMPLE.md. El proveedor nuevo PIN/EMV no
queda habilitado por este arreglo de configuracion del servidor.

El recorrido de ejecucion esta implementado: IPC protegido, disponibilidad,
construccion de campos nuevos, transporte fuera del Renderer, respuesta
correlacionada, parser F54 y diario recuperable. Se verifica con dependencias
sinteticas y TCP loopback. No constituye una consulta fisica aprobada en QA.

El runtime de Electron todavia no inyecta un BalanceContextProvider real.
La tarjeta conectada y su PIN no sustituyen ese proveedor: hacen falta perfil
activo, secuencia/calendario del host y seguridad PIN/EMV generada para esa
operacion. Main devuelve pendientes concretos antes de abrir un socket. No
reutiliza datos privados de PCAP ni crea PIN Block por una regla supuesta.

## Alcance y fuentes

El wire ejecutable esta limitado a CB 205, QA, ahorros, 301000/840 y el conjunto
de campos observado. No habilita PREPROD, corriente, retiros, reversos o PROD.
Las funciones mecanicas de F3 para corriente se prueban offline, pero no
habilitan ese perfil wire.

Fuentes: ISOBASEI/formatter de SWATM01, ArmaMsgIso8583/GetSaldos de la imagen
NCR y muestra CB 007923. Ver [revision de fuentes](../protocols/ISOBASEI_REVIEW.md).
Los campos del calendario llegan explicitamente del proveedor; UTC se usa
para persistencia y aritmetica de dias, sin asumir la zona horaria del wire.

coonecta-balance-rules.ts implementa F3/F4/F7/F11/F12/F13/F15/F37/F41 y F54.
NewVisaBalance recibe una cabecera/perfil y campos privados frescos del proveedor;
construye bitmap, longitud y envolvente, y valida contra el codec recibido.
No acepta un request historico como entrada ni expone bytes por IPC.

LegacyQaPinEncryption implementa la preparacion mecanica PAN/PIN de
ExtremeTools.CryptoTool.AnsiPinEncrypt y delega el cifrado a QaPinCipher.
Solo admite QA, referencias UUID de clave y buffers de digitos; no acepta
claves claras ni expone una API PIN al Renderer. Copia las entradas, conserva
el D2 decimal de la fuente, limpia temporales y salidas del adaptador, limita
el tiempo y cancela/limpia respuestas tardias. El propietario de las entradas
debe limpiar sus propios buffers. Los limites 1..19 digitos PAN y 1..14 PIN
son limites mecanicos locales; no validan un perfil financiero ni politica PIN.
No existe un QaPinCipher real inyectado ni se asume DES/TripleDES por el nombre
del metodo nativo. Este componente se verifica offline con un cifrador sintetico;
no habilita nuevas consultas ni demuestra un PIN Block aceptado por QA.

F54 usa importes de centavos exactos con BigInt y proyeccion decimal string.
Se comprueban ancho, signo C/D, cuenta/moneda y registros ambiguos. Los tipos
01/02/91 se conservan como etiquetas neutrales: falta aprobar su significado
total/disponible por perfil. Una respuesta 00 sin F54 interpretable es invalida;
91/96 se muestran como codigos recibidos y no se convierten en timeouts locales.

## Contratos y ejecucion

- transaction:balance:readiness recibe draft, configurationRevision y cardReadId.
- transaction:balance:execute agrega requestId UUID como clave de idempotencia.
- transaction:balance:result consulta la referencia desde QA.
- transaction:balance:history devuelve las ultimas 50 ejecuciones locales QA.

Claves adicionales, secretos, bytes, ambientes/operaciones no soportados se
rechazan. Main obtiene el endpoint de la evidencia/configuracion vigente y
revalida ATM/entidad activos, revision y Terminal ID. Mientras ejecuta, impide
cambiar ambiente, destino/plazos o catalogos. La referencia de tarjeta sale de
Renderer; el proveedor debe vincularla a su sesion real vigente y perfil aprobado.

BalanceInquiryService depende de BalanceContextProvider, BalanceTransport y
BalanceJournal. El proveedor debe reservar la secuencia y generar seguridad de
TEST, con perfil UUID, caducidad, referencia de tarjeta y endpoint coincidentes.
Acquire tiene plazo tecnico acotado y cancelacion; una entrega tardia se libera.
Buffers privados se limpian al finalizar, incluido el request serializado.

BalanceTcpTransport hace un unico write financiero, con plazos de conexion y
respuesta del operador, framing incremental y limites. Reconoce 0800 071/072
como gestion separada sin contestar 0810; no certifica sesion persistente.
Correlaciona 0210 por STAN/RRN/terminal/procesamiento/moneda. No hay reintentos,
reconexion, reversos o envios automaticos. AFTER_REVIEW conserva su intencion
documental; esta primera ejecucion financiera se inicia manualmente con Enviar.

## Historial y resultados inciertos

balance-executions.json vive en userData. Guarda UUID, UTC, contexto tecnico,
correlacion, resultado, importes proyectados y metricas; no guarda PAN completo,
PIN, PIN Block, EMV, Track o tramas. Usa esquema estricto, lectura acotada de
512 KiB y escritura temporal/rename atomico. Conserva archivos corruptos.

Se guarda PENDING antes del posible write. Tras reinicio, repetir requestId
devuelve ese registro sin volver a enviar. Si falla guardar el resultado, la
UI conserva la referencia y advierte no repetir. Un timeout IPC tampoco cancela
un envio iniciado; Consultar resultado e Historial permiten recuperar evidencia.
Al cerrar Electron, Main deja de aceptar IPC, detiene la carga y espera hasta
120 segundos para que las operaciones financieras y sus escrituras terminen antes
de liberar lector y diario. Si la dependencia no termina, el proceso sale y el
registro `PENDING` conserva la entrega como incierta; no hay reenvio automatico.
Los IDs de revision/plan documental son distintos de runId/transactionId.

Limite: 200 registros, sin eviction automatica de claves de idempotencia. Al
alcanzarlo se bloquean consultas nuevas para conservar evidencias. La cola y
proteccion de concurrencia corresponden a una instancia Main. Electron obtiene
un bloqueo de instancia antes de abrir los diarios de `userData`: otro proceso
con el mismo directorio sale sin abrir una segunda ventana ni ejecutar envios.
No existe bloqueo de archivo para procesos externos ni auditoria certificada.

## Dependencias externas pendientes

### Fuentes Mediator y export de Registro recibidos el 2026-10-12

El usuario aporta Y:/llavesCajeros.reg y Docs tecnicos/Mediator con
ConfigFiles.rar y DotNet.rar. Seleccion canonica sin fecha: 12 configuraciones
y 14 DLL; 44/102 entradas fechadas se conservan como backups y no se adoptan.
Los originales, archivos .reg y reportes privados estan excluidos de Git.
No se importa el Registro, ejecutan binarios del proveedor, usan valores de
llaves ni transmiten nuevas consultas durante esta revision.

El export contiene 122 secciones bajo HKLM/SOFTWARE/AlexSoft/SafeNet.
Se inspeccionan nombres/tipos de entradas, sin copiar ni mostrar material
criptografico. Existe la seccion 428150205, compatible nominalmente con BIN
428150 y entidad 205, con referencias PVK, IMK, CVV/iCVV y otras. La raiz
declara PEK y parametros HSM; una proyeccion de parametros no secretos
identifica Par_ip=10.10.30.6, Par_Port=4001 y UsesBIN9=1. No se conecta
a ese destino ni se infiere su ambiente, estado, envoltura/formato de llaves
o asociacion efectiva con ATM20521. Esto resuelve disponibilidad de una fuente
de configuracion criptografica, no el contrato TEST ni el origen EMV.

ExtremeICryptoSwitchPCI.dll y IProcesaClaves.dll estan recibidas; sus metodos
inspeccionados corresponden a validacion/traduccion de datos recibidos y
validacion/cambio de claves. No se usa un cambio de PIN como generador.
ExtremeTools.dll de Mediator agrega EncryptPinAsHexa(pan,clearPin,key), con
preparacion AnsiPinEncrypt y llamada nativa Des_Encript. ReadKey sigue leyendo
Registro y descifrando mediante GetInternalKey. No se extrae esa clave interna
ni se invoca el cifrador sin contrato/formato/referencia TEST validados.
Los hashes/versiones de Mediator difieren en varios modulos del host ATM;
no se mezclan fuentes por tener igual nombre. El perfil EMV sigue pendiente.

Hay una incompatibilidad entre fuentes concreta: DebitoConecta_999999.cfg
declara paso 010 = ExtremeSendDebitoPCI.CSendCore.SendMediator; la DLL
canonica recibida no tiene ese metodo y hereda System.Object. Su metodo
publico financiero es SendTransaccion con cuatro parametros de contexto.
ObjectLibrary.ExecuteAsembly busca Type.GetMethod (IL 166) e invoca
MethodBase.Invoke (IL 294). Ese cruce de cfg/DLL fallaria al intentar llamar
el metodo ausente; falta demostrar que ambos son los cargados en runtime.
No se atribuye el F39=96 anterior sin log del proceso/UTRNNO.

Se prepara artifacts/mediator-review/DebitoConecta_999999.candidate.cfg:
solo Metodo de paso 010 cambia a SendTransaccion; XML valido, hash propio,
todos los metodos no terminales encontrados en las DLL y validacion negativa
del original que detecta ese unico metodo ausente. Es una propuesta local,
no desplegada ni validada contra el comportamiento financiero del servidor.
TODO-DATA MEDIATOR-FLOW-VERSION: confirmar cfg/DLL cargados y validar la
operacion SendTransaccion contra el perfil QA antes de sustituir el archivo.
Este conflicto no se resuelve silenciosamente ni deshabilita criptografia.

La configuracion Mediator aporta ademas PROXY205.CallSubSystem=AUTHTD,
con ExtremeSwitchProxyISOAuth.CMain, y AUTHTD/ExtremeSwitchDebitoPCI.RedNet.
ExtremeSwitchDebitoPCI.config usa AutorizacionByBin=ExtremeAuthCMSByBin.config;
ese archivo canonico solo tiene 999999 -> DebitoConecta_999999.cfg. El IL
GetFileCFGByBin busca CodigoEmisor9, luego CodigoEmisor y por ultimo 999999.
Esto documenta seleccion de fallback, sin confirmar el archivo runtime.
Log PROXYISO configurado en E:/ExtremeLog/PROXYISO/; log de autorizador en
C:/ExtremeLog/ExtremeSwitchDebitoPCI/. SRVPIN/SRVPIN01 de Mediator son XML
bien formados, distintos del SRVPIN mal formado del host ATM. No se sustituyen.

Reportes privados: artifacts/mediator-review/inventory.json, metadata.json,
config-review.json, flow-compatibility.json e IL sanitizado. El candidato
se verifica por metadata y estructura XML, sin ejecutar el controlador o
sus pasos de cambio de tarjeta, PIN o cupos. El proveedor financiero real
del simulador sigue pendiente de contrato TEST, EMV y serial/perfil.

- TODO-DATA CARD-TRANSACTION-SECURITY: contrato QA y asociacion de tarjeta/cuenta,
  PIN Block y EMV frescos. La referencia SeguridadWcf de HostCMS.config corresponde
  a interfaces de usuarios/permisos segun las DLL inspeccionadas; no identifica
  un generador de PIN financiero. ATMIso8583 consume PinTrasladado y datos EMV;
  ValidacionPinLocal2018 valida PIN/ARQC recibidos. Faltan el origen de esos datos
  nuevos, formato/zona de cifrado TEST y perfil transaccional del chip. No se
  importan PFX/PVK ni se habilita una configuracion por su nombre.
- TODO-DATA CB-SEQUENCE-CONTRACT: sp_DebGetNextSeq esta identificado en el modulo;
  su uso es condicional, no obligatorio para todo perfil. GenerarTransaccion
  inicializa la secuencia desde Param.Serial; con GrabaAutoTran=N conserva ese
  serial, y con S tambien lo conserva si el BIN esta en ATMBIN. Solo la rama
  restante pide sp_DebGetNextSeq. selectCoonectaSequence implementa esa decision.
  El COONECTA_ATM.XML activo tiene N. Falta acordar asignacion/unicidad/reinicio
  del serial del simulador y zona de fechas; no se consume un contador SQL por
  el nombre parecido de otro SP ni se inventa un rollover.
- TODO-DATA ATM-IMAGE-ACTIVE-PROFILE: validar version, cabecera y campos privados
  del perfil ejecutable, frente a los respaldos/configuraciones contradictorios.
- BALANCE-RESPONSE-CONTRACT mantiene semantica/variantes; la parte mecanica F54
  esta implementada. CB-PROCESSOR-ERROR/CB-96-SWITCH-LOG siguen pendientes fuera
  de la app; este motor no corrige la dependencia AUTHTD/Core.

La solicitud de dos consultas fisicas separadas por 30 segundos se mantiene
dependiente de esas configuraciones. La comprobacion actual del lector confirma
CARD_PRESENT, pero no habilita envio financiero. No se guarda el PIN facilitado
por el usuario ni se transmite un bloque ficticio o tomado de una captura.

Para completar el adaptador real hace falta identificar el mecanismo TEST de
captura/cifrado del PIN (EPP o servicio de pruebas equivalente), su contrato y
referencia segura de claves, el perfil EMV aplicable y el proveedor QA de secuencia.
No se solicitan PIN o claves por chat. Las DLL recibidas son componentes del host;
no se ejecutan como generadores ni se inventa una llamada por su nombre.
Ver la inspeccion estatica adicional en `../protocols/ISOBASEI_REVIEW.md`.

## Archivos y datos concretos para terminar la configuracion

Revision directa del recurso Y:/ExtremePCI del 2026-10-12: SRVPIN.XML y
EXTBASE.config recibidos tienen los mismos hashes que las copias canonicas
inspeccionadas. Busqueda recursiva del nombre exacto ExtremeICryptoCMS.dll:
cero coincidencias y cero errores de lectura. No se ejecutan los binarios
ni se modifican configuraciones del recurso compartido.

EXTBASE.config es XML bien formado. SRVPIN y SRVPIN01 usan
ValidacionPinLocal2018.dll / ValidacionPinLocal2018.CIEMVAll_PADSS,
Version=T2017T, TipoProceso=O, TipoAlgorithmo=IBM3624, TipoCifrado=A,
CMS=NA, QueueAdq=18 y GROUP=SRVPIN, mediante SharedMemLink.exe.
Se conservan estos identificadores sin inferir algoritmo de cifrado del F52,
zona/clave TEST, unidades del timeout o equivalencia con un generador.
SRVPIN.XML sigue mal formado por Debug"S"; una correccion solo en memoria
permite inspeccionarlo. Sus nodos son DatoLog y Excepcn: configura datos de
log/excepcion, no aporta el contrato del generador de PIN Block.

La DLL ATMIso8583.dll de Y tiene el mismo hash que la fuente ya revisada.
Inspeccion IL de ValidaPinConCedula: instancia CCryptoService (offset 70)
y llama ValidaPinCard (offset 268); devuelve/controla RetCode. Esta referencia
es de validacion, no demuestra generacion de F52. ExtremeICryptoCMS.dll deja
de ser un requisito P0 general para generar una consulta; solo corresponde
investigarla si el perfil ejecuta esa rama de validacion. No se prueba que
esa rama este habilitada o deshabilitada en runtime.

Ya no se solicitan de nuevo estos dos archivos ni la DLL ausente como
sustituto del generador. El pendiente es el mecanismo TEST que origina PIN
cifrado y EMV de la nueva operacion (EPP/kernel del terminal o servicio/SDK validado),
ademas del serial y perfil de instancia. La configuracion de validacion del
host no sustituye esos datos. Reporte privado:
artifacts/atm-image-review/shared-pin-config-review.json.

La revision adicional identifica referencias reales; los nombres de archivos
no presentes siguientes no se sustituyen por bibliotecas de otra version.

| Prioridad | Archivo/export a solicitar del despliegue QA | Para que sirve |
| --- | --- | --- |
| Condicional | `ExtremeICryptoCMS.dll` y contrato cliente, solo si se ejecuta la rama ValidaPinConCedula | No aparece en los RAR ni en Y:/ExtremePCI. La llamada inspeccionada es ValidaPinCard; no identifica un generador F52 y no bloquea por si sola el adaptador de generacion. |
| P0 | Configuracion/contrato del mecanismo TEST que genera el PIN cifrado (EPP o servicio/SDK validado), con formato y referencias seguras de zona/clave | SRVPIN.XML y EXTBASE.config ya estan recibidos e inspeccionados directamente: identifican validacion y logs, sin configurar un generador. No se piden de nuevo. Si se usa Crypto/WCFCryptoServer, faltan contrato y configuracion/argumentos de esa instancia. Incluir referencias, nunca valores de claves. |
| P0 | Export de ACU y version/ajustes efectivos del terminal Diebold 91x o proveedor TEST | La nueva captura confirma Diebold 91x, no NCR. El TXT NCR recibido aporta EMV1/EMV4/EMV5 como referencia; su compatibilidad con este terminal no esta validada. Obtener el export mediante el boton visible en Home > EMV y confirmar producto/version; si no incluye AID/capacidades/TAC y parametros efectivos, localizar su descarga/configuracion con la documentacion de esa version. No pedir de nuevo el TXT ni asignar una ruta o formato de export inventados. Falta completar el dialogo transaccional del chip en el simulador. |
| P0 | Contrato de asignacion/reserva del serial ATM para el simulador; zona de reloj y origen de fecha contable | El perfil activo N conserva Param.Serial. sp_DebGetNextSeq solo seria necesario para su rama condicional; no se encontro en el SQL compartido inspeccionado y no se solicita como dependencia universal. La conexion/credencial SQL ya estan disponibles. |
| P0 | Perfil ATM de la instancia y export de su fila/entradas TRAN | Los archivos canonicos sin fecha ya fueron confirmados y seleccionados. Falta vincular un ATM a la instancia local y validar cabecera/campos, cuenta y enlace aplicables; no hace falta reenviar los mismos archivos o identificar de nuevo los backups. |

El administrador del host ATM/HSM puede aportar los dos primeros; el responsable
del software Diebold instalado, el perfil EMV; el DBA del host, el export de secuencia y perfil.
Se puede entregar una configuracion sanitizada con rutas a secretos administrados.
No se necesitan PIN, PAN completo, ZPK/ZMK/KEK, passwords ni PFX/PVK por chat.

Precision de la solicitud EMV del 2026-10-12: la imagen ya contiene parte de
la configuracion necesaria. La copia local 205_NCR6848_Multi_Dip.txt coincide
por SHA-256 830d584f3c4e8289b4d1efa31e670210dbf5ee1dbeda2966a91050df1961a6ae
con Y:/ExtremePCI/Imagenes/2020/CB CALIDAD/205_NCR6848_Multi_Dip.txt,
ruta referenciada por el BAT. Se encuentran candidatos TLV de moneda 0840,
exponente 02 y tipos 01/30 en EMV1 (linea 4526), pais 0218 y tipo terminal 14
en EMV4 (4528), mas las entradas AID/datos de EMV5 (4547-4565).
Estos valores se conservan como evidencia de fuente pendiente de mapeo
NCR/operacion; no se activan como defaults ni se genera un criptograma.
Reporte privado artifacts/atm-image-review/ncr-emv-parameter-candidates.json.

El manual NCR APTRA Advance NDC EMV ICC B006-6297-H000, Issue 2, enero 2012,
capitulo 5 describe las tablas descargadas; capitulo 7 describe ajustes de
Registro en HKLM/SOFTWARE/NCR/APTRA/EMV EXITS. Se consulto una reproduccion
del manual del proveedor, sin asumir que esa version coincide con el ATM:
https://studylib.net/doc/27629079/ncr---emv-integrated-circuit-card--icc--reference-manual.
Correccion posterior en esta misma fecha: el usuario confirma cajero Diebold;
la captura de Application Configuration Utility muestra Home > EMV, Vendor
Protocol = Diebold 91x y boton Export. La ruta NCR antes recomendada no aplica
como instruccion para este terminal. Las tablas NCR y ese manual permanecen
solo como evidencia de su fuente; no acreditan parametros activos de Diebold.
TODO-DATA DIEBOLD-91X-EMV-PROFILE: export de ACU, producto/version instalada,
y configuracion/descarga EMV efectiva si el export no la incluye. La captura
solo prueba el protocolo seleccionado; no prueba capacidades, AID/TAC,
procesamiento del chip ni generacion de un criptograma. Usar el boton Export
visible para obtener configuracion, sin Save, Set to defaults ni cambio de
protocolo. No se presupone nombre/formato/ruta del archivo resultante ni se
identifica la version exacta del kernel a partir de la version de ACU.

Evidencia adicional recibida por texto/captura: emvdecre.ina, marcador
4.1.0-210326-10-1a948234-68adbf54. Fuente transcrita privada en
artifacts/atm-image-review/user-emvdecre.ina; se desconoce su ruta original y
si sus valores corresponden al runtime activo. Se registra sin activar perfil:

- NUMBER_OF_SUPPORTED_AID=0; no secciones/listas AID en el fragmento recibido.
  No implica por si solo cero aplicaciones efectivas ni explica el 96.
- CAPABILITY_TO_CONFIRM_APPL_SELECTION=YES, idiomas vacios y
  FORCE_ONLINE_IF_CHIP_DOES_NOT_SEND_ARQC=yes son valores declarados del archivo;
  no se implementa una politica de autorizacion a partir de sus nombres.
- TAC_ONLINE y TAC_DEFAULT: FF FF FF FF FF, cinco bytes cada uno. TAC_DENIAL
  no aparece; no asignar cero ni heredar valor NCR por suposicion.
- DEFAULT_TDOL se lee como lista tag/longitud, no BER-TLV de valores:
  9F02/6, 5F2A/2, 9A/3, 9C/1, 95/5 y 9F37/4, longitud agregada 21 bytes.
  Esta lista no sustituye CDOL1/CDOL2 de la tarjeta ni contiene un ARQC.
- TERMINAL_PROPERTIES/TAGS: 9F1D=00, 9F53=5A, 9F39=05, un byte cada uno.
  La relacion de nombre 9F53 es propia del framework; no inferir un mapeo
  directo a campos ISO8583 por igualdad de numero/nombre.

El manual del proveedor ProCash NDC/DDC V3.0/21, junio 2015, apartado Parameter
Management, documenta EMVDECRE.INA como parametros EMV y EMVDECRE.BAT como
aplicador mediante KCONF/CCRCCONV (INA -> RCK -> Registro). Copia consultada:
https://pdfcoffee.com/procash-ndc-ddc-v3021-installationmanual-en-pdf-free.html.
Es evidencia del mecanismo en esa version, no prueba de ruta/version instalada
del cajero. La evidencia posterior del usuario ya aporta BAT y su ruta;
no volver a solicitar BAT/RCK ni ejecutar conversores para buscar parametros.
El export de runtime y parametros descargados sigue pendiente si no se refleja
en esos archivos. Esta revision no modifica software ATM ni envia transacciones.

BAT recibido por texto y captura: C:/ProTopas/Conf/EMV/emvdecre.bat, marcador
4.1.0-191111-10-5e16b8e0-68adbf54. Copia privada no ejecutable en
artifacts/atm-image-review/user-emvdecre.bat.txt. Contiene exactamente estas
llamadas: kconv emvdecre.ina y ccrcconv emvdecre.rck -t EMVDEBITCREDITFW -U.
La version aportada usa kconv, no el nombre KCONF del manual antiguo.
El RCK es salida del primer paso; el usuario indica que no hay mas archivos.
No se exige conseguirlo, generarlo o reinstalar software para revisar perfil.
El argumento identifica EMVDEBITCREDITFW como destino logico del convertidor;
no aporta por si solo ruta fisica de Registro ni prueba ejecucion/carga efectiva.
Para localizar esa ruta en el cajero fisico, consulta read-only por nombres
de claves en ambas vistas, sin exportar valores ni asumir un root NCR:

```bat
reg query HKLM\SOFTWARE /f EMVDEBITCREDITFW /k /s /reg:32
reg query HKLM\SOFTWARE /f EMVDEBITCREDITFW /k /s /reg:64
```

Sintaxis /k (solo nombres) y vistas verificada con documentacion Microsoft:
https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/reg-query.
Sobre la ruta encontrada, la siguiente lectura debe acotarse a parametros
EMV publicos; no solicitar export general del Registro. Pendiente solo este
vinculo/runtime y datos efectivos no presentes en el fragmento, ademas del
procesamiento del chip y proveedor PIN TEST ya registrados. No se atribuye
F39=96 al contador AID ni a la ausencia del RCK.

ndccomp.exe tambien existe ahora en Y:/ExtremePCI/Bin32; no se ejecuta.
La salida compilada salidaNDC_2051.txt no aparece en esa carpeta de imagen.
La existencia de ImportClearPIN en WCFExtremeCrypto no lo hace apto para saldo:
su IL llama PinChangeFromZone, por lo que no se ejecuta esa operacion.

## Confirmacion de archivos activos y SQL compartido

El usuario confirma que los archivos sin fecha son activos y que los fechados
son backups. review-active-atm-sources.mjs aplica esa regla a las copias canonicas,
excluye archivos/directorios fechados y genera un manifiesto de hashes privado.
No sustituye un archivo ausente por un backup ni mezcla EXTBASE con EXTBASEATM.
2013PCI/2017 en nombres de modulos son identificadores de version, no una fecha
calendario. La identificacion de copias canonicas activas ya no se solicita de nuevo.

Extremedata.xml activo declara OCTOCLI/OCTOCLI2/OCTOCLI3 en OCTOCLI_PCI del mismo
servidor/puerto SQL ya configurado. El usuario confirma que QA/PREPROD comparten
ese servidor. Esta confirmacion no permite mezclar historiales/casos financieros
ni cambiar el ambiente local sin sus validaciones.

La inspeccion autenticada usa la credencial DPAPI existente y SELECT de catalogos
del sistema, con TLS cifrado y la excepcion puntual de metadatos autorizada; no
cambia los defaults de TLS del Observer ni invoca SP, DML o DDL. En las 14 bases
de aplicacion visibles no se encontro sp_DebGetNextSeq en los objetos visibles;
la consulta por secuencias no alcanzo su limite. OCTOCLI_PCI y OCTOCLI_PCI_A tienen
sp_AtmGetDestino con cinco parametros y otros procedimientos de secuencia con
contratos distintos. No son sustitutos del SP por coincidencia de nombres.
La ausencia observada no prueba ausencia en otros servidores o bajo otros permisos.

Se corrige la dependencia anterior: el SP ausente no bloquea por si solo el
perfil activo GrabaAutoTran=N. Sigue faltando un serial ATM nuevo reservado para
esta instancia, y el origen PIN/EMV TEST real. El runtime aun no inyecta un
BalanceContextProvider completo. La base local de catalogos inspeccionada no
contiene perfiles ATM; no se elige automaticamente un cajero fisico por el fixture.

Evidencias privadas: active-sources/manifest.json, sql-context-metadata.json,
sql-sequence-search.json y two-local-balance-probes.json en artifacts/atm-image-review.
Las dos pruebas del emisor se realizan en 127.0.0.1 con seguridad y respuestas
sinteticas, separadas por al menos 30 s; no son envios al Switch/Core de QA.

Resultado observado: prueba 1 STAN 650101, respuesta sintetica 00/APPROVED;
prueba 2 STAN 650102, respuesta sintetica 91/NOT_APPROVED. El servidor local
recibio dos requests con diferencia de 30060 ms. El diario conserva referencias
distintas y resultados correlacionados; escrituras financieras QA: cero.

Solicitud posterior de envio real al Switch: se ejecuta el emisor puntual de
la captura original CB, autorizado explicitamente por el usuario, separado de
la generacion nueva. El destino 10.60.0.11:16100 rechaza TCP con ECONNREFUSED
y cero bytes transmitidos. Un probe sin writes confirma REFUSED. No se habilita
el proveedor PIN/EMV ni el boton de generacion nueva por este intento; el bloqueo
de conectividad requiere resolver listener/red en el Switch. Ver QA_CAPTURE_REPLAY.md.

Reejecucion posterior autorizada: TCP funciona, se transmite una vez la captura
original de 536 bytes y se recibe 0210/F39 91 para STAN 007923, sin F54.
runId 9a6606b3-6829-4f2e-abed-99f27e97d274, write 18:16:03.939 UTC del
2026-10-12. El rechazo TCP anterior ya no describe esta ventana; la causa del
91 requiere correlacion nueva y no se asigna por el antecedente de Core.
Este resultado es replay real QA, no generacion PIN/EMV nueva desde el chip.

## Verificacion

Correccion del 2026-10-19: una consulta finalizada con PEER_CLOSED,
RESPONSE_TIMEOUT, TRANSPORT_ERROR, CONNECT_TIMEOUT o INVALID_RESPONSE y
entrega incierta ofrece Nueva transaccion. Esta accion solo libera el
formulario y la tarjeta seleccionada; mantiene el resultado, su incertidumbre
y correlacion en el diario y actividad de sesion. No reenvia el requestId
anterior. Se exige una nueva lectura y una nueva preparacion PIN/EMV.
La operacion del resultado se muestra aun si cambia el borrador.
El timeout IPC sin registro recuperado, PENDING, STORAGE_ERROR y cualquier
retiro incierto siguen reteniendo la referencia. La recuperacion excluye
temporalmente cambios de formulario para evitar sustituir un resultado nuevo
por una consulta de historial tardia.

Pruebas de regresion: cierre de saldo seguido de retiro USD 50 en Electron,
referencias y lecturas diferentes, historial conservado, timeout IPC sin
reenvio y retiro incierto sin liberacion. La integracion del proveedor usa
dos retiros sinteticos USD 20/50 con dos solicitudes de PIN, ATC/UN/STAN nuevos
y validacion de F4/F55 segun cada contrato, sin trafico al Switch QA.

Unitarios: reglas y parser, builder, contratos IPC, dependencia ausente/timeout,
liberacion tardia, sanitizacion, idempotencia y fallos de almacenamiento/transporte.
Integracion: Main, diario real/reinicio/corrupcion/limites y TCP local con datos
sinteticos, aprobacion, 91/96, fragmentacion, gestion, correlacion y timeouts.
Electron verifica pendientes reales del runtime y luego el recorrido/resultado
con IPC sintetico, bloqueo durante ejecucion y proteccion de doble clic.

Preparacion PIN: vectores mecanicos sinteticos de la fuente, D2 decimal,
padding/exclusion del digito final PAN, entradas invalidas/PROD, errores
sanitizados, cancelacion, timeout, respuesta tardia y borrado de buffers.
Integracion sintetica: bloque del cifrador en F52 del builder, registro PENDING
antes del transporte y error de contexto sin envio cuando falla el cifrador.

En Windows Vitest limita workers a uno y da 15 s a test/hooks: la suite de
procesos/SQLite/TCP local presentaba timeouts de arranque al competir por CPU/E/S.
No se cambian los plazos financieros del producto ni los deadlines del transporte.
