# Changelog

Continuar tras un error de retiro (2026-10-28): **Nueva transacción** permite
preparar otro retiro QA con lectura y PIN nuevos cuando el intento anterior
terminó y quedó guardado. RC 59 y timeouts conservan su resultado en el historial
sin reaparecer como bloqueo al abrir el formulario. Ejecuciones activas y fallos
de persistencia requieren recuperación. Ver [ADR-025](docs/adr/ADR-025-QA-WITHDRAWAL-AFTER-ERROR.md).

Retiro con monto personalizado (2026-10-27): **Monto de prueba** permite escribir
un valor positivo como `75.25` o `1234.56`. El contrato QA de ATM20521 y sus
derivados sustituye la lista 20/50 por montos representables en F4, manteniendo
PIN/EMV nuevo y validacion del importe recibido. Ver [retiro](docs/transactions/WITHDRAWAL.md).

Retiro + reverso temporizado (2026-10-19): dentro de **Retiro aprobado**, elegir
**Retiro + reverso** y la espera (5 s inicialmente, configurable entre 1 y 30 s).
Tras 0210/00, Main espera y envia un 0420 vinculado al original; registra 0430
por separado y muestra la cuenta regresiva. El comprobante incluye el resultado
del reverso. Sin reintentos automaticos; QA/LOCAL/ahorros y reverso total sin
efectivo ni surcharge. Validado offline y con TCP local; pendiente prueba del
flujo nuevo en host/Core. Ver [alcance](docs/transactions/REVERSAL.md).

Retiro con comprobante local (2026-10-19): opciones Con/Sin impresion, vista previa
y dialogo de impresion sin otro envio financiero. El resultado destaca el monto
autorizado y conserva los saldos F54 recibidos tambien en retiros. Debito total y
saldo restante exacto mantienen su pendiente de contrato, sin calculos supuestos.
Ver [alcance y datos pendientes](docs/transactions/WITHDRAWAL.md).

Retiro con respuesta 91: muestra **Retiro no aprobado**, conserva la respuesta
del host y permite la siguiente operacion con nueva lectura de tarjeta y PIN.
La conciliacion es un proceso separado; se retira el paso Nueva prueba QA.
Los registros historicos 91 se presentan con el mismo criterio sin reescribirlos.
Ver [alcance](docs/transactions/WITHDRAWAL.md).

Correccion 2026-10-19: se restaura la observacion TCP despues de cada envio
si estaba conectada, sin reintento financiero. Se instala el contrato de
retiro USD 20/50 en el AppData real de la instancia abierta: las comprobaciones
anteriores leian la copia virtual de Codex. Router de Main verificado, PIN/EMV
de saldo nuevo por operacion. Parametros SQL de ATM20521 revisados mediante
SELECT sin cambios en la base. Ver [conexion](docs/implementation/SWITCH_CONNECTION.md)
y [alcance/instalacion](docs/adr/ADR-016-QA-WITHDRAWAL-BALANCE-COMPATIBILITY.md).

Validacion real 2026-10-16: ATM20521/STAN 900110 recibe 0210/00; consulta
APPROVED despues de corregir F35, F44 y 5F34. Implementado el flujo de retiro
ahorros/LOCAL/QA: monto, IPC, ISO/TCP, diario separado y proteccion de duplicados.
Main ya conecta el proveedor PIN/EMV de retiro, con contrato independiente
por perfil, montos de prueba permitidos y revalidacion antes de enviar.
Por indicacion explicita del usuario se habilita ATM20521/QA/ahorros/USD 20
con la misma preparacion PIN/EMV de saldo y seguridad nueva en cada intento.
El contrato BOUND_PROFILE/ZERO mantiene 9C del perfil y 9F02 cero; F3/F4 son
de retiro. No se presenta como certificacion del proveedor. CASH/01 queda
como alternativa separada. Ver [ADR-016](docs/adr/ADR-016-QA-WITHDRAWAL-BALANCE-COMPATIBILITY.md).
Ver [saldo](docs/implementation/BALANCE_EXECUTION.md) y
[retiro](docs/transactions/WITHDRAWAL.md).

Correccion EMV 2026-10-16: SRVPIN de STAN 900108 pasa PIN/tarjeta y rechaza
ARQC. Se identifica 5F34 ausente y completado como 00 al perderse F23 en el
recorrido. El proveedor ahora incluye siempre la secuencia real del chip
en F55, conforme a la captura aprobada; compatible con los perfiles actuales.
Pendiente confirmar ARQC con una nueva consulta y resolver la diferencia
SRVPIN 57 / PROXY `5 `. El intento 900108 ya confirma el arreglo anterior
del parser: NOT_APPROVED/96. Ver [evidencia](docs/protocols/QA_SWITCH_LOGS_20261016.md).

Diagnostico con logs 2026-10-16: NWINT confirma F39=`5 ` desde PID 82052,
sin mapeo para nwind 28; SmartVista devuelve 939/96. Se corrige el parser local
para admitir F44 segun ISOBASEI: la misma respuesta real ahora se interpreta
como 0210/96 correlacionada. PROXY/SRVPIN recibidos posteriormente amplian el
diagnostico descrito arriba. La cache HTTP en disco se desactiva solo en
`--dev` por el aviso separado de Chromium. Ver
[logs y correccion](docs/protocols/QA_SWITCH_LOGS_20261016.md) y
[arranque](docs/implementation/BOOTSTRAP.md).

Correccion 2026-10-16: SmartVista QA correlaciona los rechazos 19 de
ATM20521/STAN 900105 y 900106 con respuesta interna 880 (BAD_TRK2).
El proveedor copiaba el relleno F final de tag 57 a F35; ahora reempaca
el Track 2 con 0 inicial para longitud impar, conforme a la captura aprobada.
No se cambia el perfil EMV ni se envia otra TRX. La validacion financiera
posterior queda pendiente. Ver [diagnostico y pruebas](docs/implementation/BALANCE_EXECUTION.md).

Reposicion autorizada 2026-10-15T22:41:47Z: ATM20521 vuelve a disponer de
1000 secuencias QA, 900105-901104, exclusivas de esta estacion. Inspeccion
SQL puntual y comprobacion desde Electron Main completadas; no hay un envio
financiero nuevo. Tras el reinicio se requiere volver a leer la tarjeta.
Ver [ADR-015](docs/adr/ADR-015-QA-SEQUENCE-POOL-REPLENISHMENT.md).

Consulta solicitada 2026-10-15T21:23:31Z: la instancia Electron envia una sola
consulta de saldo ATM20521, STAN 900104/RRN 628800900104, y recibe 0210/19,
no aprobada. Se repone la reserva tras tres SELECT puntuales autorizados;
la escritura se completa desde Main por la virtualizacion de AppData.
Diario con cinco entradas, pool nuevamente agotado, sin reintento automatico.
Detalle en [motor de saldo](docs/implementation/BALANCE_EXECUTION.md) y
[excepcion SQL consumida](docs/adr/ADR-014-ONE-TIME-BALANCE-RESERVATION-INSPECTION.md).

Consulta solicitada 2026-10-15: ATM20521 envia una nueva consulta de ahorros
con PIN/EMV nuevos y recibe 0210/19, STAN 900103, RRN 628800900103; no aprobada.
El diario conserva los diagnosticos publicos EMV y el pool queda agotado.
Se corrige la propagacion del contador de reservas hacia la UI. Typecheck y
compilacion correctos; sin ejecutar pruebas ni controlar la interfaz.
Detalle en [motor de saldo](docs/implementation/BALANCE_EXECUTION.md).

Actualizacion 2026-10-15: deteccion de insercion/retiro por eventos PC/SC,
sin polling de la UI; la lectura del chip sigue siendo manual. Un resultado
financiero confirmado permite preparar una nueva consulta sin pedir recuperar
el resultado anterior. Avisos del pool de secuencias y diagnosticos publicos
EMV para futuras ejecuciones. Main/preload se recompilan y reinician en dev
al quedar libres. Typecheck y build correctos; pruebas pendientes por solicitud
del usuario. No se ha reiniciado su app ni enviado otra transaccion.

Rediseño aprobado 2026-10-14: formulario único, lectura manual que selecciona la
tarjeta, Enviar como única acción principal y resultado lateral. Revisión documental
opcional y actividad de sesión con datos reales. Ver [UX vigente](docs/ux/UX_SPEC.md).

Correccion de bloqueos 2026-10-14: los fallos confirmados antes del envio permiten
un nuevo intento explicito; los resultados inciertos conservan su referencia
incluso al editar. Diagnosticos por etapa y reserva de secuencia posterior a
validar tarjeta/cifrado. Ver [motor de saldo](docs/implementation/BALANCE_EXECUTION.md).

Activacion 2026-10-14: llave de enlace recibida, comprobada contra la consulta
aprobada y protegida con DPAPI; perfil privado ATM20521 vinculado a su lote
abierto. Corregida envolvente EMV F55 del proveedor. Ver
[QA_PIN_EXECUTION.md](docs/implementation/QA_PIN_EXECUTION.md) para alcance y
resultado, sin equiparar configuracion activa con aprobacion financiera.

Consulta directa (2026-10-14): Enviar transaccion usa ATM/tarjeta seleccionados
y destino/plazos guardados, sin exigir una revision manual previa. Main valida
el cifrado y el perfil al iniciar; si no estan disponibles devuelve un resultado
bloqueado sin enviar bytes. La revision documental queda opcional. Ver
[BALANCE_EXECUTION.md](docs/implementation/BALANCE_EXECUTION.md).

Correccion de conexion 2026-10-14: Inicio ofrece Conectar al Switch/Desconectar
y muestra el estado TCP actual, origen y gestion recibida. El socket permanece
abierto despues de 0800; el indicador deja de ser texto fijo. La conexion QA
usa el destino guardado y es independiente del PIN/lector. No se reconecta
automaticamente ni se deduce una respuesta ISO. Ver
[SWITCH_CONNECTION.md](docs/implementation/SWITCH_CONNECTION.md).

Actualizacion 2026-10-14: el usuario confirma envio financiero directo por
16100. Main deja de exigir TCS, su IP origen o su cambio de llave para esa
ruta. Los componentes CMS de ATM20524 se importan con comprobacion de KCV
y custodia DPAPI por terminal; su finalidad maestra no habilita cifrado PIN
del enlace. La prueba real recibe 0800/071; no hay consulta financiera nueva.
Configuracion y resultado: [QA_PIN_EXECUTION.md](docs/implementation/QA_PIN_EXECUTION.md).

Entrega 2026-10-13: implementado Enviar -> solicitud PIN nativa -> cifrado
TEST protegido Windows -> primera AC nueva del chip -> consulta de saldo CB.
Main activa proveedores por perfil QA aprobado; no necesita SafeNet para el
adaptador local de TEST. Validado con lector/host sinteticos y cifrado Windows
real con credencial sintetica, sin enviar una consulta financiera QA.
El primer uso necesita el perfil y la vinculacion de clave TEST local aprobada.
Configuracion, limites y pruebas: [QA_PIN_EXECUTION.md](docs/implementation/QA_PIN_EXECUTION.md).

Base desktop implementada: dashboard, navegacion, seleccion persistida QA/PREPROD,
auditoria local, CRUD de entidades/ATM en SQLite mediante Worker y pantalla de
preparacion de transacciones con catalogo CMS por cuenta, seleccion ATM y revision
de requisitos. Las transacciones reales
siguen bloqueadas hasta disponer de evidencia aprobada.
La preparacion incluye plantillas documentales, validacion de monto, resumen de
revision y borrador conservado al navegar durante la sesion.
Permite guardar, recuperar y eliminar casos locales por ambiente, conservados
tras reiniciar, con referencias documentales y revision obligatoria del contexto.
La revision PREPROD compara Terminal ID/codigo con el esquema inspeccionado de
Mediator y muestra incompatibilidades sin truncar perfiles.
Historial incorpora una consulta parametrizada de Journal/Message PREPROD con
filtros y estructura XML protegida. La conexion real requiere TLS confiable y
una cuenta de lectura; el servidor actual sigue fallando validacion TLS.
Configuracion muestra la evidencia de red QA aportada para ATM/Switch/Mediator,
con puertos, PID y pendientes de acceso/framing. Se carga desde archivo privado
por ambiente al iniciar; no equivale a conexion comprobada ni habilita envio.
Una herramienta de prueba QA dispone de un emisor de captura con write unico,
plazos y metricas protegidas fuera del Renderer. Ver
`docs/implementation/QA_CAPTURE_REPLAY.md`; no construye nuevas tramas ISO ni
habilita el envio general de la app. El rechazo historico NO AUTHORIZATION
fue confirmado por el log; el 2026-10-08 la PC ya recibe gestion de red 0800.
La prueba actual identifica codigo 071, distinto del 072 de las capturas.
Los logs posteriores confirman la PC autorizada como PID 80131. El balanceador
172.60.60.171 fue rechazado en esa ventana; una captura posterior muestra
su conexion aceptada. Falta validar coexistencia de sesiones prolongadas.
Un codec acotado construye 0810 offline con codigo de respuesta obligatorio;
falta validar la politica del enlace antes de contestar. La herramienta
`tooling/probe-visa-network.mjs` comprueba recepcion sin transmitir.
Ver `docs/protocols/VISA_NETWORK_MANAGEMENT.md`.
La captura VCP Lite aporta un codec de envolvente VISA de cuatro bytes probado
offline en 262 frames y un caso privado de reproduccion exacta del retiro USD 20
STAN 001391. Conserva los campos originales; no crea una transaccion nueva con
otra tarjeta ni habilita el envio general. Ver el documento del emisor QA.
El 2026-10-08 el usuario confirma CB 205 como PID 82052 / 49212. La muestra
001391 ruteaba a 82032 y queda apartada del alcance exclusivo CB. Una nueva
captura aporta consulta y retiro de CB en ambos enlaces. El codec acotado
CapturedVisaBalance reconstruye la consulta original sin cambiar sus campos.
El intento unico desde la PC recibio 0210/F39 91; el usuario confirma llegada
a SmartVista y Mediator, cuyo TraceId 31580471 devuelve RetCode 8908 y
WS, PROCESADOR NO RESPONDE. Falta diagnosticar la llamada al procesador/Core.
Ver `docs/protocols/CB_205_BALANCE_SAMPLE.md`; no se envio un retiro.
Diez PCAP inspeccionados aportan un codec offline de encapsulado BANRED y una
vista de evidencia. 218 mensajes se reconstruyen byte a byte; los campos de
negocio y otros enlaces requieren diccionario y validacion de casos.
El proyecto legacy Simulador Banred aporta ContextoISO.xml y ejemplos de echo
y mensajes financieros de su mock servidor 4946. Se reviso sin ejecutarlo;
diccionario y reglas mock quedan separados del perfil cliente ATM y del Core
CB. Ver `docs/protocols/BANRED_SIMULATOR_REVIEW.md`.
ISOBASEI.bin de SWATM01 Coonecta fue recibido e inspeccionado. Un inspector
offline fuera del Renderer lee cabecera, posiciones ISO y tablas MTI sin
defaults ni datos de tarjeta. BCD/EBCDIC/BINARY contrastados con el formatter;
wire validado para la consulta capturada; generacion de nuevas transacciones
sigue pendiente. Ver `docs/protocols/ISOBASEI_REVIEW.md`.
La interfaz usa fondos neutros y acciones claras. Transacciones prioriza el
formulario en tres acciones: datos, tarjeta y revision. Permite leer y elegir
una identidad de tarjeta para la sesion, revisar el borrador y ver el envio real
pendiente. Inspector, metricas y evidencia se despliegan bajo demanda. Ver `docs/ux/UX_SPEC.md` para los criterios de presentacion.
Dashboard y Tarjetas consultan PC/SC en Windows para mostrar lectores, presencia
y ATR. El OMNIKEY 5422 conectado reporta tarjeta presente en ambas interfaces.
Tarjetas permite leer manualmente la identidad EMV por contacto: PAN enmascarado,
titular, vencimiento y aplicacion cuando el chip los expone. La tarjeta QA
terminada en 2267 fue leida fisicamente con pais de terminal Ecuador (218)
seleccionado por el usuario. En QA se puede guardar un perfil local con alias,
ultimos cuatro, AID/etiqueta, requisitos CDOL (solo tags/longitudes) y cuenta
predeterminada opcional. Transacciones puede preseleccionar el AID y la cuenta,
pero vuelve a leer la tarjeta fisica y requiere seguridad nueva del chip. Los
valores del libro Card Groups siguen pendientes de mapeo aprobado. Ver
`docs/hardware/EMV_IDENTITY_READING.md` y `docs/implementation/CARD_READER_STATUS.md`.
