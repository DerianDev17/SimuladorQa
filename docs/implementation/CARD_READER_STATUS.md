# Estado del lector PC/SC en Windows

## Comportamiento

CardReaderAdapter separa el dominio del hardware. WindowsPcscReader invoca
pcsc-status.ps1 en un proceso PowerShell externo y oculto. El Renderer usa
reader:inspect mediante preload tipado; el IPC mantiene validacion de origen
y rechaza payloads. La app no instala drivers ni modifica el servicio Windows.

El helper establece contexto de usuario, enumera lectores y consulta su estado
de forma inmediata con SCardGetStatusChangeW. Libera siempre el contexto.
No conecta/resetea la tarjeta ni transmite APDU. El dominio proyecta nombre,
CARD_PRESENT/EMPTY/UNAVAILABLE y ATR cuando esta disponible. No obtiene ATS,
PAN, cuenta, Track 2, PIN ni criptogramas; identityStatus=NOT_READ.

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
emisor de la tarjeta. Numero, titular y vencimiento figuran como No leido;
entidad/producto permanece sin perfil asociado. Los puntos del numero son un
placeholder visual, no un PAN recuperado ni una asociacion automatica a 2267.
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

SCardSvr activo. Se enumeran HID Global OMNIKEY 5422 Smartcard Reader 0 y
HID Global OMNIKEY 5422CL Smartcard Reader 0; ambas interfaces reportan tarjeta
presente y ATR. No se infiere que sean dos tarjetas distintas. El usuario
confirma que la tarjeta fisica es la QA terminada en 2267; esa asociacion es
declarada por el usuario, no una identidad leida del chip.

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

- CARD-IDENTITY-APDU: comandos/secuencia del perfil aprobado para leer datos
  permitidos y asociar la tarjeta a su perfil. ATR no contiene identidad PAN.
- CARD-TRANSACTION-SECURITY: PIN/HSM, datos EMV nuevos y campos dinamicos;
  no se inventan desde un ATR ni se atribuyen a una captura historica.
- CARD-PROFILE-STORAGE: catalogo validado y cifrado antes de guardar datos
  sensibles. Se conserva solo evidencia de presencia con metadatos tecnicos.
- CB205-PROXY-RETURN-5: falta respuesta original y log correlacionado de
  PROXY205 para UTRNNO 262812046562412550 / STAN 008103, y mapeo aprobado de
  codigo 5 en PID 82052. Bloquea corregir ese retorno; la comunicacion ATM con
  SmartVista y la presencia PC/SC estan verificadas independientemente.

La columna de autorizacion SmartVista no se rellena en el simulador: la consulta
historica aprobada no incluia F38 en su request y el campo tampoco aparece en
la respuesta ATM capturada. Generacion/semantica de la columna interna requiere
validacion del proveedor; su ausencia con F39 96 no prueba falta de F38 enviado.
