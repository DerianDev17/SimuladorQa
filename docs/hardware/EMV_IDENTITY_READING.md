# Lectura manual de identidad EMV por contacto

## Uso

Actualizacion 2026-10-13: la accion de lectura conserva su alcance de identidad.
Main puede retener campos privados para una unica operacion posterior por
QaBalanceExecutionProvider. Solo esa ruta aprobada vuelve a adquirir la sesion
exclusiva y ejecuta primera AC; el polling y el IPC de lectura no admiten APDU
arbitrarios. La lectura se consume al completar/cancelar la operacion. Detalle
del flujo PIN/primera AC y limites en ../implementation/QA_PIN_EXECUTION.md.

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

Actualizacion 2026-10-13: se leen los IAC 9F0E/9F0F/9F0D de los mismos
registros anunciados por AFL. Son flags estaticos publicos, validados a cinco
bytes, con null para ausencia comprobada; una lectura incompleta no entrega
issuerActionCodes. No se solicitan valores del emisor en archivos adicionales.
El analisis de terminal online-only esta descrito en EMV_TERMINAL_PARAMETERS.md;
no es generacion de criptograma ni verifica PIN.

Actualizacion 2026-10-12: READ RECORD tambien obtiene CDOL1 (8C) y CDOL2
(8D) de los registros anunciados por AFL. La proyeccion
transactionDataRequirements contiene exclusivamente listas tag/longitud;
ausencias son null, no se reemplazan por DEFAULT_TDOL del INA. Las listas
truncadas, duplicadas o fuera de los limites del parser se rechazan.
Fuente: EMV Book 3, secciones 7.5 y 9.2 y diccionario del anexo A. CDOL1
corresponde al primer GENERATE AC y CDOL2 al segundo cuando aplica. Esta
lectura no ejecuta GENERATE AC ni determina resultados TVR/CVM.

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
No se expone transmisor APDU generico por preload. Textos de titular/aplicacion
y nombres de lector protegen secuencias de 12 o mas digitos, incluidos espacios
o guiones; no se interpretan como identidad financiera.

Cada lectura pertenece a una generacion de sesion. Descartar, expirar o cerrar
invalida esa generacion; se comprueba de nuevo despues de esperar la validacion
del handle. Un resultado tardio no recupera identidad anterior ni reemplaza una
lectura nueva. Las respuestas son copias de la proyeccion retenida, de modo que
un consumidor no modifica el estado de Main.

## Limites y validacion

### Por que una consulta nueva requiere configuracion EMV

En una operacion con chip, el cajero lee los datos de la tarjeta y su
software gestiona el dialogo EMV de esa operacion. El lector OMNIKEY transporta
comandos/respuestas; la aplicacion configura el terminal y pide al chip
el criptograma nuevo. EMVCo describe un codigo de seguridad de un solo uso
por transaccion en [EMV Contact Chip](https://www.emvco.com/emv-technologies/emv-contact-chip/).

Perfil EMV significa el conjunto de parametros/reglas del software del
terminal: aplicaciones admitidas, pais/moneda, capacidades y verificaciones,
datos que solicita el chip para la operacion, y manejo de la respuesta del
emisor. Parte de los datos y listas solicitadas se lee de la tarjeta; otros
deben aportarse desde la configuracion y la operacion actual. La identidad
ya leida no define todos esos parametros ni habilita GENERATE AC.

El flujo implementado termina en lectura de identidad y no genera el
criptograma de una consulta nueva. Los archivos HSM/llaves aportados ayudan
a identificar la seguridad del host, pero no definen por si solos ese flujo
del terminal. Se conserva TODO-DATA CARD-TRANSACTION-SECURITY para su perfil,
proveedor y asociacion TEST; no se reutiliza el EMV capturado como dato nuevo.

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
Integracion ejecuta el proceso PowerShell con datos sinteticos. La regresion
de 2026-10-11 cubre validacion tardia despues de timeout/cierre, lectura nueva
sin sobrescritura anterior y aislamiento de respuestas mutables. Se verifica
el enmascarado de textos numericos separados, sin leer hardware ni enviar tramas.

Prueba fisica de 2026-10-08: contacto OMNIKEY 5422, aplicacion VISA DEBITO,
PAN terminado en 2267, titular disponible y vencimiento 10/27. No se persisten
respuestas APDU ni datos completos de tarjeta como evidencia.

## TODO-DATA

Prueba fisica posterior, 2026-10-12 23:14:31-38 UTC (18:14 Ecuador): contacto
OMNIKEY, tarjeta enmascarada terminada en 0663, aplicacion A0000000031010.
CDOL1 leido del chip: 9F02/6, 9F03/6, 9F1A/2, 95/5, 5F2A/2, 9A/3, 9C/1,
9F37/4. CDOL2 agrega 8A/2 al inicio y 91/8 al final de esa secuencia.
No se piden esas listas como archivo adicional. Reporte privado:
artifacts/card-requirements-d00384a2-3db3-4cc5-b821-50159c313374.json.
No asociar el PIN ni perfil de la tarjeta anterior terminada en 2267 a esta
tarjeta. El usuario posteriormente elige reinsertar 2267. No se ejecuta
verificacion PIN ni comando GENERATE AC, y no se
envia una consulta financiera durante esta lectura.

Relectura real tras la respuesta del usuario, 2026-10-12 23:24:41-48 UTC
(18:24 Ecuador), runId c85c288e-feb7-4dbd-a8ab-f4c425d29946: READ,
PAN enmascarado terminado en 2267 y AID A0000000031010. CDOL1 y CDOL2
coinciden en tags/longitudes con las listas enumeradas arriba; se obtienen
de esta tarjeta, no se copian de la anterior. Seleccion de tarjeta resuelta.
Reporte artifacts/card-requirements-c85c288e-feb7-4dbd-a8ab-f4c425d29946.json.
Comprobacion de lectura exclusivamente: cero comandos GENERATE AC,
verificaciones PIN y envios financieros. No queda habilitado el proveedor
de contexto de consulta ni se declara una transaccion nueva enviada.

Validacion de esta ampliacion: npm run check exitoso, 504 pruebas unitarias
y 110 de integracion (614), formato, lint, tipos, seguridad y build. La
prueba fisica verifica lectura de requisitos; no se declara una trx enviada.

- CARD-IDENTITY-OTHER-PDOL: valores y evidencia aprobados para otras entradas.
- CARD-IDENTITY-NO-PSE: AID/documentacion de tarjetas sin directorio de contacto.
- CARD-IDENTITY-CONTACTLESS: secuencia/perfil especifico antes de extender lectura.
- CARD-PROFILE-STORAGE: catalogo validado, proteccion y asociacion cuenta/entidad.
- CARD-TRANSACTION-SECURITY: generacion nueva PIN/HSM/EMV y reglas ATM; identidad
  leida no desbloquea envio financiero ni produccion.
