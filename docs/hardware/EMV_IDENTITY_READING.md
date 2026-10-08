# Lectura manual de identidad EMV por contacto

## Uso

En Tarjetas, insertar la tarjeta por contacto, seleccionar la interfaz y usar
Leer datos del chip. Pais del terminal comienza en 218, Ecuador, elegido
explicitamente por el usuario el 2026-10-08. El valor se puede editar antes de
leer; Main exige tres digitos distintos de 000, sin deducirlo desde el ATR.
Si hay varias aplicaciones en el directorio, elegir una para continuar.

La pantalla muestra PAN enmascarado, titular, vencimiento MM/YY y etiqueta de
aplicacion cuando estan disponibles. La marca de la ilustracion pertenece a la
app. No identifica banco, producto, cuenta ni elegibilidad transaccional.
Un campo ausente permanece No disponible en el chip; no se completa desde
capturas, ATR, historial o datos declarados anteriormente por el usuario.

## Fuente de protocolo

La secuencia usa SELECT del PSE 1PAY.SYS.DDF01, directorio con SFI devuelto por
la tarjeta y seleccion exacta del AID descubierto. GET PROCESSING OPTIONS
recibe PDOL vacio o un unico 9F1A de dos bytes con pais explicito. READ RECORD
lee exclusivamente el AFL devuelto. Tags de identidad: 5A, 5F20 y 5F24.
No se prueban AID conocidos ni se barren registros.

Fuentes primarias: documentos originales EMVCo 4.3, disponibles en reproduccion:

- [Book 1, secciones 11/12 y anexo A](https://pdfcoffee.com/emv-v43-book-1-icc-to-terminal-interface-2012060705394541-pdf-free.html).
- [Book 3, secciones 6.5.8/10.2 y anexos A/B](https://studylib.net/doc/28022968/emv-v4.3-book-3-application-specification-20120607062110791).
- [Catalogo oficial EMVCo](https://www.emvco.com/specifications/page/32/).
- [Pais Ecuador 218, Naciones Unidas](https://unstats.un.org/unsd/methodology/M49).

GPO inicia procesamiento dentro del chip. Este diagnostico termina despues de
leer los registros y no constituye una transaccion ATM aprobada ni un kernel
certificado. No genera criptogramas, verifica PIN, ejecuta scripts del emisor,
modifica claves ni envia mensajes financieros. Polling solo consulta estado;
la lectura APDU requiere una accion manual y no se repite automaticamente.

## Implementacion y privacidad

CardIdentityService corre en Main. WindowsCardSession abre pcsc-card.ps1 en
PowerShell oculto; usa stdin/stdout privados al proceso, nunca el Renderer.
El helper acepta solo SELECT, READ RECORD, GET RESPONSE y los dos formatos GPO
acotados. SCardBeginTransaction evita intercalado durante la lectura. Se libera
el bloqueo al terminar y se conserva una conexion compartida para comprobar
la vigencia de esa tarjeta con SCardStatusW. Retirada/reset/fallo invalidan los
datos; el ATR no se usa como identificador unico. Al salir se cierra el helper.

Fuentes de Windows:

- [SCardConnectW](https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardconnectw).
- [SCardTransmit](https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardtransmit).
- [SCardStatusW](https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardstatusw).
- [SCardBeginTransaction](https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardbegintransaction).
- [SCardEndTransaction](https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scardendtransaction).
- [SCardDisconnect](https://learn.microsoft.com/en-us/windows/win32/api/winscard/nf-winscard-scarddisconnect).

PAN completo y respuestas APDU no salen de Main/helper, no se registran ni
persisten. La proyeccion conserva solo los ultimos cuatro digitos del PAN;
Track 2 y otros tags sensibles se descartan. El helper limpia buffers nativos.
No se expone transmisor APDU generico por preload.

## Limites y validacion

Plazo total 20 s; cada intercambio APDU 8 s y comprobacion de estado 1,5 s;
salida por respuesta 16 KiB. BER-TLV
tiene limite de 4 KiB por respuesta y ocho niveles. Directorio: hasta 32
registros y 16 aplicaciones. AFL: hasta 64 registros. Continuaciones 61 y
correccion Le 6C: hasta ocho intercambios. Estos son limites del diagnostico.
Datos malformados, duplicados, AFL invalidos y respuestas fallidas se rechazan
con errores protegidos. No se completan parametros PDOL desconocidos con cero.

Pruebas sinteticas cubren lectura, ausencia de campos, varias aplicaciones,
PDOL pais, parametros no soportados, TLV/AFL invalidos, continuidad, privacidad,
validacion IPC, timeout, concurrencia, dependencia ausente y retirada/reset.
Integracion ejecuta el proceso PowerShell con datos sinteticos.

Prueba fisica de 2026-10-08: contacto OMNIKEY 5422, aplicacion VISA DEBITO,
PAN terminado en 2267, titular disponible y vencimiento 10/27. No se persisten
respuestas APDU ni datos completos de tarjeta como evidencia.

## TODO-DATA

- CARD-IDENTITY-OTHER-PDOL: valores y evidencia aprobados para otras entradas.
- CARD-IDENTITY-NO-PSE: AID/documentacion de tarjetas sin directorio de contacto.
- CARD-IDENTITY-CONTACTLESS: secuencia/perfil especifico antes de extender lectura.
- CARD-PROFILE-STORAGE: catalogo validado, proteccion y asociacion cuenta/entidad.
- CARD-TRANSACTION-SECURITY: generacion nueva PIN/HSM/EMV y reglas ATM; identidad
  leida no desbloquea envio financiero ni produccion.
