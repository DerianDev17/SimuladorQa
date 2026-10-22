# Estado del lector PC/SC en Windows

## Inicio: lectura visible

La tarjeta presente confirma solo el estado PC/SC. En Inicio, el botón **Leer datos
del chip** aparece junto al estado y ejecuta la misma lectura EMV manual de Main
que la vista Tarjetas. Después de una lectura válida, Inicio muestra PAN
enmascarado, titular, vencimiento y aplicación solo cuando el chip los aporta.
El enmascarado de sesión muestra primeros seis y últimos cuatro (ADR-021).
Si falta un campo, se indica como no disponible; un retiro invalida la identidad.
El resumen de Transacciones usa la referencia enmascarada de su propia lectura
manual antes del envío. La presencia sola no selecciona una tarjeta para enviar.

## Comportamiento

Actualizacion 2026-10-15: la app utiliza WindowsPcscMonitor y un unico helper
pasivo pcsc-monitor.ps1. SCardGetStatusChangeW espera con INFINITE los cambios
de tarjeta; el lector virtual PnP detecta conexion/desconexion de lectores.
Solo se enumera al iniciar o cambiar la topologia. No abre una conexion con
la tarjeta, no transmite APDU ni genera AC. Los cambios de uso compartido o
exclusivo que no alteran la presencia no provocan parpadeos en la UI.

Main publica reader:changed mediante un evento unidireccional de preload.
La UI se suscribe antes de cargar su snapshot inicial y elimina la suscripcion
al desmontarse. Se retira el polling cada cinco segundos. Buscar lector es
una consulta manual del estado observado. La identidad se lee exclusivamente
al pulsar Leer tarjeta; la insercion solo detecta presencia. Un retiro invalida
la identidad, y una respuesta tardia no restaura una tarjeta retirada.

El helper tiene plazo de arranque de ocho segundos, salida acotada y cierre
al salir de la app. Solo se reinicia ante fallo de la dependencia, con espera
creciente hasta treinta segundos; un lector estable no provoca reinicios.
CI puede seleccionar explicitamente --simulate-reader junto con un userData
aislado; no existe reemplazo automatico del hardware por datos sinteticos.

Cambios revisados en codigo y compilacion TypeScript/C#; por solicitud del usuario no se ejecutan pruebas,
la app, PC/SC ni transacciones en esta entrega. Se agregan casos de regresion
de eventos, timeout, privacidad, desuscripcion y ausencia de polling, pendientes
de ejecucion. Los apartados siguientes describen entregas anteriores.

Correccion 2026-10-13: con una interfaz presente ya conocida, pulsar Leer
durante la actualizacion automatica conserva la solicitud en cola. Espera
el resultado pendiente y confirma la misma interfaz con tarjeta presente
antes de pedir APDU. Retiro/error/timeout cancela la lectura; sin snapshot
confirmado el boton permanece bloqueado. No se solapan estado y lectura.

CardReaderAdapter separa el dominio del hardware. WindowsPcscReader invoca
pcsc-status.ps1 en un proceso PowerShell externo y oculto. El Renderer usa
reader:inspect mediante preload tipado; el IPC mantiene validacion de origen
y rechaza payloads. La app no instala drivers ni modifica el servicio Windows.

El helper establece contexto de usuario, enumera lectores y consulta su estado
de forma inmediata con SCardGetStatusChangeW. Libera siempre el contexto.
El helper de estado no conecta/resetea la tarjeta ni transmite APDU. El dominio proyecta nombre,
CARD_PRESENT/EMPTY/UNAVAILABLE y ATR cuando esta disponible. No obtiene ATS,
PAN, cuenta, Track 2, PIN ni criptogramas por si mismo; identityStatus=NOT_READ.
La lectura manual de identidad usa un proceso PC/SC independiente y el contrato
reader:identity:read. Main incorpora su proyeccion protegida a los siguientes
snapshots mientras el handle de esa tarjeta siga valido. Ver
`docs/hardware/EMV_IDENTITY_READING.md` y ADR-010.

Fuentes oficiales:
- [SCardListReadersW](https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardlistreadersw).
- [SCardGetStatusChangeW](https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardgetstatuschangew).
- [SCARD_READERSTATEW](https://learn.microsoft.com/en-us/windows/win32/api/winscard/ns-winscard-scard_readerstatew).

Dashboard y Tarjetas consultan cada cinco segundos despues de terminar la
consulta anterior, evitando solapamientos. Las consultas concurrentes de Main
comparten una promesa. El proceso tiene plazo de ocho segundos, limite de
salida de 16 KiB y maximo 16 lectores; los errores no exponen stderr del driver.
Una vista desmontada descarta resultados y cancela el siguiente timer.
Al salir de Electron se cancela el proceso pendiente y se cierra el adaptador.
Los cambios de presencia se observan por polling, no constituyen identidad.

Dashboard y Tarjetas muestran una representacion visual generica de la tarjeta,
con estado de deteccion, lector seleccionado, ATR separado por bytes y hora
local de la consulta. La marca Coonecta pertenece a la app, no identifica al
emisor de la tarjeta. Numero, titular y vencimiento figuran como No leido hasta
usar Leer datos del chip; luego muestran los campos leidos o No disponible en
el chip. La aplicacion se muestra con la etiqueta devuelta por la tarjeta;
entidad/producto permanece sin perfil asociado. Los puntos iniciales del numero
son un placeholder visual, no una asociacion automatica a 2267.
No se infiere red, banco, producto ni identidad desde el ATR.

Cada interfaz PC/SC se puede seleccionar; inicialmente se prioriza una con
tarjeta presente. Se cuentan interfaces, no tarjetas fisicas. Al retirar la
tarjeta se elimina el ATR de la vista y al fallar una consulta se descarta el
snapshot anterior. El boton Actualizar comparte el ciclo de consulta sin
solapamientos y queda deshabilitado mientras hay una consulta pendiente.
Dashboard usa una version compacta; Tarjetas muestra el detalle completo.

AppSnapshot.reader=CONFIGURED indica adaptador instalado; el estado actual
de hardware se obtiene por getReaderSnapshot. No equivale a READY financiero.
SimulatedCardReader es explicito para CI y nunca reemplaza automaticamente al
hardware cuando hay un fallo real.

## Verificacion local de 2026-10-08

Verificacion posterior de 2026-10-12 18:14 Ecuador: la lectura real del chip
obtiene CDOL1/CDOL2 junto a identidad, con salida publica limitada a tags y
longitudes. La tarjeta actualmente leida termina en 0663; no se conserva la
asociacion anterior a 2267 por suposicion. No se genera criptograma, valida
PIN ni transmite ISO en esta comprobacion. Detalle y reporte en
EMV_IDENTITY_READING.md. La presencia del lector no habilita contexto financiero.

SCardSvr activo. Se enumeran HID Global OMNIKEY 5422 Smartcard Reader 0 y
HID Global OMNIKEY 5422CL Smartcard Reader 0; ambas interfaces reportan tarjeta
presente y ATR. No se infiere que sean dos tarjetas distintas. El usuario
confirma que la tarjeta fisica es la QA terminada en 2267; esa asociacion es
declarada por el usuario en la primera inspeccion de presencia.

Actualizacion a las 22:02:28 UTC: lectura EMV de contacto exitosa con pais 218
confirmado por el usuario. El chip devuelve aplicacion VISA DEBITO, PAN
enmascarado terminado en 2267, titular disponible y vencimiento 10/27. Se
conserva solo esta proyeccion; no se registra el PAN completo ni Track 2.

Pruebas sinteticas: presencia/ausencia, insercion/retiro simulado, validacion de
estructura/ATR, privacidad, IPC invalido, consulta concurrente, timeout,
recuperacion y proceso ausente. E2E verifica el acceso a la vista y el contrato
IPC. La prueba fisica confirma presencia; no certifica APDU ni transacciones.
Pruebas de presentacion verifican seleccion de interfaz, retiro, ausencia,
ATR no disponible y errores/timeout sin mostrar identidad ficticia. E2E
verifica actualizacion manual, seleccion disponible y ajuste a 1024 px.

Con presencia verificada se ejecuto una consulta QA capturada el 2026-10-08 a
las 15:46:56 Ecuador, STAN 008103, terminal ATM20521. Se cambio solo F11,
preservando RRN/fechas/campos privados de la muestra; el cliente recibio
0210/F39 96 en unos 1.14 segundos. No se le atribuye a la tarjeta fisica una
lectura nueva de datos financieros. No se genero F38 ni ID de autorizacion
interno.

La revision directa de History SmartVista confirma UTRNNO 262812046562412550
para STAN 008103: PID 82052 registra Auth entity resp=5 y codigo interno 939
(No such response code from network); PID 80131 registra 96. STAN 008101 y
008102 muestran el mismo patron. La consulta historica aprobada de las 12:41
usa esos mismos PID y registra 00; el intento del simulador de las 13:04 muestra
timeout 801/91, asociado en Mediator al TraceId 31580471 y RetCode 8908.

Con excepcion puntual autorizada por el usuario, un SELECT protegido del dia
2026-10-08 en Mediator 172.60.60.172:55893, entidad 205/canal 1/ATM20521/301000,
devuelve tres registros historicos y ninguno de secuencia 8101/8102/8103.
La etiqueta existente del perfil SQL es PREPROD; el usuario confirma el destino
y clasifica el circuito como QA. La consulta no cambia ese perfil ni el
observador. La ausencia corresponde a los filtros consultados, no prueba
ausencia global en Mediator ni llegada al Core. El panel ISO8583 Messages de
008103 muestra Sin datos. Origen/semantica/mapeo de la respuesta 5 requiere
log correlacionado de PROXY205 y datos del proveedor; no se normaliza a 05.

## TODO-DATA dependientes

- CARD-IDENTITY-APDU: resuelto para identidad EMV de contacto via PSE y PDOL
  vacio o 9F1A/2 bytes; probado fisicamente con la tarjeta QA actual. Otros
  PDOL, tarjetas sin PSE y lectura contactless requieren evidencia adicional.
  La asociacion al perfil de cuenta/entidad permanece pendiente.
- CARD-TRANSACTION-SECURITY: PIN/HSM, datos EMV nuevos y campos dinamicos;
  no se inventan desde un ATR ni se atribuyen a una captura historica.
- CARD-PROFILE-STORAGE: inventario QA implementado con alias, ultimos cuatro,
  AID/etiqueta, requisitos CDOL (solo tags/longitudes), cuenta opcional y fecha.
  Sigue pendiente asociacion cuenta/entidad; no se almacena PAN completo ni
  seguridad de pago. Variables propietarias requieren TODO-DATA
  CARD-GROUP-VARIABLE-MAP.
- CB205-PROXY-RETURN-5: falta respuesta original y log correlacionado de
  PROXY205 para UTRNNO 262812046562412550 / STAN 008103, y mapeo aprobado de
  codigo 5 en PID 82052. Bloquea corregir ese retorno; la comunicacion ATM con
  SmartVista y la presencia PC/SC estan verificadas independientemente.

La columna de autorizacion SmartVista no se rellena en el simulador: la consulta
historica aprobada no incluia F38 en su request y el campo tampoco aparece en
la respuesta ATM capturada. Generacion/semantica de la columna interna requiere
validacion del proveedor; su ausencia con F39 96 no prueba falta de F38 enviado.

## Selector de tarjeta en Transacciones (2026-10-11)

Transacciones reutiliza los IPC de inspeccion/lectura manual existentes. El
operador elige la interfaz, lee por contacto y confirma Usar esta tarjeta.
Solo se usa en la UI una referencia de identidad protegida; no se crea ni
persiste un perfil financiero. La lectura no decide cuenta, entidad o producto.
Continuar sin tarjeta conserva un borrador parcial, con tarjeta pendiente.
El selector consulta solo mientras Transacciones esta visible y elimina su
seleccion/revision ante retirada, cambio de interfaz/lectura o error de consulta.
Ver `docs/implementation/TRANSACTION_PREPARATION.md`.

Actualizacion 2026-10-20: Tarjetas permite guardar un perfil QA de referencia
desde una lectura vigente. Se persisten alias, ultimos cuatro, AID y fecha en
`qa-card-profiles.json` dentro de userData. No se persisten titular, vencimiento,
PAN completo, Track 2, PIN ni valores/criptogramas EMV; Main confirma que la
misma lectura aun este activa al guardar. Los perfiles solo identifican tarjetas
fisicas y no sustituyen el chip para una operacion nueva. Ver ADR-018.

Ampliacion 2026-10-20: los perfiles guardados conservan tambien la etiqueta de
aplicacion y los tags/longitudes CDOL1/CDOL2. Alias y cuenta predeterminada
pueden editarse; en Transacciones el perfil preselecciona AID/cuenta y compara
la lectura actual por AID y ultimos cuatro. El chip debe seguir presente y el
proveedor produce datos nuevos para cada operacion. La version 2 migra de forma
normalizada el inventario version 1. Valores propietarios del libro Card Groups
siguen bloqueados hasta completar TODO-DATA CARD-GROUP-VARIABLE-MAP; ver
ADR-019.

Las consultas automaticas de la vista esperan mientras hay una lectura manual
pendiente y reanudan el siguiente ciclo disponible al terminar. Actualizar y
elegir aplicacion se bloquean durante consulta/lectura; el guard interno impide
iniciar una lectura si hay una consulta en curso. Esto evita que un snapshot
anterior sobrescriba el resultado del chip. No cambia plazos ni reglas de Main.

Las aplicaciones y avisos del chip se muestran solo para la interfaz seleccionada
con tarjeta presente. Cambiar interfaz no ofrece AID de la lectura anterior. El
selector distingue busqueda, lectura, ausencia y servicio no disponible; un fallo
no invita a insertar una tarjeta como si la conexion estuviera verificada. La
regresion Electron usa dos lectores sinteticos y reloj controlado para comprobar
seleccion de aplicacion, aislamiento y pausa/reanudacion del polling.

## Correcciones de tarjeta (2026-10-11)

Las vistas comparten la resolucion de lector e identidad. Solo muestran una
identidad del lector seleccionado con presencia confirmada; una lectura READ
requiere tambien identityStatus=READ. Un error de consulta oculta identidad y
ATR anteriores. Consulta pendiente, lector ausente/no disponible y tarjeta
ausente se muestran como estados distintos. La ilustracion no fija el ambiente QA.

Si desaparece la interfaz elegida, la vista conserva la interfaz de reemplazo
al reaparecer la anterior. Cambiar interfaz o estado elimina el error de lectura
anterior. Una respuesta de lectura de otra interfaz se rechaza. Tras NOT_FOUND,
SERVICE_UNAVAILABLE o TIMEOUT se consulta estado inmediatamente, sin repetir
APDU. Las etiquetas del chip y nombres de lector protegen secuencias numericas
de 12 o mas digitos, incluso separadas por espacios o guiones.

La regresion usa sesiones, datos de chip y respuestas IPC sinteticas para
comprobar timeout, cierre, aislamiento de identidad, retiro, recuperacion y
seleccion estable. No se ejecutaron envios de tramas ni una lectura fisica nueva.
