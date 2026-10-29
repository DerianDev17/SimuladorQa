# Checklist de informacion por subir

TODO-DATA CARD-ISSUER-PRODUCT-DISPLAY (2026-10-29): la referencia visual del
formulario incluye entidad emisora y producto. La identidad pública del lector
no proporciona esos campos ni existe aquí una correspondencia aprobada.
Pendiente fuente validada si se deben mostrar. El formulario presenta aplicación
y expiración del chip sin inferir entidad o producto desde PAN/AID; no bloquea envío.

TODO-DATA ISO-PRIVATE-FIELD-DISPLAY (2026-10-29): F42/F43/F44 y tags EMV públicos
se muestran sanitizados conforme a ADR-030. Sigue pendiente ampliar la proyección
por subcampo de F48/F53/F60/F62/F63 y de otros tags EMV. Todas las posiciones
presentes son visibles; los contenidos pendientes permanecen protegidos.
Ver docs/implementation/TRANSACTION_PREPARATION.md.

Evidencia LOAD-TCP-PEER-CLOSE (2026-10-29): `tcpcomms01.out` confirma que el
PID 80131 cierra la conexión anterior al aceptar otra de la estación. Resuelve
la causa del PEER_CLOSED de la corrida 982fba95-0f9a-4414-b512-ed257410e6d7.
ADR-029 serializa las conexiones de ese enlace sin impedir preparar operaciones.
TODO-DATA LOAD-PERSISTENT-TCP continúa pendiente: este log no valida múltiples
solicitudes financieras en un socket ni dispositivos independientes para carga.
La corrección local no depende de esos contratos; 3 TPS reales siguen sin acreditarse.

Evidencia LOAD-3TPS-PHYSICAL (2026-10-28): captura del usuario con ambos ATM,
8/8 consultas aprobadas en 91 s, 0,09 TPS frente a 3 TPS. Se implementa ADR-028
para evitar arranques de PowerShell repetidos por consulta. La evidencia actual
demuestra incumplimiento; no acredita capacidad del host. Pendiente repetir la
medición con esta versión y conservar serie/desglose. Los tests DPAPI sintéticos
solo acreditan mejora local del cifrado; no cierran este TODO-DATA.

Carga simultánea (2026-10-28): el usuario aclara que necesita solicitudes en
paralelo. ADR-027 habilita 1–5 slots con preparación física exclusiva, sockets
independientes y límite global de hasta 5 TPS. No exige un proveedor virtual
para solapar esperas TCP, pero el chip sigue limitando la alimentación del motor.
TODO-DATA LOAD-3TPS-PHYSICAL: medir preparación real; 3 TPS sostenidos con tarjeta
física no quedan acreditados por pruebas sintéticas. TODO-DATA LOAD-PERSISTENT-TCP:
confirmar contrato de sesiones persistentes/multiplexadas, gestión y respuestas
tardías antes de reutilizar sockets financieros. La aceptación de conexiones
simultáneas por el host requiere prueba QA del operador. No bloquea el motor local.

Carga con dos perfiles (primera entrega, sustituida por ADR-027): por solicitud del usuario se permite
seleccionar varios ATM QA en una corrida y alternar consultas secuencialmente
con una tarjeta física. No depende del pool virtual ni permite concurrencia
mayor a uno. Mantiene límites totales, PIN por corrida y validación de todos
los perfiles; aceptación remota de cada Terminal ID sigue pendiente. ADR-026.

Continuación tras errores (2026-10-28): el usuario solicita permitir nuevas
transacciones QA después de un retiro con error. ADR-025 elimina el bloqueo por
resultados terminados y guardados, incluido RC 59 y timeout. La clasificación
financiera y conciliación siguen pendientes; solo bloquean las partes que las
necesitan. Ejecuciones activas y fallos de persistencia requieren recuperación.

Montos personalizados (2026-10-27): por instruccion del usuario se elimina la
lista 20/50 del contrato de retiro de la plantilla QA ATM20521. Se admiten
importes positivos con dos decimales dentro de la representacion existente de
F4. TODO-DATA AMOUNT-RULES conserva pendientes los limites y denominaciones
financieros; no bloquea estas pruebas QA expresamente solicitadas. Ver ADR-016
y [retiro](transactions/WITHDRAWAL.md).

TODO-DATA CASE-FIELD-ORACLES (2026-10-26): para comparar campos ISO, secuencias
de gestion de red y reversos al estilo VTS3 se requiere fuente aprobada por
perfil ATM Coonecta, obligatoriedad/encoding, respuesta esperada, temporizadores
y criterios de correlacion. La expectativa local actual compara solo resultado
del host y codigo declarado por el operador; no importa reglas VIP ni atribuye
certificacion a un PASS.

TODO-DATA WITHDRAWAL-DEBIT-AND-REMAINING (2026-10-19): confirmar la semantica
F54 01/02 por perfil, si el disponible corresponde al saldo posterior al retiro
y la fuente del debito total efectivo con comisiones. El comprobante local
Con/Sin impresion fue confirmado por el usuario y no depende de esos datos.
Se conservan saldos neutrales del host; no se infieren importes restantes.

TODO-DATA REVERSAL-CARD-RETAINED: sigue pendiente el evento remoto de retencion
y su condicion temporal. La nueva prueba explicita Retiro + reverso utiliza un
temporizador local solicitado por el usuario; no depende de inferir ese evento.
Implementados snapshot efimero, campos del builder general, correlacion y diario
idempotente. REVERSAL-EMV-COMPLETION mantiene pendiente la finalizacion EMV del
ATM; REVERSAL-QA-ACCEPTANCE mantiene la validacion del flujo nuevo en host/Core.
No generalizar la rutina de timeout, que usa otro MTI original en F90. Ver
[revision estatica de DLL](protocols/QA_REVERSAL_DLL_REVIEW_20261019.md) y
[reverso](transactions/REVERSAL.md).

TODO-DATA CARD-GROUP-VARIABLE-MAP (2026-10-20): el libro Card Groups incluye
variables de F023/F045/F052/F053/F055, entre ellas PAN, titular, Track 1,
verificacion PIN, CVV, PIN/PIN Block y datos EMV. La captura de Variables
Manager tampoco acredita un mapeo aprobado entre esos nombres y el mensaje ISO
de este simulador. Para habilitar captura, edicion o envio se requiere, por
campo: identificador exacto, origen (chip/banda/terminal/host), formato y
longitud, clasificacion de seguridad, vigencia, destino ISO y regla de
override. Debe definirse en particular F55/9F10, 9F26, 9F36, tag C0, F123 y
F125. No importar valores del libro al inventario QA. Mientras no exista ese
contrato, el perfil solo guarda AID/etiqueta, CDOL tags/longitudes, ultimos
cuatro, alias y cuenta predeterminada; la operacion vuelve a leer el chip y
obtiene seguridad nueva.

TODO-DATA LOAD-VIRTUAL-PROVIDER (2026-10-20): falta contrato del pool financiero
virtual para concurrencia mayor a uno. El usuario autorizó PIN una vez por corrida
para el piloto con tarjeta física. Ese piloto queda ejecutable en QA/LOCAL/saldo,
con límites locales 5 TPS, 100 operaciones, 300 segundos y concurrencia 1;
no requiere inventar el proveedor virtual. La capacidad real del switch sigue
pendiente de medición; el desarrollo no inicia una corrida contra QA.

Revisión carga/múltiples ATM (2026-10-27): corregidos parada por retiro de
tarjeta, parada durante arranque, recuperación de IPC tardío, mínimo 0,1 TPS
y gráfica de respuestas/rampa. La inspección local confirma ATM20521
configurado con 959 reservas y ATM20524 con evidencia CMS únicamente.
La instrucción posterior del usuario define ATM20521 como plantilla funcional:
los ATM QA/205 heredan automáticamente ISO/EMV, referencia de clave, operaciones
y pool persistente. No se necesita perfil, clave, fecha contable ni reserva
individual por alta. Sustituye los pendientes locales MULTI-ATM-EXECUTION-PROFILE,
MULTI-ATM-PIN-KEY y MULTI-ATM-STAN-ALLOCATION en este alcance. Se conserva F15 de
la plantilla; no se afirma que sea la fecha contable efectiva del switch.
MULTI-ATM-QA-RESULT conserva la aceptación remota pendiente. Ver
[ADR-024](adr/ADR-024-REUSABLE-ATM-TEMPLATE.md).
El recorrido reutilizable de ambos se verifica con datos sintéticos y TCP
local. Ver [perfiles múltiples](implementation/MULTI_ATM_PROFILES.md) y
[carga](implementation/LOAD_TEST.md).

## TODO-DATA activos de la primera entrega

TODO-DATA QA-WITHDRAWAL-900114-WIRE: obtener NWINT/PROXY205 del19/10/2026,
11:59:16-11:59:38. Comparacion offline y SQL ya completada: builder reproduce
el cuerpo aprobado del frame248; CMS recibe011000/USD20/ahorros y cuenta correcta.
F48 difiere del retiro aprobado solo por `*S2C00000036`, opcion de impresion
de saldo confirmada en la fuente del proveedor (ImprimeSaldo/CostoImpSaldo).
No agregar comision ni cambiar EMV por suposicion. Falta el ISO original900114
para comprobar sus bytes dinamicos/EMV; los logs recibidos son del16/10.
Ver transactions/WITHDRAWAL.md, comparacion del19/10. La causa del91 no se
considera reparada por validar el builder ni por cambiar su etiqueta visual.

TODO-DATA QA-WITHDRAWAL-900114-CORE: F39=91 y respuesta CMS original
RetCode/CodigoProceso/MappedRespCode=0, registrada con fin posterior al 91.
La base define 91 como Issuer or switch inoperative; los dos registros MsgType2
tienen RetCode76 (NO EXISTE TRANSACCION ORIGINAL), mapeado a21, no a91.
SmartVista QA confirma para el original STAN900114, 2026-10-19 11:59:16,
PID80131, tipo700, USD20, mensaje1035: codigo interno801 (Timeout - authorizing
institution did not respond) y respuesta de red91. Mediator termina el original
19.973 segundos despues de iniciarlo, con APROBADO / TRANSACCION OK. Falta
localizar la demora y comprobar los timers vigentes de Switch/PROXY205/AUTHTD/Core
con logs del intervalo 11:59:16-11:59:38. El acceso a la ruta vigente de Mediator
no esta disponible en esta sesion; las copias archivadas no justifican cambios
de parametros. No afirmar ausencia de debito ni convertir 91 en aprobacion.
Por correccion del usuario, 91 termina el envio como no aprobado por el host
y libera la siguiente solicitud QA. Conciliacion y reversos son otros procesos;
se retira Nueva prueba QA. Ver transactions/WITHDRAWAL.md y ADR-016.

Actualizacion posterior: el usuario indica permitir el retiro usando la
preparacion "tal cual la consulta". Se implementa y configura la prueba
QA ATM20521/ahorros/USD20 con BOUND_PROFILE/ZERO, PIN/AC nuevos y F3/F4 de
retiro. Fuente USER_QA_INSTRUCTION; no se atribuye validacion al proveedor.
La alternativa CASH/01 y las reglas generales del proveedor conservan sus
pendientes documentales. Ver ADR-016 y transactions/WITHDRAWAL.md.

Consulta aprobada confirmada en el diario, 2026-10-16T21:07:27.983Z:
ATM20521/STAN 900110/RRN 628900900110, 0210/00, APPROVED, 451 bytes y
1271 ms de transporte. Se cierra la validacion financiera posterior a F35 y
5F34 (QA-F35-FIX-HOST-VALIDATION y seguimiento QA-ARQC-900108); no implica
que exista envio de retiro. El rechazo historico 57 / `5 ` sigue pendiente.

Solicitud de retiro: flujo de ejecucion ahorros/LOCAL/QA implementado;
proveedor PIN/EMV de retiro implementado y vinculado en Main, con contrato
independiente en qa-withdrawal-policies.json. Incluye monto exacto, IPC, ISO/TCP,
diario separado, correlacion e idempotencia, probados con dependencias sinteticas.
La alternativa CASH/01 genera 9F02 desde el monto y lo vincula a CDOL1/F55;
su implementacion no acredita la regla del enlace. No se activa envio real
sin contrato validado. Borrador concreto ATM20521/USD20 en
artifacts/qa-withdrawal-contract.pending.json, sin referencia de aprobacion.
La captura ya recibida confirma 011000/USD 20/00, frames 248/254. No pedirla
de nuevo. TODO-DATA QA-WITHDRAWAL-EMV-GENERATION: F4 contiene USD 20 pero
F55 tiene 9F02=0 y 9C=80; confirmar la regla aprobada de generacion antes
de construir una nueva AC de retiro. El formatter consume EMV, no resuelve
ese contrato. AMOUNT-RULES y reglas de resultado parcial/reverso siguen
separadas. Ver [estado y fuentes](transactions/WITHDRAWAL.md).

Respuesta del usuario, 2026-10-16: confirma que la discrepancia requiere
consulta al proveedor. Los valores propuestos 9F02=000000002000 / 9C=01
para USD 20 no constituyen una regla aprobada para este enlace.
QA-WITHDRAWAL-EMV-GENERATION permanece abierto. La consulta preparada en
WITHDRAWAL.md pide la regla para CDOL1/F55, la explicacion de la diferencia
y un caso validado con correlacion; no se ha enviado al proveedor.
QA-WITHDRAWAL-RESULT-RULES conserva como pendientes el tratamiento de
rechazos/parciales y el cierre de conciliacion. Mientras tanto, el motor
conserva esas respuestas como REQUIRES_REVIEW e impide duplicar retiros.
TODO-DATA QA-WITHDRAWAL-RC59-900125: ATM20521/STAN 900125 recibio RC 59 en
una respuesta correlacionada de retiro por USD 50. Falta el contrato aprobado
que determine si es rechazo definitivo y como conciliarlo con Core. Hasta
entonces el retiro queda por revisar. Desde ADR-025, otra solicitud de retiro
o saldo puede iniciarse con lectura y PIN nuevos sin alterar ese registro.

PROXY/SRVPIN recibidos 2026-10-16: el adjunto identifica 900108, pasa
PIN/tarjeta, falla ARQC y registra 57; PROXY transmite `5 `. F55 omite 5F34
y el validador completa 00 porque no recibe F23. Corregido el proveedor local
para incluir la secuencia vigente del chip en F55; captura aprobada incluye
5F34=01 y NWINT 900107 confirma F23=001. TODO-DATA QA-ARQC-900108: comprobar
con una nueva consulta que llega la secuencia correcta y ARQC pasa. TODO-DATA
QA-RESPONSE57-PACKING-900108: localizar el cambio 57 -> `5 ` entre SRVPIN y
PROXY. No normalizar ni remapear por suposicion. El diario 900108 registra
NOT_APPROVED/96, confirmando el arreglo F44 previo. Ver
[correlacion y limites](protocols/QA_SWITCH_LOGS_20261016.md).

Logs recibidos 2026-10-16: ATM20521/STAN 900107, UTRNNO 262891821077305370.
NWINT completo confirma F39 literal `5 ` de PID 82052 y ausencia de mapeo
para nwind 28; SmartVista devuelve 939/96. Resuelto TODO-DATA
QA-INVALID-RESPONSE-900107: el parser omitio F44, definido en ISOBASEI y
presente en la respuesta real. Corregido y comprobado offline con el cuerpo
original; RRN final 628900900107 coincide. PROXY recibido despues confirma
`5 ` para esa consulta; QA-RC939-900107 queda limitado a su detalle SRVPIN,
que no se deduce del adjunto de 900108. No pedir NWINT/PROXY otra vez.
El tar esta truncado antes de tcpcomms, pero eso no impide este diagnostico.
La aprobacion financiera sigue pendiente; no se envia otra TRX. Ver
[evidencia y alcance](protocols/QA_SWITCH_LOGS_20261016.md).

Diagnostico resuelto para ATM20521/STAN 900105 y 900106, revision 2026-10-16:
SmartVista QA registra 880/19; el detalle de UTRNNO 262882258532152760
identifica BAD_TRK2. Se corrige el relleno BCD de F35 conforme a la captura
aprobada: 0 inicial para longitud impar, sin copiar el F final de tag 57.
TODO-DATA QA-F35-FIX-HOST-VALIDATION: comprobar una nueva consulta con PIN/EMV
nuevos despues del arreglo y correlacionar su respuesta. Las pruebas locales
no demuestran aprobacion financiera. No se consume reserva real; al inspeccionar
quedan 998. Los pendientes QA-RC19-900102/900103/900104 siguen abiertos porque
no se consultaron sus motivos internos en esta revision. Ver
[correlacion y correccion](implementation/BALANCE_EXECUTION.md).

Resuelto TODO-DATA QA-SEQUENCE-POOL-REPLENISHMENT, 2026-10-15T22:41:47Z:
tras el intento bloqueado aa348124-ebe0-45e3-a086-f7089b300e46, el usuario
autoriza verificar y asignar 900105-901104 exclusivamente a esta estacion.
Tres SELECT confirman lote/fecha compatibles y cero registros del rango.
Main carga y reconoce las 1000 reservas con respaldo y reemplazo atomico.
No se envia una transaccion; el diario conserva cinco entradas. La excepcion
SQL puntual queda consumida y SQL-TLS-SERVER-CERTIFICATE sigue pendiente.
Ver [ADR-015](adr/ADR-015-QA-SEQUENCE-POOL-REPLENISHMENT.md).

Consulta nueva 2026-10-15T21:23:31.115Z: la instancia Electron envia saldo
ATM20521/STAN 900104/RRN 628800900104 y recibe 0210/19, NOT_APPROVED.
La consulta SQL puntual autorizada (ADR-014) confirma lote 31/2026-08-17
y candidato sin uso. Se provisiona una reserva local desde Main con respaldo,
tras detectar que escribir desde Codex recreaba la copia virtual de AppData.
La reserva se consume; diario con cinco entradas, sin reintento ni hook de
envio al arrancar. TODO-DATA QA-RC19-900104: motivo interno correlacionado de
SmartVista. SQL-TLS-SERVER-CERTIFICATE permanece pendiente y la excepcion
queda consumida. ATM20524 sigue sin perfil ISO validado. Ver
[ejecucion](implementation/BALANCE_EXECUTION.md) y
[autorizacion puntual](adr/ADR-014-ONE-TIME-BALANCE-RESERVATION-INSPECTION.md).

Conexion de la app recuperada, 2026-10-15T21:06:39Z: el usuario confirma
"conectado" y Windows verifica el socket Established de Electron Main
58860, 10.10.10.21:59471 -> 10.60.0.11:16100. El mensaje previo de la ventana
era una validacion local de configuracion, no evidencia de rechazo TCP.
La virtualizacion de AppData de Windows hacia visibles los archivos a las
herramientas pero no a Electron fuera del paquete. Se recuperaron 16 archivos
con verificacion SHA-256 y respaldo, incluyendo historial y marcadores de
ejecucion unica; no se descifraron secretos ni se sobrescribio SQLite.
QA-16100-REFUSED-20261015 ya no bloquea la conexion actual; la causa del
rechazo historico de las 20:11:26Z sigue sin determinar. ATM20521 conserva
cero secuencias y ATM20524 carece de perfil ISO directo validado; no se
envia una nueva TRX. Ver [recuperacion](implementation/SWITCH_CONNECTION.md).

Inspeccion de certificados 2026-10-15T20:33:18Z: SQL 172.60.60.172:55893
presenta CN=SSL_Self_Signed_Fallback, autofirmado, con errores de confianza
y nombre. La huella/cadena no corresponden a ninguno de los dos CER aportados.
La inspeccion de metadatos de 15 bases, bajo la excepcion PREPROD ya autorizada
en ADR-006, no encuentra esos certificados; no consulta registros de negocio.
TODO-DATA SQL-TLS-SERVER-CERTIFICATE: configurar certificado/cadena y nombre
aprobados para SQL. Se conserva la validacion TLS de la app. La conexion
al Switch se recupera posteriormente como se indica arriba; no resuelve
el certificado de SQL ni la falta de secuencias. Ver
[evidencia de certificado y conexion](implementation/SWITCH_CONNECTION.md).

Diagnostico de conexion 2026-10-15T20:11:26Z: QA 10.60.0.11:16100 rechaza
el establecimiento TCP (REFUSED), cero bytes enviados/recibidos. Es distinto
del problema TLS SQL en 55893. El nuevo ATMPublicKeyProd.cer esta vigente
hasta 2027-07-18, pero su confianza/correspondencia con SQL no esta acreditada;
16100 usa TCP sin TLS. El origen historico de QA-16100-REFUSED-20261015
requeriria correlacionar listener y rechazos remotos con ese intento;
no bloquea la conexion recuperada. Las capturas muestran
10.10.10.21 configurada y cierres de 172.60.60.171; no demuestran NAT ni
sesion establecida de la PC. Ver [conexion](implementation/SWITCH_CONNECTION.md).

Reintento solicitado con root.cer, 2026-10-15: el certificado aportado vence
el 2026-04-17 y su validacion devuelve UntrustedRoot/NotTimeValid. SQL sigue
sin una cadena confiable; no se instala el certificado vencido. Dos intentos
reales a traves del motor, con lectura correcta de tarjeta, terminan BLOCKED:
ATM20521 por QA-SEQUENCE-POOL; ATM20524 por vinculacion PIN/perfil ISO directa.
Ambos generan cero tramas y cero bytes transmitidos; no hay respuesta host.
QA-TWO-PROFILE-EXECUTION continua pendiente. Evidencia y detalle en
[contexto de varios ATM](implementation/MULTI_ATM_CONTEXT.md).

Comparacion solicitada de los dos perfiles QA, 2026-10-15: ATM20521 tiene
perfil ejecutable y pool agotado; ATM20524 conserva evidencia CMS pero no
perfil ISO directo ejecutable. Sus adquirentes de catalogo difieren y las
ultimas fechas contables observadas son distintas. TODO-DATA
QA-TWO-PROFILE-EXECUTION: reserva nueva, vinculacion validada de los campos
ISO/calendario de ATM20524 y acceso a metadata actual. La consulta SQL de
contraste falla por validacion TLS; no hay nuevos envios ni reservas.
Ver [comparacion](implementation/MULTI_ATM_CONTEXT.md).

Consulta posterior solicitada, 2026-10-15T18:52:05.807Z: 0210/19 para
ATM20521/STAN 900103/RRN 628800900103. El pool ahora conserva cero secuencias;
no reutilizar ninguna de las consumidas. TODO-DATA QA-RC19-900103: motivo
interno del host correlacionado con esta nueva consulta. Los diagnosticos
reales registran version terminal 008C, chip 00A0, TVR 8080800000 y CVM 3F0001;
no demuestran por si solos el motivo de F39=19. QA-EMV-VERSION-CVM-BINDING
continua pendiente. Las capturas del nodo 80131 aportadas en esta solicitud
confirman metadata del enlace; el bloque de llave protegido no se interpreta
como clave clara ni se incorpora al repositorio. Se conserva la vinculacion
TEST local previamente comprobada. No hay reintento automatico.

Actualizacion 2026-10-15: el envio de consulta nueva ya tiene evidencia local
de respuesta correlacionada 0210/19, ATM20521/STAN 900102/RRN 628800900102.
No es aprobacion financiera. TODO-DATA QA-RC19-900102: motivo interno y mapeo
del host para esa consulta. TODO-DATA QA-EMV-VERSION-CVM-BINDING: validar la
correspondencia de version terminal 008C/chip 00A0 y seleccion CVM contra
el perfil aprobado; no forzar resultados satisfactorios. El pool privado
conserva una secuencia: su reposicion necesita una reserva aprobada, sin
reciclar las consumidas. Estos pendientes no bloquean el monitor de presencia,
la UI ni los diagnosticos. No se ejecutan pruebas ni nuevas consultas.

Actualizacion posterior 2026-10-14: la nueva llave de enlace del usuario ya
se verifica por KCV/XOR y por coincidencia del cifrado PIN con la consulta
aprobada. Se protege con DPAPI y activa ATM20521 en qa-execution-profiles.json,
con lote abierto 31 consultado y seriales propios reservados. Se resuelve
QA-LOCAL-TEST-BINDING para este perfil y se corrige la envolvente EMV F55.
Los bloqueos de llave descritos abajo son historicos para este perfil; no se
vuelven a pedir componentes/HSM/SafeNet. La aprobacion depende del intento
financiero y su respuesta. Detalle: QA_PIN_EXECUTION.md.

Correccion de conexion 2026-10-14: no falta IP ni autorizacion TCP para la PC
en la prueba actual. La app no mantenia un socket y su indicador era fijo;
el CLI cerraba al primer 0800. Implementados control de conexion QA en Inicio
y estado real. Prueba de 45 segundos a 10.60.0.11:16100 recibe 0800/071 y
0800/072 manteniendo TCP abierto, sin bytes de aplicacion transmitidos.
VISA-NETWORK-RESPONSE-POLICY sigue limitado a la respuesta ISO automatica y
el veredicto de sesion financiera, no impide conectar/observar TCP. Ver
docs/implementation/SWITCH_CONNECTION.md.

Correccion de alcance 2026-10-14: el usuario confirma que el emisor financiero
sigue conectado a 10.60.0.11:16100. TCS, su IP y su intercambio de llaves dejan
de ser requisitos de esta ruta; QA-TCS-WIRE-KEY-EXCHANGE solo corresponde a una
futura emulacion TCS. Los componentes 2134/2135 ya estan importados como maestra
de ATM20524, protegida por DPAPI fuera del repositorio. Su KCV coincide con CMS
y difiere del enlace 80131, revisado nuevamente en SmartVista. No falta recibir
esos componentes. QA-LOCAL-TEST-BINDING/QA-PIN-HSM-BINDING mantienen la
vinculacion efectiva de cifrado PIN con la llave del enlace, no generar otra
maestra CMS. La prueba directa vuelve a recibir 0800/071. Los servicios
documentados 10.10.30.6:4001 y 172.60.60.152:50200/51200 agotan el plazo TCP;
PC/SC no detecta lectores en esta revision. No se envia consulta financiera.
Detalle y evidencia en QA_PIN_EXECUTION.md. Los apartados siguientes conservan
la cronologia anterior, incluida la interpretacion TCS ya corregida.

Actualizacion posterior 2026-10-14: el usuario cambia CMS a 10.10.10.21;
lectura SQL confirmada y snapshot local sincronizado. TCP con origen fijo
10.10.10.21:30964 conecta al host 172.60.60.152:6100 en 39 ms, sin recepcion
durante 8 segundos ni payload enviado. La IP deja de ser un pendiente.
Continuan el contrato/adaptador TCS y su intercambio de llaves. Ver
QA_PIN_EXECUTION.md y artifacts/cms-atm20524-origin-sync.json.

Actualizacion 2026-10-14: componentes CMS 2134/2135 comprobados en memoria;
su combinacion coincide con el KCV de la llave maestra de ATM20524 en SQL.
Perfil local e imagen 1054 vinculados como evidencia TCS; no son una llave
PIN del enlace ISO directo. TODO-DATA QA-TCS-WIRE-KEY-EXCHANGE: falta el
contrato/captura validada de arranque e intercambio TCS. Usuario no dispone
de Bin32 ni manual. CMS registra origen 10.10.10.244:30964 y cambio de llave
pendiente; PC actual 10.10.10.21. TCP al host ATM 6100 conecta sin payload.
Ver QA_PIN_EXECUTION.md para evidencia, diferencias de calendario y limites.

Decision posterior 2026-10-13: el usuario exige ingreso y cifrado de PIN nuevo
y descarta usar el PIN cifrado de una captura, incluso con EMV nuevo.
Revision de SmartVista en la sesion disponible confirma enlace 80131/16100
habilitado, pero no identifica una operacion de cifrado accesible al simulador.
La funcion de calendario original si esta localizada en
AccesoBase.ConsultoFechaContable; falta vincular su lote/estado efectivo,
no solicitar de nuevo una especificacion completa. Detalle de lo revisado
y limites en docs/implementation/QA_PIN_EXECUTION.md. No hubo envio financiero.

Actualizacion posterior Device keys 2026-10-13: se recibe evidencia SmartVista
de los dos enlaces PID 80131 y 82052, Key Length 32, formato PIN 01, PPK Index 1
y KCV conservado en configuracion privada; el usuario reporta igual bloque protegido en ambos. Se vincula
metadata a ATM20521 mediante qa-atm-evidence-bindings.json privado, sin claves
ni PIN, y Main muestra pendientes concretos de HSM/formato/secuencia-calendario.
No volver a afirmar que el usuario no configuro llaves en SmartVista ni pedir
esas capturas otra vez. El valor recibido no es una clave clara para el
cifrador local: falta integrar su uso mediante HSM/servicio QA y validar el
codigo 01. Vinculacion documental no habilita envio. Detalle y limites en
docs/implementation/QA_PIN_EXECUTION.md.

Revision posterior: el KCV se retira de IPC/pantalla. Se recupera de la
documentacion previa el endpoint HSM del .reg recibido; desde esta PC su
conexion agota el plazo. El original UNC falla por autenticacion (1326), sin
otra copia local .reg hallada. No pedir otro export como si nunca se hubiera
recibido; lo pendiente actual es acceso al origen y al runtime criptografico.

Avance posterior 2026-10-13: implementado proveedor concreto de consulta
con PIN nativo, cifrado TEST Windows protegido por DPAPI y primera AC desde
la sesion PC/SC vigente. Las fuentes ISO/EMV recibidas no se vuelven a pedir.
Se sustituyen los pendientes generales de implementacion por activacion
del primer perfil y vinculacion criptografica TEST local aprobada:
QA-LOCAL-TEST-BINDING, QA-EXECUTION-ACTIVATION. La PC no tiene actualmente
qa-execution-profiles.json ni qa-test-keys en userData. No se deduce una
clave usable de los exportes cifrados del host. La seguridad de tarjeta virtual
sin chip mantiene QA-VIRTUAL-CARD-SECURITY. Detalle, pruebas y limites en
docs/implementation/QA_PIN_EXECUTION.md. Los registros siguientes son
cronologicos; sus frases de "integracion pendiente" describen etapas previas.

Objetivo aclarado por el usuario: varios cajeros virtuales operables sin ATM
fisico; el real disponible sirve para validar inicialmente. Main ya inyecta
Router de contexto por perfil, sin dependencia de lector. Dos consultas
sinteticas de ATM independientes recorren builder/servicio/TCP local y reciben
0210/00. No son consultas financieras QA. Backend real PIN/EMV y perfiles
de tarjeta virtual siguen pendientes de integracion; no pedir otro cajero
fisico como solucion. Ver docs/implementation/MULTI_ATM_CONTEXT.md.

Aclaracion 2026-10-13: usuario no puede instalar SafeNet en la PC. No proponer
importar llaves/Registro del host. Opcion recomendada: puente autenticado QA
en el host que ya cifra, usando mecanismo recibido. El contrato WCF inspeccionado
no expone EncrytPinToZone y no se sustituye por ImportClearPIN/cambio de PIN.
Alternativa para validar recorrido real: consulta nueva desde ATM QA existente,
con observacion/correlacion. Detalle: docs/implementation/QA_REMOTE_PIN_OPTIONS.md.

Revision integral tras correccion del usuario, 2026-10-13: configuraciones
ISO, enlace, Registro HSM, parametros EMV, CDOL/IAC y fuentes DLL ya recibidos.
MsgFormatDotNet.Des.EncrytPinToZone llama a CCrypto2.EncryptPinToZone; hay un
mecanismo originador de cifrado en las fuentes aportadas. No pedir un generador
completo como si no se hubiese recibido. Electron no inyecta proveedor de
contexto, el lector no ejecuta GENERATE AC y QaPinCipher no tiene adaptador real:
son pendientes de implementacion/integracion, no ausencia general de configuracion.
ready=false del diagnostico local no consulta HSM ni prueba su desconfiguracion.
Se corrigen mensajes de disponibilidad, sin habilitar transporte. Revision y
pendientes concretos: docs/implementation/PROVIDED_CONFIGURATION_AUDIT.md.

Comprobacion posterior 2026-10-13 12:38 Ecuador, pedido de envio real:
la PC ya recibe 0800/071 del Switch en 16100, runId
49e9a06b-09e8-4ab6-a61b-fb3fa594141c; cero writes. La denegacion de 12:05/12:11
no describe esta conexion. Readiness sigue false por proveedor PIN/EMV,
secuencia/calendario y perfil; no se genera ni envia consulta financiera nueva.
Gestion recibida no certifica admision financiera o coexistencia persistente.
Detalle: docs/protocols/QA_SWITCH_LOGS_20261013.md.

Logs tcpcomms01.out y nwint00_24571.out del 2026-10-13 ya recibidos.
TCP confirma direccion PC 10.10.10.21 invalida en admision, puertos origen
54364/51944 a 12:05:17/12:11:27; cierre antes de la trama financiera.
El primer puerto coincide con intento local 49c58b04, cero bytes financieros.
SWITCH-ATM-ACCESS-CURRENT mantiene solo configuracion activa IP/device y
coexistencia con sesion ATM; no volver a pedir estos logs. NWINT muestra
retiro ATM20530/000133 por 82032 con 0210/00 y posterior reverso 0420/0430/00;
no corresponde a consulta ATM20521 ni acredita ruta CB 82052.
Lectura fisica 12:33 Ecuador confirma tarjeta 2267, CDOL/IAC; proveedor real
PIN/EMV/contexto sigue pendiente. Borrador nuevo preparado sin wire/envio.
Detalle, hashes y lineas: docs/protocols/QA_SWITCH_LOGS_20261013.md.

Prueba fisica 2026-10-13 11:55 Ecuador: tarjeta 2267 presente y leida con
CDOL1/CDOL2 e IAC, runId 50147b00-f616-4cc3-8bd5-ba7113643876. Ya no esta
bloqueada por presencia/parametros publicos del terminal. Inspeccion Main
ready=false porque sigue sin proveedor PIN/EMV/contexto; no se ejecuta
consulta financiera ni se repite captura. Diagnostico
55691c9e-4479-4f13-97c6-a4f15a3737fe. Detalle en EMV_TERMINAL_PARAMETERS.md.

Parametros solicitados ya recibidos, 2026-10-13: Registro 9F33=604020,
9F35=14, 9F40=EF80B05010; TAC_DENIAL no encontrado. No volver a pedir esos
valores ni exigir crear TAC_DENIAL. Regla de TAC ausente de EMV Book 3 10.7
implementada, con analisis online-only que respeta IAC-Denial del chip.
READ RECORD obtiene ahora IAC 9F0E/9F0F/9F0D. Perfil privado actualizado,
sin habilitar proveedor financiero. Prueba fisica 11:17 Ecuador: tarjeta
no presente, cero APDU/envios. Detalle y limites en EMV_TERMINAL_PARAMETERS.md.

Busqueda de Registro recibida el 2026-10-13: adjunto /reg:32 con 142 claves,
141 bajo DATADICT y una raiz del componente en
HKLM/SOFTWARE/Wincor Nixdorf/ProTopas/CurrentVersion/EmvDebitCreditFW.
Texto pegado /reg:64 confirma la vista fisica WOW6432Node de esa misma rama.
Ubicacion resuelta: no volver a solicitar busqueda global ni ruta del componente.
La salida no contiene lineas REG_SZ/REG_BINARY/REG_DWORD ni parametros del
terminal; no acredita sus valores efectivos. Consulta siguiente acotada a
TERMINAL_PROPERTIES/TAGS, valores 9F33, 9F35 y 9F40, y TAC_DENIAL en
TERMINAL_PROPERTIES, si existen. Son nombres derivados del INA y del perfil;
existencia de esas subclaves/valores sigue pendiente de comprobacion. No
consultar/exportar DATADICT completo, tags PAN/Track/PIN ni todas las ramas.

Precision de alcance del 2026-10-13: emular la consulta ATM no requiere copiar
todo el software/perifericos Diebold. El simulador debe implementar lectura y
procesamiento EMV, seguridad PIN y mensajes del perfil QA. emvdecre.ina/BAT,
seleccion Diebold 91x y CDOL de tarjeta 2267 ya estan recibidos; no solicitar
otra vez "EMV de la terminal" como entregable completo. GENERATE AC, TVR/CVM
y proveedor de contexto siguen siendo implementacion pendiente. Para adoptar
exactamente el perfil del terminal, confirmar solo parametros no presentes
en el fragmento (por ejemplo 9F33, 9F35 y, si aplica al perfil, 9F40/TAC_DENIAL)
en configuracion efectiva de EMVDEBITCREDITFW. TVR no es una constante a pedir
del cajero: se calcula en cada operacion. No inventar valores ni convertir la
ausencia de estos parametros en una solicitud de reinstalacion/imagenes.

Seleccion de tarjeta resuelta: el usuario elige reinsertar 2267. Lectura
fisica posterior 2026-10-12 18:24:41-48 Ecuador confirma PAN enmascarado
terminado en 2267, AID A0000000031010 y CDOL1/CDOL2 obtenidos del chip.
Reporte c85c288e-feb7-4dbd-a8ab-f4c425d29946. Ya no se solicita seleccionar
tarjeta ni aportar esas listas. Se mantienen solo los pendientes reales de
procesamiento/generacion EMV, cifrador PIN TEST y contexto ATM. Esta lectura
no ejecuta GENERATE AC ni verifica PIN y no envia una consulta financiera.

Implementacion adicional 2026-10-12 18:14 Ecuador: el lector obtiene CDOL1 y
CDOL2 directamente del chip y devuelve solo tags/longitudes, sin valores
transaccionales. No se solicitan como archivos del cajero. Prueba fisica READ
exitosa, runId d00384a2-3db3-4cc5-b821-50159c313374: tarjeta conectada termina
en 0663, diferente de 2267 usada en replay anterior. Esa seleccion se resuelve
con relectura posterior de 2267; no reutilizar PIN/perfil de otra tarjeta.
Se conservan los pendientes concretos de TVR/CVM del terminal, generacion AC,
proveedor PIN TEST y contexto ATM. Adaptador actualizado y pruebas unitarias/
integracion cubren requisitos, ausencias y datos invalidos. No se envia un
replay financiero para sustituir esta prueba. Ver EMV_IDENTITY_READING.md.

Nueva evidencia posterior del usuario: monitor 18:00:45.130 muestra Ret=5,
motivo 1136: Error No definido para consulta/card 2267. Catalogo SQL recibido
y SELECT propio confirman RetCode 11136 = ATC Duplicado, TAGs Counters,
Visa/Banred/MasterCard/ATM=5; 1136 no existe en ese catalogo. La diferencia de
codigo y F39=96 recibido por TCP no se normaliza ni corrige por inferencia.
Hora/operacion/tarjeta compatibles con el replay de 18:00, sin STAN/UTRNNO
en captura para correlacion completa. Evitar repetir esa seguridad capturada
como solucion de trx nueva: corresponde implementar seguridad fresca del chip.
No ejecutar UPDATE de RetCode 51 mostrado en imagen; no se cambian contadores
ni se deshabilita unicidad. TODO-DATA CB-96-TRANSLATION: log/identificadores
que unan validacion ATC, codigo interno y respuesta de red. Detalle SQL y
alcance de evidencias en BALANCE_EXECUTION.md.

Prueba tras recibir INA/BAT Diebold: perfil parcial privado guardado sin
activar operaciones nuevas. C:/ProTopas no disponible en esta estacion;
parametros efectivos del Registro del cajero siguen pendientes. Una sola
reproduccion autorizada, 2026-10-12 18:00:44.720 Ecuador, runId
6ab37704-6c24-4e38-b3e2-eab06b59b46e, recibe 0210/F39=96 sin F54.
PROXY205 registra request/response actuales; SQL no registra nuevo 301000
para ATM20521. En la ventana CMS 310030 registra 31580494/31580495, 8908,
sin correlacion demostrada con esta consulta. Se comprueba cfg W vigente;
no se aplica el BAT ni se cambia BD/Registro. 47 pruebas locales pasan.
Detalle y limitaciones en BALANCE_EXECUTION.md.

Correccion EMV del 2026-10-12: el usuario confirma cajero Diebold y aporta
captura de Application Configuration Utility, Home > EMV, con Vendor Protocol
Diebold 91x y boton Export. Esto reemplaza la suposicion de runtime NCR: no
buscar NCR/APTRA/EMV EXITS ni aplicar sus tablas al Diebold sin validar mapeo.
El TXT recibido 205_NCR6848_Multi_Dip.txt contiene EMV1/EMV4/EMV5 y coincide
con Y:/ExtremePCI/Imagenes/2020/CB CALIDAD/205_NCR6848_Multi_Dip.txt, pero sigue
siendo fuente NCR de referencia, sin vinculo probado con este terminal 91x.
No se pide reenviar ese TXT. TODO-DATA DIEBOLD-91X-EMV-PROFILE: export de la
configuracion mostrada en ACU, producto/version y parametros EMV efectivos
del terminal QA (descarga del host si no estan incluidos en el export).
La captura confirma seleccion de protocolo, no AID/TAC/capacidades/CDOL ni
perfil completo. CARD-TRANSACTION-SECURITY conserva implementacion del dialogo
transaccional del chip y proveedor PIN TEST. Ver BALANCE_EXECUTION.md.

Nueva evidencia Diebold del 2026-10-12: recibido texto y captura de
emvdecre.ina con marcador de archivo 4.1.0-210326-10-1a948234-68adbf54.
TAC_ONLINE/TAC_DEFAULT son cinco bytes FF; DEFAULT_TDOL contiene seis entradas;
tags locales 9F1D=00, 9F53=5A, 9F39=05. NUMBER_OF_SUPPORTED_AID=0 y ausencia
de secciones AID describen este fragmento, no demuestran que el terminal
activo carezca de aplicaciones ni la causa del F39=96. No cambiar ese contador
por inferencia ni usar TDOL como CDOL. Se conserva fuente privada y revision
offline; configuracion efectiva pendiente. BAT ya recibido y ubicado por la
captura en C:/ProTopas/Conf/EMV/emvdecre.bat: kconv emvdecre.ina seguido de
ccrcconv emvdecre.rck -t EMVDEBITCREDITFW -U. El usuario indica que no hay mas
archivos; RCK se genera en ese recorrido, no volver a solicitarlo ni ejecutarlo
para obtener evidencia. Destino logico EMVDEBITCREDITFW confirmado por argumento;
ruta fisica de Registro no probada. Siguiente comprobacion acotada: buscar
solo nombres de claves EMVDEBITCREDITFW en HKLM/SOFTWARE, vistas 32/64, en el
cajero fisico QA. No ejecutar BAT ni importar Registro. Marcadores de archivo
no identifican version del kernel ni demuestran aplicacion en runtime.

Revision runtime de Mediator confirmada por el usuario: W apunta a
172.60.60.156/e$, Y a host ATM 172.60.60.152/e$. El cfg de W usa
CAuth.SendMediator (existente); la incompatibilidad hallada entre cfg de
Y y DLL Mediator no describe el cfg de W. Esa propuesta no se despliega.
Se aplica correccion autorizada del unico destino OnError inexistente:
paso 008, 0121 -> 012 (NotificarSMS), conservando validaciones y respaldo
fechado. XML, metodos y referencias verificados. La prueba de 16:48:18
Ecuador, runId e0e41301-165b-4a34-aca7-e504cb4384e1, sigue recibiendo
F39=96. Llegada a PROXY205 comprobada; no hay nueva consulta de saldo
301000 en SQL. Dos consultas CMS 310030 en esa ventana devuelven 8908;
su correlacion con el replay sigue pendiente. La correccion no demuestra
resolver el 96 ni habilita generacion EMV. Detalle en BALANCE_EXECUTION.md.

Revision de Mediator y llaves recibidas el 2026-10-12: .reg inspeccionado
sin importar Registro ni mostrar/usar valores de llaves. Seccion 428150205
presente; referencias HSM y configuracion recibidas, contrato/formato TEST y
perfil EMV siguen pendientes. DotNet.rar contiene ahora las cuatro DLL
del flujo DebitoConecta, ExtremeICryptoSwitchPCI e IProcesaClaves.
Incompatibilidad encontrada: paso 010 pide CSendCore.SendMediator, ausente
en la DLL canonica; existe SendTransaccion. Se entrega candidato local que
cambia solo ese metodo, con XML y disponibilidad de metodos verificados,
sin desplegarlo. TODO-DATA MEDIATOR-FLOW-VERSION: validar versiones/cfg
cargados y comportamiento del metodo antes de cambiar servidor. PROXY205
llama AUTHTD y el mapa canonico de BIN usa fallback 999999 al cfg recibido.
No se prueba que este conflicto causara el 96 sin log correlacionado.
Detalle y candidato en docs/implementation/BALANCE_EXECUTION.md.

Actualizacion del 2026-10-12 15:57 Ecuador: DebitoConecta_999999.cfg recibido
y decodificado como XML Base64; identifica ValidarCryptoGrafia (paso 004) y
SendMediator (010), pero no origina PIN/EMV. Vinculo runtime del cfg y modulos
pendiente (DEBITO-CONFIG-RUNTIME), sin modificarlo ni ejecutar sus pasos.
Nueva reproduccion real QA autorizada, runId d0a39870-baea-44dc-9cd5-4fb3b2530eef,
recibe 0210/F39=96 sin F54. SQL no muestra una nueva consulta 301000 de
ATM20521; en esa ventana registra CMS 310030/canal 21, TraceId 31580490/31580491,
con otros identificadores. Falta correlacion para atribuirlos al replay y
determinar el origen del 96 (CB-96-CURRENT-SWITCH-LOG). La prueba de 15:31
recibio 00 y TraceId 31580488 aprobado; no se generaliza el fallo de 13:19 a
las ventanas posteriores. Detalle en CB_205_BALANCE_SAMPLE.md e ISOBASEI_REVIEW.md.

Diagnostico de llegada al Core, 2026-10-12: los nuevos logs correlacionan
las dos consultas de 13:19 con UTRNNO 262851819241039480 y
262851819568813530. TXROUT devuelve destino 999 / SVT_FRAUD_PID=999;
NWINT registra NETWORK LINE DOWN, denial code 802 y RESP=802/RESPCODE=91.
El rechazo actual se produce en esa etapa del Switch; no corresponde al
8908 historico de Mediator. PID 999 (10.60.0.20:2223) y enlace CB 82052
(172.60.60.156:49212) tienen conexiones abortadas. TODO-DATA
CB-CURRENT-SWITCH-LINKS: conectividad desde Switch, listeners y logs de
ambos servicios, mas txrout para validar politica/seleccion de fraude.
No sustituir 999 por 82052 ni deshabilitar fraude por inferencia. Detalle,
hashes y lineas en docs/protocols/CB_205_BALANCE_SAMPLE.md. Estas fuentes
resuelven la localizacion del rechazo actual, no los STAN 008101-008103
del 8 de octubre ni el proveedor PIN/EMV de una consulta nueva.

Actualizacion de implementacion del 2026-10-12: builder mecanico CB/QA/ahorros,
parser F54, orquestador, IPC, transporte y diario entregados. No hay proveedor
real de contexto/seguridad inyectado en Electron; la tarjeta presente y un PIN
facilitado no desbloquean ese contrato. Ver `docs/implementation/BALANCE_EXECUTION.md`.

- **TODO-DATA CB-SEQUENCE-CONTRACT**: implementar un adaptador QA autorizado
  para reserva/unicidad/reinicio de STAN y calendarios/zona del host.
  Correccion tras revisar GenerarTransaccion y el archivo activo: la secuencia
  empieza en Param.Serial; GrabaAutoTran=N conserva ese serial y no requiere
  sp_DebGetNextSeq. La decision esta implementada en selectCoonectaSequence.
  La conexion SQL existente, confirmada por el usuario como compartida QA/PREPROD,
  permite inspeccion de las 14 bases de aplicacion visibles; el SP no se encontro
  alli. No se sustituye por otro procedimiento de secuencias. Falta la reserva
  del serial ATM para esta instancia y calendarios; el SP solo bloquea su rama.
  Bloquea solo adquisicion del contexto financiero real, no builder ni pruebas.
- **TODO-DATA HSM-QA-PROVIDER**: falta contrato del generador/cifrado PIN de TEST,
  perfil EMV transaccional y asociacion a la tarjeta/cuenta. La inspeccion adicional
  de Extreme.ISeguridad/Seguridad/CBusSeguridad confirma interfaces de usuarios y
  permisos; SeguridadWcf no queda identificado como proveedor de PIN financiero.
  ATMIso8583 consume PinTrasladado; ValidacionPinLocal2018 valida PIN/ARQC recibidos.
  Estos consumidores no completan el origen de seguridad de una consulta nueva.
  ExtremeTools.CryptoTool.AnsiPinEncrypt aporta ahora preparacion mecanica PAN/PIN,
  implementada offline por LegacyQaPinEncryption con puerto QaPinCipher; no hay
  cifrador TEST configurado. ExtremeICryptoCMS.dll, referenciada por ATMIso8583,
  no esta en los tres RAR ni en Y:/ExtremePCI (busqueda sin errores de lectura).
  Revision directa de SRVPIN.XML/EXTBASE.config aportados el 2026-10-12 confirma
  ValidacionPinLocal2018.CIEMVAll_PADSS. CCryptoService.ValidaPinCard aparece
  en ValidaPinConCedula; no es un generador F52. No solicitar la DLL como
  requisito general ni pedir nuevamente esas configuraciones. Falta el contrato
  del mecanismo TEST que origina PIN cifrado y perfil kernel EMV.
  Lista exacta de entregables en docs/implementation/BALANCE_EXECUTION.md.
  El usuario indica que no conoce ese componente. No inferir un algoritmo, usar
  certificados privados de la imagen o reemplazar seguridad por la de un PCAP.
  SRVPIN.XML recibido ademas tiene atributo Debug sin signo igual; validar la
  configuracion activa sin atribuirle el 91/96. Bloquea solo su adaptador.

- **TODO-DATA BALANCE-RESPONSE-CONTRACT** (2026-10-12): el codec acotado
  inspecciona 0210/F39 y ahora decodifica/proyecta F54 con etiquetas neutrales.
  ATMIso8583.GetSaldos aporta layout de registros de 20 caracteres, signo y
  escala /100, contrastados offline con F54 del frame 224 CB. Ya no falta
  una fuente del layout; faltan aprobacion de perfil, semantica y variantes.
  Aprobar estructura, tipos/unidades, cuenta/moneda y significado de saldo
  total/disponible en la respuesta ATM, con correspondencia a CMS cuando aplique.
  No inferir el layout por un estandar generico ni igualar F39 con RetCode o
  MappedRespCode. Bloquea solo interpretacion/validacion del saldo y resultado,
  sin impedir configuracion, revision ni reconstruccion offline. Ver
  `docs/transactions/BALANCE_INQUIRY.md` para el diagnostico actualizado del envio.

- **TODO-DATA ATM-IMAGE-ACTIVE-PROFILE** (2026-10-12): recibidos guion NCR,
  configuraciones, diccionarios y modulos del host ATM en imagen cajero.
  Usuario confirma copias sin fecha activas y fechadas backup: seleccion y
  hashes implementados/verificados; no se vuelve a pedir identificar backups.
  EXTBASE/EXTBASEATM tienen roles/configuraciones diferentes y se conservan
  separados; faltan perfil de la instancia y entradas TRAN de BD. La leyenda de buffers no coincide
  literalmente con todas las tablas de cuenta. Bloquea solo adoptar ese perfil
  para ejecucion. Builder aporta reglas F3/F7/F11/F12/F13/F15/F37; secuencia y
  seguridad nueva siguen pendientes. Ver `docs/protocols/ISOBASEI_REVIEW.md`.

- **TODO-DATA AUTOMATIC-FRAME-GENERATOR** (2026-10-11): configuracion QA y preparacion
  de planes desde la UI implementadas sin envios. Falta aprobar el mapeo de entradas
  y reglas dinamicas de una transaccion nueva, vinculacion cuenta/tarjeta y seguridad
  PIN/EMV. ISOBASEI y la consulta capturada ya estan recibidos; no se solicitan de nuevo.
  Bloquea solo generacion/transmision, no configuracion ni revision offline. Ver
  `docs/implementation/SEND_CONFIGURATION.md`.

Correccion CMS (2026-10-08): campos completos y variantes de nombre reconocidos
en el observador; revision de presencia/tipos para saldo y retiro, con 26
mandatorios request y 21 response, valores protegidos y UTF-8. No existen
emisor XML CMS ni conversiones inventadas de tipos/nombres en el recorrido
financiero. CMS-XML-CONTRACT mantiene pendientes la serializacion de salida,
tipos contradictorios y reglas por resultado; CB-96-SWITCH-LOG permanece abierto.
Ver `docs/implementation/MEDIATOR_OBSERVER.md`.

Revision PCAP/envios/nwint (2026-10-08): cuatro consultas transmitidas y tres
preparaciones sin envio. STAN 007923 recibe 91; 008101/008102/008103 reciben
96 y difieren solo en F11, con fechas/RRN/seguridad capturados conservados.
El nwint adjunto registra otros PID (82262/280120), sin los STAN de los
intentos ni PID 80131/82052 en sus encabezados. TODO-DATA CB-96-SWITCH-LOG:
log correlacionado de ese proceso/recorrido y relojes/UTRNNO para localizar
el 96. No inferir causas ni reglas dinamicas. Detalle y revision reproducible:
`docs/protocols/CB_205_BALANCE_SAMPLE.md`.

Estado actual CB 205 (2026-10-08): recibida captura de consulta y retiro con
ambos enlaces 16100/49212 y pares XML. Consulta reconstruida y enviada una vez
desde la PC: 0210/F39 91; llegada a SmartVista y Mediator confirmada por el
usuario. TraceId 31580471 devuelve RetCode 8908, WS, PROCESADOR NO RESPONDE,
MappedRespCode 10096. No falta volver a demostrar apertura TCP ni aportar
otra muestra de consulta CB. El log adicional muestra una espera AUTHTD/AUTHTD
de 15.001 segundos (13:04:37.544-13:04:52.545), RC=8908.
Emisor identificado: PROXY205 en Mediator 172.60.60.156. AUTHTD registra la
transaccion vencida y EXTREMELOG un error de recepcion del WS a las 13:04:59.716.
TODO-DATA CB-PROCESSOR-ERROR: configuracion/ruta AUTHTD y evento WS completo
con StackTrace/InnerException/entidad para correlacionar con ADPCOREGEN/Core.
El adjunto ClearDeamonNet tiene cuatro claves ausentes, sin vinculo probado
con la consulta; no sustituye el stack del error WS.
Faltan UTRNNO nuevo y confirmacion de relojes, reglas de generacion de nuevos
mensajes, PIN/HSM/EMV y sesiones prolongadas/coexistencia. Ver
`docs/protocols/CB_205_BALANCE_SAMPLE.md`. Las notas de admision siguientes
corresponden a ventanas anteriores; esta actualizacion prevalece para consulta CB.

Actualizacion de gestion ATM QA (2026-10-08 17:12:32 UTC): la PC ya recibe
0800 / codigo 071 / STAN 481360, 60 bytes completos, sin transmitir. Las
capturas anteriores contienen 072 y no contienen 0810. La denegacion por
direccion registrada antes es historica; en esa revision faltaba sesion
financiera/coexistencia, no
demostrar otra vez apertura TCP. Ver `docs/protocols/VISA_NETWORK_MANAGEMENT.md`.

Los logs posteriores entregados por el usuario confirman autorizacion de la PC
y asociacion al PID 80131 en ese intento. El cierre fue observado como recv=0,
coherente con el probe que cierra tras el primer frame, antes del timer de 30 s.
El balanceador 172.60.60.171 es rechazado 713 veces en la ventana 12:00-12:26;
falta coexistencia/configuracion de prueba, no identificar nuevamente el PID.
Hasta esa revision no se habia enviado request financiero; sigue pendiente
una regla F39 para la respuesta de gestion 071.

- **TODO-DATA VISA-NETWORK-RESPONSE-POLICY / VISA-NETWORK-RESPONSE-WIRE**: construccion offline 0810 implementada con F39 obligatorio, sin default ni respuesta automatica. El modulo proveedor asigna NetResponse, no fija 00. Usuario no conoce la regla para 072; la solicitud actual es 071. Faltan significado/politica de ambos codigos, par real y criterio de sesion lista. Bloquea solo respuesta automatica y veredicto de sesion, sin impedir inspeccion ni diagnostico TCP.

Actualizacion de fuente ATM Coonecta (2026-10-08): SWATM01 en ADQCLONE
172.60.60.152 usa PKT_VISA / ISO8583MsgFormat y el archivo
E:\ExtremePCI\configfiles\ISOBASEI.BIN; inicia CALL a SmartVista 16100.
172.60.60.171 fue corregido por el usuario como balanceador. PROXY205 en
Mediator 172.60.60.156 muestra LISTEN con parametros 10.60.0.11 / 49212.
ISOBASEI.bin recibido e inspeccionado: 12 campos de cabecera, 128 posiciones,
27 MTI y encoding BCD/EBCDIC/BINARY contrastado con el modulo de formato.
Falta validar detalles wire y comprobar el camino de salida/coexistencia
antes de ejecutar desde ADQCLONE. Ver `docs/protocols/ISOBASEI_REVIEW.md` y
`docs/implementation/SWITCH_NETWORK_EVIDENCE.md`.

- **TODO-DATA ISO-SPEC**: recibidos ContextoISO.xml de BANRED e ISOBASEI.bin de SWATM01 Coonecta. Inspector offline lee todos los registros de ISOBASEI y excluye defaults; encoding contrastado con GetStrType del formatter. Consulta CB valida cabecera, bitmap y longitudes/prefijos de sus campos; faltan otros perfiles, reglas dinamicas, PIN/HSM y negocio. No falta recibir otra vez el diccionario ni la muestra de consulta. Ver `docs/protocols/ISOBASEI_REVIEW.md` y `docs/protocols/CB_205_BALANCE_SAMPLE.md`.
- **TODO-DATA CMS-ATM-MAPPING / CMS-XML-CONTRACT / CMS-RESULT-MAPPING**: recibido Extreme Mediator CMS v3.6 para XML/REST Mediator-Core. Falta validar su correspondencia con ATM, las diferencias tablas/ejemplos y los codigos por canal; no sustituye ISO-SPEC. Conflictos y solicitudes registrados en `docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md`.
- **TODO-DATA CMS-REVERSAL / CMS-CORRELATION / CMS-TRANSPORT / CMS-POS-MAPPING**: el manual lista familias MTI y campos Core, pero faltan la seleccion del reverso, reglas de correlacion, contrato REST y resolucion de diferencias POS. Bloquean solo sus adaptadores/reglas dependientes.
- **TODO-DATA SWITCH-ATM-ACCESS / SWITCH-ATM-FRAMING / CMS-TRANSPORT**: entrada ATM y enlace Mediator recibidos; consulta desde PC confirmada hasta Mediator. Faltan sesiones prolongadas/coexistencia, perfiles ISO generales, TLS/timeouts/conexiones y contrato HTTP/XML/unidad del timeout Core 20000. RetCode 8908 requiere log del procesador para precisar su causa. Ver `docs/core/MEDIATOR_ENTITY_205_ROUTING.md`; el perfil SQL PREPROD existente no cambia.
- **TODO-DATA GOLDEN-SAMPLES / PCAP-CASE-MAPPING**: recibidos diez PCAP, con 218 envolventes BANRED reconstruidas byte a byte. Falta identificar/aprobar request/response de cada flujo MVP y correlacionar originales/reversos. Bloquea validacion de campos, codigos de respuesta y resultados de negocio. Ver `docs/protocols/PCAP_REVIEW.md`.
- **TODO-DATA PCAP-LINK-PROFILES**: BE16 inclusivo/header/bitmap confirmados solo para enlace capturado 4946. Usuario identifico roles/QA de enlaces actuales 16100 y 49212; no certifica el perfil de sus PCAP. Persisten framing/diccionario, validacion de capturas completas y explicacion de solapamientos. No se aplica 4946 automaticamente a ATM.
- **TODO-DATA ENVIRONMENT**: entrada ATM QA, autorizacion en PID 80131 y consulta desde PC confirmadas hasta Mediator. Faltan sesiones prolongadas/coexistencia, otros perfiles, TLS, limites y timeouts por escenario. PREPROD tiene configuracion independiente. Bloquea solo los transportes/envios dependientes.
- **TODO-DATA PROFILES**: faltan ATM y tarjeta completos/validados. Bloquea configurar ejecuciones reales; el shell desktop y la seleccion de ambiente funcionan de forma independiente.
- **TODO-DATA AMOUNT-RULES**: faltan moneda, limites, monto minimo/maximo, denominaciones y reglas por cuenta/escenario para retirar. El borrador solo valida la sintaxis decimal del manual; no aprueba elegibilidad financiera.
- **TODO-DATA ENTITY-CLASSIFICATION**: ENTITY_MODEL propone red/membresia separadas y ENTITY_TEMPLATE mezcla FRONT/BACK/EXTERNA/BANRED como Tipo. Se solicito validacion; el CRUD usa los campos comunes y difiere membresia, BIN/Core y deteccion automatica de escenarios.
- **TODO-DATA HARDWARE / CARD-IDENTITY-APDU / CARD-TRANSACTION-SECURITY**: OMNIKEY 5422 detectado en Windows, ambas interfaces con tarjeta presente y ATR. Lectura manual por contacto y guardado QA de referencia implementados; el inventario conserva alias, ultimos cuatro, AID y fecha, no datos de autenticacion. Faltan otros PDOL/perfiles/contactless, asociacion de cuenta y proveedor PIN/HSM/EMV dinamico; identidad guardada no habilita envio financiero. Ver `docs/implementation/CARD_READER_STATUS.md` y ADR-018.
- **TODO-DATA OBSERVERS**: faltan SQL/API y reglas de correlacion aprobadas de SmartVista/Core. Consulta Journal/Message aportada por el usuario e implementada para Mediator; no completa validacion de resultados ni SmartVista.
- **TODO-DATA MEDIATOR-OBSERVER-ACCESS / MEDIATOR-JOURNAL-CORRELATION**: Historial mantiene consulta acotada PREPROD por TraceId y exige cuenta de lectura/TLS validado. Inicio tiene una excepción explícita del usuario para consultar el mismo Mediator desde QA/PREPROD con la credencial existente: SELECT fijo, TLS cifrado sin validar certificado. La lectura real de 50 filas pasó el 2026-10-26; faltan mínimo privilegio permanente, mapeo entidad/canal y correlación con ISO/runId/transactionId. Ver `docs/implementation/MEDIATOR_OBSERVER.md` y ADR-009.
- **TODO-DATA MEDIATOR-SQL-TIMEZONE / MEDIATOR-MESSAGE-PROJECTION**: confirmar zona de fechas SQL y aprobar allowlist de valores XML visibles. La consulta conserva hora SQL sin inferir UTC y protege todos los valores XML.
- **TODO-DATA DASHBOARD-SWITCH-LIVE-FEED**: Inicio consulta en QA y PREPROD las 50 filas más recientes de MDT_Journal/MDT_Message para entidad 205/canal 1. `jnlCardNumber` se observó como 32 caracteres hexadecimales en las 50 filas; se muestra una referencia SHA-256 abreviada, nunca los últimos dígitos del valor protegido. Falta confirmar si esa referencia identifica una tarjeta de forma estable entre todas las sesiones, cobertura de ATM/POS, mapeo RetCode/TrnCode y zona SQL. Polling no garantiza captura completa bajo alto volumen. Ver `docs/implementation/DASHBOARD_LIVE_FEED.md`.
- **TODO-DATA LOAD-LIMITS / QA-CARD-POOL-INTEGRATION**: el usuario reporta un techo actual de 5 TPS y confirma que existe un pool virtual QA autorizado. El generador local solo crea referencias VISA opacas para UI; no representa el pool. La ejecucion sigue bloqueada hasta conocer la API/SDK/servicio aprobado y confirmar PIN/EMV dinamicos; faltan tambien ventana, concurrencia, maximo de operaciones/duracion, politica de parada y motor de carga. El techo local de 5 TPS es provisional y no valida capacidad ni aprobacion formal. Ver [carga y estres](implementation/LOAD_TEST.md).

La documentacion describe los flujos, pero no aporta evidencia suficiente para ejecutarlos.

Actualizacion de acceso ATM QA (2026-10-07): TCP 16100 ya conecta desde la PC,
pero el extremo responde NO AUTHORIZATION y cierra incluso sin enviar trama.
En ese momento SWITCH-ATM-ACCESS quedo pendiente de autorizacion/asociacion al PID. El bloque
del servidor aportado el 2026-10-08 confirma origen 10.10.10.21 y cierre por
direccion invalida tras find_device_using_address; ya no falta identificar el
peer visto. No es un bloqueo de apertura TCP general. El usuario no encuentra
el intento de captura en los monitores. Ver `docs/implementation/QA_CAPTURE_REPLAY.md`.

Nueva evidencia VCP Lite 450 Diebold: PCAP y 39 logs de 11:00-12:00. El log VISA
lee cuatro bytes de cabecera e ignora la longitud configurada; 262 envolventes
de 16100 se reconstruyen sin residuo. Se localiza retiro USD 20, STAN 001391,
y dos reversos emparejados con sus originales. ISO-SPEC permanece pendiente.
Los logs enrutan al PID 82032; la asociacion inicial con Mediator 49212 fue
corregida el 2026-10-08: 82032 figura en 49276 y el usuario confirma CB 205 como
82052 / 49212. Ese PCAP no contiene payload financiero en 49212. El bloque
horario de nuestra denegacion ya fue recibido y confirma rechazo por direccion.
La muestra ATM propia de CB fue recibida despues; consulta probada desde PC
y error del procesador documentados en `docs/protocols/CB_205_BALANCE_SAMPLE.md`.
El retiro no se envio. Ver `docs/protocols/VCP_LITE_450_REVIEW.md` y
`docs/protocols/QA_SWITCH_ADMISSION_REVIEW.md`.
El manual recibido aporta reglas parciales de Mediator/Core: no se considera trama ATM ni mock aprobado.
Ver `docs/implementation/BOOTSTRAP.md` para el alcance ya implementado.
El CRUD local de entidades/ATM funciona con configuracion en borrador; no completa ni valida automaticamente los items del checklist. Ver `docs/implementation/LOCAL_CATALOGS.md`.

## Checklist de desarrollo completado

Estos checks registran implementacion local. Los checks P0/P1 siguientes son
datos/evidencia externos y solo se marcaran al recibirlos y validarlos.

- [x] Shell Electron seguro, TypeScript strict y navegacion.
- [x] Adaptador PC/SC Windows fuera del Renderer, estado/ATR de lector en Dashboard/Tarjetas, simulacion CI explicita y prueba fisica de presencia. Lectura manual de identidad EMV de contacto con PAN enmascarado verificada fisicamente; otros perfiles/contactless y seguridad transaccional pendientes.
- [x] Codec acotado de consulta VISA 301000 capturada, reconstruccion exacta, metadatos protegidos y pruebas TCP locales; intento unico QA confirmado hasta Mediator con error del procesador documentado. Generacion de nuevos mensajes pendiente.
- [x] Codec acotado de gestion VISA 071/072 y construccion offline 0810 con F39 explicito; probe QA solo lectura con UUID/UTC/STAN, limites y errores protegidos. Politica de respuesta/sesion real pendiente.
- [x] Seleccion QA/PREPROD persistida y auditoria de cambios; PROD bloqueado.
- [x] CRUD de entidades/ATM en SQLite mediante Worker, con version y auditoria.
- [x] Revision del mockup y matriz de evidencia CMS para las cinco transacciones.
- [x] Catalogo de saldo/retiro CMS por ahorros/corriente con fuente y pagina.
- [x] Pantalla de preparacion con los cuatro pasos y tres paneles del mockup.
- [x] Seleccion ATM del ambiente y revision en Main de version/estado/entidad.
- [x] Validacion de entradas y monto decimal de borrador, sin almacenar tarjeta.
- [x] Contexto invalidado al cambiar ambiente, editar o recargar perfiles.
- [x] Estados vacios y envio/RAW/HEX/reversos bloqueados por evidencia pendiente.
- [x] Plantillas documentales por cuenta y requisitos de monto/original visibles al seleccionar el flujo.
- [x] Feedback de monto en vivo y checklist de entradas locales separado de evidencia pendiente.
- [x] Resumen de revision desde Main con UUID/UTC; invalidado al editar contexto.
- [x] Borrador conservado al navegar en la sesion y boton Limpiar borrador.
- [x] Casos DRAFT persistentes QA/PREPROD, referencias documentales, carga con revalidacion ATM, borrado/auditoria y migracion SQLite v1 -> v2.
- [x] Conexion autenticada e inspeccion de metadatos de Mediator PREPROD, con excepcion TLS puntual autorizada.
- [x] Compatibilidad de Terminal ID/codigo en revision Main, sin truncado ni extrapolar el esquema a QA.
- [x] Credencial pass.txt y artefactos privados excluidos de Git; sin acceso desde Renderer.
- [x] Inventario de los diez PCAP, hashes y reporte sanitizado; originales excluidos de Git.
- [x] Framing incremental BE16 inclusivo y codec de envolvente BANRED con bitmap de 128 bits.
- [x] Reconstruccion offline byte a byte de 218 mensajes; errores de longitud/fuente incompleta controlados.
- [x] Vista de evidencia de capturas en transacciones sin exponer campos, RAW ni endpoints.
- [x] Composicion visual del mockup compactada: navegacion, cabecera, pasos/recorrido, inspector tabular e historial/metricas.
- [x] Requisitos/CMS/PCAP separados del area de operacion; estados reales y codigos del manual conservados.
- [x] Historial con filtros parametrizados Journal/Message PREPROD, bigint como string, limites, errores/timeout y estructura XML protegida fuera del Renderer; acceso real pendiente de TLS/cuenta.
- [x] Configuracion muestra evidencia privada de red por ambiente, con destino ATM/PID/peer y pendientes; Main valida archivo acotado, sin sockets ni habilitar envio.
- [x] Puerto/emisor de captura QA con un write tras conectar, validacion, deadlines, cierre y metricas sin contenido; pruebas TCP locales. No habilita envio general ni genera campos ISO. Ver `docs/implementation/QA_CAPTURE_REPLAY.md`.
- [x] Envolvente VISA VCP Lite implementada fuera del Renderer: cuatro bytes, cuerpo BE16, extension opaca, fragmentacion y fuente truncada; 262 frames reconstruidos identicos. Caso USD 20 / STAN 001391 preparado offline conservando campos originales; admision de PC y generacion ISO pendientes.

Detalle y pruebas: `docs/implementation/TRANSACTION_PREPARATION.md`.

## P0 - Bloqueante para primer flujo real

- [x] `ContextoISO.xml` recibido en Simulador Banred; alcance legacy BANRED. Correspondencia con ATM 16100 pendiente.
- [x] `ISOBASEI.bin` de SWATM01 Coonecta recibido y sus secciones/parametros inspeccionados offline; validacion wire/casos pendiente.
- [ ] Especificacion ISO ATM Coonecta.
- [ ] Trama consulta saldo request/response aprobada.
- [x] PCAP consulta saldo CB 205 recibido y contrastado con ISOBASEI; consulta nueva/perfil aprobado pendientes.
- [ ] Trama retiro aprobado request/response validada como fixture ejecutable; muestra CB 205 recibida.
- [x] PCAP retiro aprobado CB 205 recibido; no se envio retiro desde el simulador.
- [ ] Trama retiro rechazado request/response.
- [ ] Trama reverso request/response + original.
- [ ] PCAP reverso.
- [ ] Evidencia timeout + reverso.
- [x] Host/puerto de entrada ATM QA aportado con PID/netstat; acceso desde PC y perfil/escenarios pendientes.
- [ ] Host/puerto PREPROD por escenario.
- [ ] Regla VLI/header/encoding.
- [ ] Timeout oficial por escenario.
- [ ] Moneda y reglas financieras del monto aprobadas por cuenta/escenario.
- [ ] Al menos un ATM QA completo.
- [ ] Al menos una tarjeta QA funcional.

## Fuentes recibidas y validacion pendiente

- [x] Proyecto Simulador Banred revisado estaticamente: EXE/PDB .NET, ContextoISO.xml y 15 logs. Rol servidor 4946 confirmado; 12 pares echo y un par financiero recorridos con el diccionario sin residuo, otros dos eventos no reconocidos. No es cliente ATM ni evidencia Core CB. Ver `docs/protocols/BANRED_SIMULATOR_REVIEW.md`.
- [x] Logs tcpcomms01.out / nwint00_22150.out del 8 de octubre y bloque contemporaneo de la PC: listener/cajero autorizados, origen PC 10.10.10.21 rechazado como direccion invalida tras busqueda de dispositivo. Usuario confirma CB 205 = PID 82052 / 49212 y alcance exclusivo CB. Muestra USD 20 de 82032 apartada; admision ATM QA para PC y request ATM propio de CB pendientes. Ver `docs/protocols/QA_SWITCH_ADMISSION_REVIEW.md`.
- [x] Mockup inicial revisado; la interfaz vigente está en `docs/ux/UX_SPEC.md`.
- [x] Manual local Extreme Mediator CMS v3.6 (24 paginas, revision 13-04-2023).
- [x] Matriz de evidencia para los cinco flujos: `docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md`.
- [x] Prioridad de 301000/302000 del documento sobre 310000 del mockup: usuario indico seguir el documento el 2026-10-06. No valida por si sola el formato de la trama ATM.
- [x] Filas/captura USR_RelationEntity de entidad 205 CB Cooperativa, canales 1/21, destino HTTPS QA y timeout observado 20000; entrada por Switch/SmartVista confirmada, contrato pendiente.
- [x] Par XML de MDT_Message.msgRequest/msgResponse aportado para retiro de USD 10, entidad 205/canal 1, con respuesta que reporta exito; etapas de registro, cambio de TraceId, fecha contable y contrato pendientes. Ver `docs/core/MEDIATOR_ENTITY_205_MESSAGE_SAMPLE.md`. No es fixture ATM aprobado ni la prueba de USD 20.
- [x] Diez PCAP recibidos e inspeccionados; matriz y metodo en `docs/protocols/PCAP_REVIEW.md`.
- [x] Encapsulado observado del enlace 4946 confirmado en 218 mensajes: BE16 inclusivo, header 12, MTI ASCII y bitmap ASCII hex de 128 bits.
- [ ] Validacion del ambiente, roles de enlaces y mapeo de capturas a cada caso MVP.
- [ ] Mapeo aprobado ATM ISO -> Mediator XML por escenario/cuenta/canal.
- [ ] Contrato XML aprobado o XSD y export request/response emparejado, sin errores de ejemplo.
- [ ] Mapeo de RetCode/CodigoProceso/MappedRespCode a RC ATM; tratamiento parcial.
- [ ] MTI de reverso, campos originales y flags; timeout, duplicados y late response.
- [ ] Generacion/eco de TraceId y TerminalSeq; relacion con STAN/RRN/UTRNNO.
- [ ] Contrato REST y mecanismo read-only de consulta Core autorizado.

Estos items no modifican el estado de las tramas ATM/PCAP pendientes del P0.

## P1 - Necesario para completar MVP

- [ ] Listado de entidades Coonecta.
- [ ] FRONT/BACK/EXTERNAS.
- [ ] BIN ranges.
- [ ] Catalogo ATM QA.
- [ ] Catalogo tarjetas QA.
- [ ] Response codes.
- [ ] Reglas PIN Block/HSM de TEST.
- [ ] SQL/vistas SmartVista de consulta read-only.
- [ ] Ejemplo de transaccion localizada en SmartVista.
- [ ] Core de cada entidad.
- [ ] Metodo de acceso Core.
- [ ] Query/API de correlacion Core.

## P1 - Hardware

- [x] OMNIKEY 5422 conectado y detectado en la prueba fisica del 2026-10-08.
- [x] Nombre PC/SC del reader identificado por el adaptador Windows.
- [ ] Driver/version.
- [x] ATR de tarjeta de prueba disponible; ATS/contactless y otros perfiles pendientes.
- [x] Evidencia de lectura manual EMV de contacto; no valida seguridad transaccional.

## P2 - Carga/estres

- [ ] TPS permitido QA (usuario reporta 5 TPS; falta aprobacion/evidencia formal).
- [ ] TPS permitido PREPROD.
- [ ] Max conexiones.
- [ ] Ventanas autorizadas.
- [ ] Limites de Switch.
- [ ] Limites de Core.
- [ ] Politica de parada por error.

## Mock BANRED

Subir preferentemente como ZIP o archivos sueltos:
- [ ] Manual_Mock_BANRED_SVFE_BASE24.docx
- [ ] mock_banred_tcp.py
- [ ] mock_banred_tcp_V1.0_4946.py
- [ ] mock_banred_tcp_8007_falla.py
