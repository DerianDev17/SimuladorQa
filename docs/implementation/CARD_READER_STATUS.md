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

Con presencia verificada se ejecuto una consulta QA capturada el 2026-10-08 a
las 15:46:56 Ecuador, STAN 008103, terminal ATM20521. Se cambio solo F11,
preservando RRN/fechas/campos privados de la muestra; el cliente recibio
0210/F39 96 en unos 1.14 segundos. No se le atribuye a la tarjeta fisica una
lectura nueva de datos financieros. Llegada a Mediator/Core de este intento
sigue pendiente de evidencia; no se genero F38 ni ID de autorizacion interno.

## TODO-DATA dependientes

- CARD-IDENTITY-APDU: comandos/secuencia del perfil aprobado para leer datos
  permitidos y asociar la tarjeta a su perfil. ATR no contiene identidad PAN.
- CARD-TRANSACTION-SECURITY: PIN/HSM, datos EMV nuevos y campos dinamicos;
  no se inventan desde un ATR ni se atribuyen a una captura historica.
- CARD-PROFILE-STORAGE: catalogo validado y cifrado antes de guardar datos
  sensibles. Se conserva solo evidencia de presencia con metadatos tecnicos.

La columna de autorizacion SmartVista no se rellena en el simulador: la consulta
historica aprobada no incluia F38 en su request y el campo tampoco aparece en
la respuesta ATM capturada. Generacion/semantica de la columna interna requiere
validacion del proveedor; su ausencia con F39 96 no prueba falta de F38 enviado.
